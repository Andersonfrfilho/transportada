/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 339: o pedido de coleta/entrega. O portal pede e cancela por `/client/me/pickup-requests`
 * (`pickup.request`, o servidor resolve o contratante pela sessão — nenhum id de cliente no corpo); o
 * escritório lê, decide e encaixa por `/pickup-requests` (`pickup.manage`). A serialização é campo a
 * campo: nenhum id de usuário, de viagem ou de contratante sai para o portal.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import {
  API_CLIENT_PICKUP_REQUESTS_PATH,
  API_PICKUP_REQUESTS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  CreatePickupRequestInput,
  DecidePickupRequestInput,
  PickupRequestDetail,
} from '../application/pickup-request.use-case.js'
import type { PickupRequestRecord } from '../application/pickup-request.port.js'
import {
  parseAcceptPickupRequest,
  parseCreatePickupRequest,
  parsePickupIdempotencyKey,
  parsePickupRequestListQuery,
  parseRefusePickupRequest,
  parseSchedulePickupRequest,
} from './pickup-request.schema.js'

const REQUEST_POLICY = { permission: 'pickup.request', scope: 'company' } as const
const MANAGE_POLICY = { permission: 'pickup.manage', scope: 'company' } as const
const HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

/** Pedir é raro e grava; o balde é por usuário no Postgres, entre réplicas. */
const CREATE_RATE_LIMIT = {
  maxRequests: 10,
  scope: 'pickup-request-create',
  store: 'postgres',
  windowSeconds: 3600,
} as const

const READ_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'pickup-request-read',
  store: 'postgres',
  windowSeconds: 300,
} as const

type Dependencies = {
  readonly accept: (input: DecidePickupRequestInput) => Promise<PickupRequestDetail>
  readonly cancel: (input: {
    readonly context: CompanyContext
    readonly correlationId: string
    readonly id: string
  }) => Promise<PickupRequestRecord>
  readonly create: (
    input: CreatePickupRequestInput,
  ) => Promise<{ readonly created: boolean; readonly record: PickupRequestRecord }>
  readonly get: (input: {
    readonly companyId: string
    readonly id: string
  }) => Promise<PickupRequestDetail>
  readonly listForContractor: (input: {
    readonly context: CompanyContext
  }) => Promise<readonly PickupRequestRecord[]>
  readonly listForOffice: (input: {
    readonly companyId: string
    readonly status: PickupRequestRecord['status'] | undefined
  }) => Promise<readonly PickupRequestRecord[]>
  readonly refuse: (
    input: DecidePickupRequestInput & { readonly note: string },
  ) => Promise<PickupRequestRecord>
  readonly schedule: (input: {
    readonly context: CompanyContext
    readonly correlationId: string
    readonly id: string
    readonly tripId: string
  }) => Promise<PickupRequestRecord>
}

