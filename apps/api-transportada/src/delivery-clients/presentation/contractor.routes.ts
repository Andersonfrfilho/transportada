/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O contratante e o feriado do município são cadastro de configuração da operação: ler é
 * `fleet.read` (o roteiro e a viagem consultam), escrever é `settings.manage` — período de
 * fechamento e destinatário do relatório decidem para quem o dinheiro é cobrado.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_CONTRACTORS_PATH,
  API_MUNICIPAL_HOLIDAYS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import {
  CONTRACTOR_CLOSING_PERIODS,
  DELIVERY_CLIENT_STATUSES,
} from '../../database/delivery-client.schema.js'
import { buildTaxIdSchema } from '../../shared/tax-id.schema.js'
import { normalizeTaxId, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import type {
  Contractor,
  ContractorListFilters,
  ContractorPage,
  ContractorWriteInput,
  MunicipalHoliday,
} from '../application/contractor.port.js'
import { ContractorNotFoundError } from '../domain/delivery-client.error.js'

const CONTRACTOR_PATH = `${API_CONTRACTORS_PATH}/:id`
const CONTRACTOR_BY_TAX_ID_PATH = `${API_CONTRACTORS_PATH}/by-tax-id/:taxId`
const HOLIDAY_PATH = `${API_MUNICIPAL_HOLIDAYS_PATH}/:id`

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u
const CITY_PATTERN = /^[0-9]{7}$/u
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

const contractorWriteSchema = z
  .object({
    closingPeriod: z.enum(CONTRACTOR_CLOSING_PERIODS).optional(),
    displayName: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    /** Vazio é lote que se exporta à mão — e é o padrão, não erro. */
    reportEmail: z.union([z.literal(''), z.string().trim().email()]).optional(),
    status: z.enum(DELIVERY_CLIENT_STATUSES).optional(),
  })
  .strict()

const contractorCreateSchema = contractorWriteSchema
  .extend({ taxId: buildTaxIdSchema(TAX_ID_PATTERN) })
  .strict()

const holidaySchema = z
  .object({
    cityIbgeCode: z.string().regex(CITY_PATTERN),
    holidayOn: z.string().regex(DATE_PATTERN),
    name: z.string().trim().min(1).max(120),
  })
  .strict()

export type ContractorRoutesDependencies = {
  readonly createContractor: {
    execute(input: {
      readonly context: CompanyContext
      readonly taxId: string
      readonly values: ContractorWriteInput
    }): Promise<Contractor>
  }
  readonly getByTaxId: {
    execute(input: { readonly context: CompanyContext; readonly taxId: string }): Promise<Contractor>
  }
  readonly getContractor: {
    execute(input: { readonly context: CompanyContext; readonly id: string }): Promise<Contractor>
  }
  readonly listContractors: {
    execute(input: {
      readonly context: CompanyContext
      readonly filters: ContractorListFilters
    }): Promise<ContractorPage>
  }
  readonly listHolidays: {
    execute(input: {
      readonly cityIbgeCode?: string
      readonly context: CompanyContext
      readonly from?: string
      readonly to?: string
    }): Promise<readonly MunicipalHoliday[]>
  }
  readonly removeHoliday: {
    execute(input: { readonly context: CompanyContext; readonly id: string }): Promise<void>
  }
  readonly saveHoliday: {
    execute(input: {
      readonly cityIbgeCode: string
      readonly context: CompanyContext
      readonly holidayOn: string
      readonly name: string
    }): Promise<MunicipalHoliday>
  }
  readonly updateContractor: {
    execute(input: {
      readonly context: CompanyContext
      readonly id: string
      readonly values: ContractorWriteInput
    }): Promise<Contractor>
  }
}

export function createContractorRoutes(
  dependencies: ContractorRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly filters: ContractorListFilters }>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listContractors.execute({
          context: context.scope,
          filters: input.filters,
        })

        return jsonResponse({
          body: { data: page.items, page: { nextCursor: page.nextCursor } },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => ({ filters: parseContractorList(new URL(request.url)) }),
      pathname: API_CONTRACTORS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{ readonly taxId: string }>({
      async handle({ context, input }): Promise<Response> {
        const contractor = await dependencies.getByTaxId.execute({
          context: context.scope,
          taxId: input.taxId,
        })

        return jsonResponse({ body: { data: contractor }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ taxId: parseTaxIdPath(pathParameters.taxId ?? '') }),
      pathParameterFormat: 'opaque',
      pathname: CONTRACTOR_BY_TAX_ID_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const contractor = await dependencies.getContractor.execute({
          context: context.scope,
          id: input.id,
        })

        return jsonResponse({ body: { data: contractor }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ id: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: CONTRACTOR_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{ readonly taxId: string; readonly values: ContractorWriteInput }>({
      async handle({ context, input }): Promise<Response> {
        const contractor = await dependencies.createContractor.execute({
          context: context.scope,
          taxId: input.taxId,
          values: input.values,
        })

        return jsonResponse({ body: { data: contractor }, status: 201 })
      },
      method: 'POST',
      async parse({ request }) {
        const { taxId, ...values } = await parseBody(contractorCreateSchema, request)
        return { taxId, values: withoutUndefined(values) }
      },
      pathname: API_CONTRACTORS_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string; readonly values: ContractorWriteInput }>({
      async handle({ context, input }): Promise<Response> {
        const contractor = await dependencies.updateContractor.execute({
          context: context.scope,
          id: input.id,
          values: input.values,
        })

        return jsonResponse({ body: { data: contractor }, status: 200 })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        return {
          id: parseUuidPathIdentifier(pathParameters.id ?? ''),
          values: withoutUndefined(await parseBody(contractorWriteSchema, request)),
        }
      },
      pathname: CONTRACTOR_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{
      readonly cityIbgeCode?: string
      readonly from?: string
      readonly to?: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const holidays = await dependencies.listHolidays.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: holidays }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => parseHolidayFilters(new URL(request.url)),
      pathname: API_MUNICIPAL_HOLIDAYS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<z.infer<typeof holidaySchema>>({
      async handle({ context, input }): Promise<Response> {
        const holiday = await dependencies.saveHoliday.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: holiday }, status: 201 })
      },
      method: 'POST',
      parse: ({ request }) => parseBody(holidaySchema, request),
      pathname: API_MUNICIPAL_HOLIDAYS_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.removeHoliday.execute({ context: context.scope, id: input.id })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({ id: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: HOLIDAY_PATH,
      policy: MANAGE_POLICY,
    }),
  ]
}

function parseContractorList(url: URL): ContractorListFilters {
  const parameters = url.searchParams
  const cursor = parameters.get('cursor')
  const nameContains = parameters.get('nameContains')
  const status = parameters.get('status')

  return {
    ...(cursor === null ? {} : { cursor }),
    limit:
      parameters.get('limit') === null
        ? DEFAULT_LIMIT
        : z.coerce.number().int().min(1).max(MAX_LIMIT).parse(parameters.get('limit')),
    ...(nameContains === null || nameContains.trim().length === 0
      ? {}
      : { nameContains: nameContains.trim() }),
    ...(status === null ? {} : { status: z.enum(DELIVERY_CLIENT_STATUSES).parse(status) }),
  }
}

function parseHolidayFilters(url: URL): {
  readonly cityIbgeCode?: string
  readonly from?: string
  readonly to?: string
} {
  const parameters = url.searchParams
  const cityIbgeCode = parameters.get('cityIbgeCode')
  const from = parameters.get('from')
  const to = parameters.get('to')

  return {
    ...(cityIbgeCode === null ? {} : { cityIbgeCode: z.string().regex(CITY_PATTERN).parse(cityIbgeCode) }),
    ...(from === null ? {} : { from: z.string().regex(DATE_PATTERN).parse(from) }),
    ...(to === null ? {} : { to: z.string().regex(DATE_PATTERN).parse(to) }),
  }
}

/** Documento fora de forma é ausência: quem digitou errado procurou o que não existe. */
function parseTaxIdPath(raw: string): string {
  const taxId = normalizeTaxId(decodeURIComponent(raw))
  if (!TAX_ID_PATTERN.test(taxId)) throw new ContractorNotFoundError()
  return taxId
}

/** `exactOptionalPropertyTypes`: chave ausente e chave com `undefined` dizem coisas diferentes. */
function withoutUndefined(values: Readonly<Record<string, unknown>>): ContractorWriteInput {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as ContractorWriteInput
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
