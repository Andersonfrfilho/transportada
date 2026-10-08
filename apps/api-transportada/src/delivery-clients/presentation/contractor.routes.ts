/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O contratante é cadastro de configuração da operação: ler é `fleet.read` (o roteiro e a viagem
 * consultam), escrever é `settings.manage` — período de fechamento e destinatário do relatório decidem
 * para quem o dinheiro é cobrado. O feriado do município mora em `business-calendar` (spec 238 T1.3).
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_CONTRACTORS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
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
} from '../application/contractor.port.js'
import { ContractorNotFoundError } from '../domain/delivery-client.error.js'

const CONTRACTOR_PATH = `${API_CONTRACTORS_PATH}/:id`
const CONTRACTOR_BY_TAX_ID_PATH = `${API_CONTRACTORS_PATH}/by-tax-id/:taxId`

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

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

export type ContractorRoutesDependencies = {
  readonly createContractor: {
    execute(input: {
      readonly context: CompanyContext
      readonly taxId: string
      readonly values: ContractorWriteInput
    }): Promise<Contractor>
  }
  readonly getByTaxId: {
    execute(input: {
      readonly context: CompanyContext
      readonly taxId: string
    }): Promise<Contractor>
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