export function createPickupRequestRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    // ---- Portal do cliente ----
    defineRoute<Omit<CreatePickupRequestInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.create({ ...input, context: context.scope })
        return json({ data: toClientView(result.record) }, result.created ? 201 : 200)
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return {
          correlationId,
          idempotencyKey: parsePickupIdempotencyKey(request.headers.get('idempotency-key')),
          ...(await parseCreatePickupRequest(request)),
        }
      },
      pathname: API_CLIENT_PICKUP_REQUESTS_PATH,
      policy: REQUEST_POLICY,
      rateLimit: CREATE_RATE_LIMIT,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const records = await dependencies.listForContractor({ context: context.scope })
        return json({ data: records.map(toClientView) }, 200)
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_CLIENT_PICKUP_REQUESTS_PATH,
      policy: REQUEST_POLICY,
      rateLimit: READ_RATE_LIMIT,
    }),
    defineRoute<{ readonly correlationId: string; readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const record = await dependencies.cancel({ context: context.scope, ...input })
        return json({ data: toClientView(record) }, 200)
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_CLIENT_PICKUP_REQUESTS_PATH}/:id/cancel`,
      policy: REQUEST_POLICY,
      rateLimit: CREATE_RATE_LIMIT,
    }),
    // ---- Escritório ----
    defineRoute<{ readonly status: PickupRequestRecord['status'] | undefined }>({
      async handle({ context, input }): Promise<Response> {
        const records = await dependencies.listForOffice({
          companyId: context.scope.companyId,
          status: input.status,
        })
        return json({ data: records.map(toOfficeView) }, 200)
      },
      method: 'GET',
      parse: ({ request }) => parsePickupRequestListQuery(new URL(request.url)),
      pathname: API_PICKUP_REQUESTS_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const detail = await dependencies.get({ companyId: context.scope.companyId, id: input.id })
        return json({ data: toDetailView(detail) }, 200)
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ id: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: `${API_PICKUP_REQUESTS_PATH}/:id`,
      policy: MANAGE_POLICY,
    }),
    defineRoute<Omit<DecidePickupRequestInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const detail = await dependencies.accept({ ...input, context: context.scope })
        return json({ data: toDetailView(detail) }, 200)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        return {
          correlationId,
          id: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(await parseAcceptPickupRequest(request)),
        }
      },
      pathname: `${API_PICKUP_REQUESTS_PATH}/:id/accept`,
      policy: MANAGE_POLICY,
    }),
    defineRoute<Omit<DecidePickupRequestInput, 'context'> & { readonly note: string }>({
      async handle({ context, input }): Promise<Response> {
        const record = await dependencies.refuse({
          ...input,
          acceptedTotalAmount: null,
          acceptedWindowEnd: null,
          acceptedWindowStart: null,
          context: context.scope,
        })
        return json({ data: toOfficeView(record) }, 200)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        return {
          acceptedTotalAmount: null,
          acceptedWindowEnd: null,
          acceptedWindowStart: null,
          correlationId,
          id: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(await parseRefusePickupRequest(request)),
        }
      },
      pathname: `${API_PICKUP_REQUESTS_PATH}/:id/refuse`,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly correlationId: string; readonly id: string; readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const record = await dependencies.schedule({ context: context.scope, ...input })
        return json({ data: toOfficeView(record) }, 200)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        return {
          correlationId,
          id: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(await parseSchedulePickupRequest(request)),
        }
      },
      pathname: `${API_PICKUP_REQUESTS_PATH}/:id/schedule`,
      policy: MANAGE_POLICY,
    }),
  ]
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { headers: HEADERS, status })
}

/** O que o cliente enxerga: nada de id de usuário, de viagem ou de contratante, e nada de preço interno. */
function toClientView(record: PickupRequestRecord): Record<string, unknown> {
  return {
    accessNotes: record.accessNotes,
    acceptedWindowEnd: record.acceptedWindowEnd,
    acceptedWindowStart: record.acceptedWindowStart,
    cargoValue: record.cargoValue,
    destinationContactName: record.destinationContactName,
    destinationContactPhone: record.destinationContactPhone,
    originContactName: record.originContactName,
    originContactPhone: record.originContactPhone,
    cargoDescription: record.cargoDescription,
    createdAt: record.createdAt.toISOString(),
    decisionNote: record.status === 'refused' ? record.decisionNote : null,
    destination: record.destination,
    expiresAt: record.expiresAt.toISOString(),
    id: record.id,
    kind: record.kind,
    origin: record.origin,
    scheduled: record.status === 'scheduled' || record.status === 'done',
    status: record.status,
    volumes: record.volumes,
    weightKg: record.weightKg,
    windowEnd: record.windowEnd,
    windowStart: record.windowStart,
  }
}

function toOfficeView(record: PickupRequestRecord): Record<string, unknown> {
  return {
    ...toClientView(record),
    acceptedTotalAmount: record.acceptedTotalAmount,
    contractorId: record.contractorId,
    decisionNote: record.decisionNote,
    note: record.note,
    quotedTotalAmount: record.quotedTotalAmount,
    quoteValidUntil: record.quoteValidUntil,
    requesterEmail: record.requesterEmail,
    requesterName: record.requesterName,
    requesterPhone: record.requesterPhone,
    requesterTaxId: record.requesterTaxId,
    source: record.source,
    tripId: record.tripId,
  }
}

function toDetailView(detail: PickupRequestDetail): Record<string, unknown> {
  return {
    request: toOfficeView(detail.record),
    suggestion:
      detail.suggestion === null
        ? null
        : {
            canCreateNewTrip: detail.suggestion.canCreateNewTrip,
            trips: detail.suggestion.trips.map((trip) => ({
              createdAt: trip.createdAt.toISOString(),
              id: trip.id,
              status: trip.status,
              stopCount: trip.stopCount,
            })),
          },
  }
}
