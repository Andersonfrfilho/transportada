/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.5: rotas de leitura do resultado, do custo por km (RF17) e da configuração de rateio. Leitura pede
 * `expenses.read`; trocar o critério pede `expenses.manage`. `companyId` e o autor vêm só do contexto autenticado.
 */
import { z } from 'zod'

import {
  COMPANY_EXPENSE_ALLOCATABLE_GROUPS,
  COMPANY_EXPENSE_ALLOCATION_CRITERIA,
} from '../../database/company-expense.schema.js'
import { defineRoute } from '../../http/router.service.js'
import { invalidRequest, parseBody } from '../../http/request-parsing.service.js'
import {
  API_EXPENSE_ALLOCATION_SETTINGS_PATH,
  API_EXPENSE_RESULT_EXPORT_PATH,
  API_EXPENSE_RESULT_PATH,
  API_EXPENSE_UNIT_COSTS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ExportedExpenseResult,
  ExportExpenseResultInput,
} from '../application/expense-result-export.use-case.js'
import type { ExpenseResult, ExpenseResultInput } from '../application/expense-result.use-case.js'
import {
  EXPENSE_RESULT_FILTER_KEYS,
  NO_CUSTOMER_ID,
  NO_VEHICLE_ID,
  type ExpenseResultFilters,
} from '../domain/expense-result-filters.policy.js'
import type {
  AllocatableCostGroup,
  AllocationCriterion,
} from '../domain/expense-allocation.policy.js'
import { isCivilDate } from '../domain/expense-money.policy.js'

