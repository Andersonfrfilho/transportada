/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.3 (RF21 a RF23): rota de leitura da previsão e do fora do padrão, e a do limite configurável por empresa.
 * Leitura pede `expenses.read`; trocar o limite pede `expenses.manage` e é auditado. `companyId` e o autor vêm só do
 * contexto autenticado (CA10); um `companyId` na query é aceito e ignorado.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { invalidRequest, parseBody } from '../../http/request-parsing.service.js'
import {
  API_EXPENSE_FORECAST_PATH,
  API_EXPENSE_OUT_OF_PATTERN_SETTINGS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ExpenseForecastInput,
  ExpenseForecastOutput,
} from '../application/expense-forecast.use-case.js'

const READ_POLICY = { permission: 'expenses.read', scope: 'company' } as const
const MANAGE_POLICY = { permission: 'expenses.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const MIN_MONTH = '2000-01'
const MAX_MONTH = '2999-12'

type UseCase<Input, Output> = { execute(input: Input): Promise<Output> }

export type ExpenseForecastRoutesDependencies = {
  readonly getForecast: UseCase<ExpenseForecastInput, ExpenseForecastOutput>
  readonly getSettings: UseCase<{ companyId: string }, number>
  /** Hora do cálculo e, sem `month`, o mês corrente (America/Sao_Paulo). */
  readonly now?: () => Date
  readonly updateSettings: UseCase<
    { companyId: string; correlationId?: string; thresholdPercent: number; updatedBy: string },
    number
  >
}

/** Limite em pontos percentuais: de 0 a 1000, até duas casas (a regra da T6.2 recusa o resto). */
const settingsSchema = z
  .object({
    thresholdPercent: z
      .number()
      .min(0)
      .max(1000)
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6),
  })
  .strict()

function currentMonth(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  })
    .format(now)
    .slice(0, 7)
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status: 200 })
}

export function createExpenseForecastRoutes(
  dependencies: ExpenseForecastRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const now = dependencies.now ?? ((): Date => new Date())
  return [
    defineRoute<{ readonly month: string }>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.getForecast.execute({
          companyId: context.scope.companyId,
          month: input.month,
        })
        return jsonResponse({ calculatedAt: now().toISOString(), data })
      },
      method: 'GET',
      parse: ({ request }) => {
        const url = new URL(request.url)
        for (const key of url.searchParams.keys()) {
          if (key !== 'month' && key !== 'companyId') throw invalidRequest()
        }
        const month = url.searchParams.get('month') ?? currentMonth(now())
        if (!MONTH_PATTERN.test(month) || month < MIN_MONTH || month > MAX_MONTH) {
          throw invalidRequest()
        }
        return { month }
      },
      pathname: API_EXPENSE_FORECAST_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const thresholdPercent = await dependencies.getSettings.execute({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: { thresholdPercent } })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_EXPENSE_OUT_OF_PATTERN_SETTINGS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{ readonly correlationId: string; readonly thresholdPercent: number }>({
      async handle({ context, input }): Promise<Response> {
        const thresholdPercent = await dependencies.updateSettings.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          thresholdPercent: input.thresholdPercent,
          updatedBy: context.scope.userId,
        })
        return jsonResponse({ data: { thresholdPercent } })
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => {
        const body = await parseBody(settingsSchema, request)
        return { correlationId, thresholdPercent: body.thresholdPercent }
      },
      pathname: API_EXPENSE_OUT_OF_PATTERN_SETTINGS_PATH,
      policy: MANAGE_POLICY,
    }),
  ]
}