const READ_POLICY = { permission: 'expenses.read', scope: 'company' } as const
const MANAGE_POLICY = { permission: 'expenses.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }
/** Um ano de viagens e contas por consulta: o resultado lê tudo do período e o rateio é feito sobre ele inteiro. */
const MAX_PERIOD_DAYS = 366

type UseCase<Input, Output> = { execute(input: Input): Promise<Output> }
type SettingsMap = Readonly<Record<AllocatableCostGroup, AllocationCriterion>>
type WithCorrelation<T> = T & { readonly correlationId: string }

export type ExpenseResultRoutesDependencies = {
  readonly exportResult: UseCase<ExportExpenseResultInput, ExportedExpenseResult>
  readonly getResult: UseCase<ExpenseResultInput, ExpenseResult>
  readonly getSettings: UseCase<{ companyId: string }, SettingsMap>
  readonly getUnitCosts: UseCase<ExpenseResultInput, unknown>
  /** Hora do cálculo que a tela e a exportação mostram (ADR-0116 §4). */
  readonly now?: () => Date
  readonly updateSettings: UseCase<
    {
      companyId: string
      correlationId?: string
      settings: Partial<SettingsMap>
      updatedBy: string
    },
    SettingsMap
  >
}

const settingsSchema = z
  .object({
    settings: z
      .object(
        Object.fromEntries(
          COMPANY_EXPENSE_ALLOCATABLE_GROUPS.map((group) => [
            group,
            z.enum(COMPANY_EXPENSE_ALLOCATION_CRITERIA).optional(),
          ]),
        ),
      )
      .strict(),
  })
  .strict()

/**
 * `?from=yyyy-mm-dd&to=yyyy-mm-dd`, os dois obrigatórios, até 366 dias; chave desconhecida é 400. Um `companyId` na query
 * é aceito e ignorado (CA10): a empresa é a do contexto autenticado, nunca a do cliente.
 */
function parsePeriod(
  url: URL,
  extraKeys: readonly string[] = [],
): { readonly from: string; readonly to: string } {
  for (const key of url.searchParams.keys()) {
    if (key !== 'from' && key !== 'to' && key !== 'companyId' && !extraKeys.includes(key)) {
      throw invalidRequest()
    }
  }
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (from === null || to === null || !isCivilDate(from) || !isCivilDate(to) || from > to) {
    throw invalidRequest()
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  if (days >= MAX_PERIOD_DAYS) throw invalidRequest()
  return { from, to }
}

const UUID = z.string().uuid()
const FILTER_SCHEMAS: Record<(typeof EXPENSE_RESULT_FILTER_KEYS)[number], z.ZodType<string>> = {
  categoryId: UUID,
  customerId: z.union([UUID, z.literal(NO_CUSTOMER_ID)]),
  payeeDriverId: UUID,
  vehicleId: z.union([UUID, z.literal(NO_VEHICLE_ID)]),
}

/** Filtros do painel (RF18): chave desconhecida ou valor que não é id é 400; vazio é "sem filtro". */
function parseFilters(url: URL): ExpenseResultFilters {
  const filters: Record<string, string> = {}
  for (const key of EXPENSE_RESULT_FILTER_KEYS) {
    const value = url.searchParams.get(key)
    if (value === null || value === '') continue
    if (!FILTER_SCHEMAS[key].safeParse(value).success) throw invalidRequest()
    filters[key] = value
  }
  return filters
}

const FILTER_QUERY_KEYS: readonly string[] = [...EXPENSE_RESULT_FILTER_KEYS]

export function createExpenseResultRoutes(
  dependencies: ExpenseResultRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const now = dependencies.now ?? ((): Date => new Date())
  return [
    defineRoute<{
      readonly filters: ExpenseResultFilters
      readonly from: string
      readonly to: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const { filters, ...period } = input
        const data = await dependencies.getResult.execute({
          companyId: context.scope.companyId,
          ...(Object.keys(filters).length === 0 ? {} : { filters }),
          ...period,
        })
        return jsonResponse({ calculatedAt: now().toISOString(), data })
      },
      method: 'GET',
      parse: ({ request }) => {
        const url = new URL(request.url)
        return { ...parsePeriod(url, FILTER_QUERY_KEYS), filters: parseFilters(url) }
      },
      pathname: API_EXPENSE_RESULT_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly filters: ExpenseResultFilters
      readonly format: 'csv' | 'pdf'
      readonly from: string
      readonly to: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const { filters, ...rest } = input
        const exported = await dependencies.exportResult.execute({
          companyId: context.scope.companyId,
          ...(Object.keys(filters).length === 0 ? {} : { filters }),
          userId: context.scope.userId,
          ...rest,
        })
        return new Response(exported.body, {
          headers: {
            'cache-control': 'no-store',
            'content-disposition': `attachment; filename="${exported.fileName}"`,
            'content-type': exported.contentType,
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ correlationId, request }) => {
        const url = new URL(request.url)
        const format = url.searchParams.get('format')
        if (format !== 'csv' && format !== 'pdf') throw invalidRequest()
        return {
          correlationId,
          ...parsePeriod(url, [...FILTER_QUERY_KEYS, 'format']),
          filters: parseFilters(url),
          format,
        }
      },
      pathname: API_EXPENSE_RESULT_EXPORT_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{ readonly from: string; readonly to: string }>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.getUnitCosts.execute({
          companyId: context.scope.companyId,
          ...input,
        })
        return jsonResponse({ calculatedAt: now().toISOString(), data })
      },
      method: 'GET',
      parse: ({ request }) => parsePeriod(new URL(request.url)),
      pathname: API_EXPENSE_UNIT_COSTS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const data = await dependencies.getSettings.execute({ companyId: context.scope.companyId })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_EXPENSE_ALLOCATION_SETTINGS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<WithCorrelation<{ readonly settings: Partial<SettingsMap> }>>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.updateSettings.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          settings: input.settings,
          updatedBy: context.scope.userId,
        })
        return jsonResponse({ data })
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => {
        const body = await parseBody(settingsSchema, request)
        const settings = Object.fromEntries(
          Object.entries(body.settings).filter(([, value]) => value !== undefined),
        ) as Partial<SettingsMap>
        if (Object.keys(settings).length === 0) throw invalidRequest()
        return { correlationId, settings }
      },
      pathname: API_EXPENSE_ALLOCATION_SETTINGS_PATH,
      policy: MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status })
}
