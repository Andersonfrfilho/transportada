/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 340: a porta de entrada do parceiro. Duas famílias de rota:
 *
 * - **Administração das chaves** (`/integration-keys`, `settings.manage`): a transportadora cria, lista e revoga. A
 *   chave inteira só aparece na resposta da criação.
 * - **Integração** (`/integration/*`, anônimas no roteador porque a credencial é a chave, não o Keycloak): cotar e
 *   pedir coleta. A empresa vem da chave, nunca do corpo. Cada rota conta o balde por chave além do por IP, e o
 *   pedido nunca devolve dado de contratante, motorista ou viagem.
 */
import { defineAnonymousRoute, defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { RegisteredAnonymousRoute } from '../../http/router.service.js'
import type {
  FreightQuoteByAddressRequest,
  FreightQuoteByAddressResponse,
} from '../../freight-quote/application/freight-quote-by-address.use-case.js'
import { FreightQuoteFuelPriceMissingError } from '../../freight-quote/application/freight-quote.use-case.js'
import {
  freightQuoteFuelPriceMissing,
  freightQuoteInputInvalid,
} from '../../freight-quote/domain/freight-quote.error.js'
import { FreightQuoteInputError } from '../../freight-quote/domain/freight-quote.policy.js'
import {
  parseFreightQuoteByAddressBody,
  type FreightQuoteByAddressBody,
} from '../../freight-quote/presentation/freight-quote.schema.js'
import {
  parseIntegrationPickupRequest,
  parsePickupIdempotencyKey,
  type IntegrationPickupBody,
} from '../../pickup-requests/presentation/pickup-request.schema.js'
import type { PickupRequestRecord } from '../../pickup-requests/application/pickup-request.port.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  IntegrationCaller,
  createAuthenticateIntegrationKeyUseCase,
} from '../application/integration-key.use-case.js'
import type { IntegrationKeyRecord } from '../application/integration-key.port.js'
import { computeQuoteValidUntil } from '../application/integration-api.use-case.js'
import type { IntegrationPickupInput } from '../application/integration-api.use-case.js'
import { parseCreateIntegrationKey } from './integration-api.schema.js'

export const API_INTEGRATION_KEYS_PATH = '/integration-keys'
export const API_INTEGRATION_QUOTES_PATH = '/integration/freight-quotes'
export const API_INTEGRATION_PICKUP_REQUESTS_PATH = '/integration/pickup-requests'

const MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

/** Por IP (antes da chave) e por chave (depois). Os dois no Postgres: valem entre réplicas. */
const QUOTE_LIMIT = {
  ip: { maxRequests: 600, scope: 'integration-quote-ip', windowSeconds: 60 },
  key: { maxRequests: 120, scope: 'integration-quote-key', windowSeconds: 60 },
} as const
const PICKUP_WRITE_LIMIT = {
  ip: { maxRequests: 300, scope: 'integration-pickup-write-ip', windowSeconds: 60 },
  key: { maxRequests: 30, scope: 'integration-pickup-write-key', windowSeconds: 60 },
} as const
const PICKUP_READ_LIMIT = {
  ip: { maxRequests: 600, scope: 'integration-pickup-read-ip', windowSeconds: 60 },
  key: { maxRequests: 120, scope: 'integration-pickup-read-key', windowSeconds: 60 },
} as const

type Ceiling = {
  readonly maxRequests: number
  readonly scope: string
  readonly windowSeconds: number
}
type Bucket = { readonly ip: Ceiling; readonly key: Ceiling }

type Authenticate = ReturnType<typeof createAuthenticateIntegrationKeyUseCase>

type Dependencies = {
  readonly authenticate: Authenticate
  readonly calculate: {
    execute(input: FreightQuoteByAddressRequest): Promise<FreightQuoteByAddressResponse>
  }
  readonly cancelPickup: (input: {
    readonly caller: IntegrationCaller
    readonly correlationId: string
    readonly id: string
  }) => Promise<PickupRequestRecord>
  readonly clock?: () => Date
  readonly createKey: (input: {
    readonly companyId: string
    readonly correlationId: string
    readonly name: string
    readonly scopes: IntegrationKeyRecord['scopes']
    readonly userId: string
  }) => Promise<{ readonly plainKey: string; readonly record: IntegrationKeyRecord }>
  readonly createPickup: (
    input: IntegrationPickupInput,
  ) => Promise<{ readonly created: boolean; readonly record: PickupRequestRecord }>
  readonly getPickup: (input: {
    readonly caller: IntegrationCaller
    readonly id: string
  }) => Promise<PickupRequestRecord>
  readonly listKeys: (input: {
    readonly companyId: string
  }) => Promise<readonly IntegrationKeyRecord[]>
  readonly revokeKey: (input: {
    readonly companyId: string
    readonly correlationId: string
    readonly id: string
    readonly userId: string
  }) => Promise<IntegrationKeyRecord>
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { headers: HEADERS, status })
}

export function createIntegrationKeyAdminRoutes(
  dependencies: Pick<Dependencies, 'createKey' | 'listKeys' | 'revokeKey'>,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{
      readonly correlationId: string
      readonly name: string
      readonly scopes: IntegrationKeyRecord['scopes']
    }>({
      async handle({ context, input }): Promise<Response> {
        const created = await dependencies.createKey({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          name: input.name,
          scopes: input.scopes,
          userId: context.scope.userId,
        })
        // A única vez que a chave inteira sai da API.
        return json({ data: { ...toKeyView(created.record), key: created.plainKey } }, 201)
      },
      method: 'POST',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ...(await parseCreateIntegrationKey(request)),
      }),
      pathname: API_INTEGRATION_KEYS_PATH,
      policy: MANAGE_POLICY,
      rateLimit: {
        maxRequests: 20,
        scope: 'integration-key-create',
        store: 'postgres',
        windowSeconds: 3600,
      },
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const keys = await dependencies.listKeys({ companyId: context.scope.companyId })
        return json({ data: keys.map(toKeyView) }, 200)
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_INTEGRATION_KEYS_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly correlationId: string; readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const revoked = await dependencies.revokeKey({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          id: input.id,
          userId: context.scope.userId,
        })
        return json({ data: toKeyView(revoked) }, 200)
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_INTEGRATION_KEYS_PATH}/:id/revoke`,
      policy: MANAGE_POLICY,
      rateLimit: {
        maxRequests: 60,
        scope: 'integration-key-revoke',
        store: 'postgres',
        windowSeconds: 3600,
      },
    }),
  ]
}

type WithCaller<T> = T & { readonly caller: IntegrationCaller; readonly correlationId: string }

export function createIntegrationRoutes(
  dependencies: Omit<Dependencies, 'createKey' | 'listKeys' | 'revokeKey'>,
): readonly RegisteredAnonymousRoute[] {
  const now = dependencies.clock ?? (() => new Date())
  const limit = (
    bucket: Bucket,
  ): {
    readonly maxRequests: number
    readonly scope: string
    readonly store: 'postgres'
    readonly target: {
      readonly key: (input: { readonly caller: IntegrationCaller }) => string
      readonly maxRequests: number
      readonly scope: string
      readonly windowSeconds: number
    }
    readonly windowSeconds: number
  } => ({
    ...bucket.ip,
    store: 'postgres',
    target: { ...bucket.key, key: (input) => input.caller.keyId },
  })

  return [
    defineAnonymousRoute<WithCaller<{ readonly body: FreightQuoteByAddressBody }>>({
      async handle({ input }): Promise<Response> {
        try {
          const quote = await dependencies.calculate.execute({
            ...input.body,
            companyId: input.caller.companyId,
          })
          // O parceiro vê só o total e a validade: custo, margem e composição ficam com a transportadora.
          return json(
            {
              data: {
                currency: 'BRL',
                total: quote.totalAmount,
                validUntil: computeQuoteValidUntil(now()),
              },
            },
            200,
          )
        } catch (error) {
          if (error instanceof FreightQuoteFuelPriceMissingError)
            throw freightQuoteFuelPriceMissing()
          if (error instanceof FreightQuoteInputError) throw freightQuoteInputInvalid(error.code)
          throw error
        }
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        const caller = await dependencies.authenticate({
          authorization: request.headers.get('authorization'),
          scope: 'quote',
        })
        return { body: await parseFreightQuoteByAddressBody(request), caller, correlationId }
      },
      pathname: API_INTEGRATION_QUOTES_PATH,
      rateLimit: limit(QUOTE_LIMIT),
    }),
    defineAnonymousRoute<
      WithCaller<{ readonly body: IntegrationPickupBody; readonly idempotencyKey: string }>
    >({
      async handle({ input }): Promise<Response> {
        const result = await dependencies.createPickup({
          ...input.body,
          caller: input.caller,
          correlationId: input.correlationId,
          idempotencyKey: input.idempotencyKey,
        })
        return json({ data: toIntegrationView(result.record) }, result.created ? 201 : 200)
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        const caller = await dependencies.authenticate({
          authorization: request.headers.get('authorization'),
          scope: 'pickup',
        })
        return {
          body: await parseIntegrationPickupRequest(request),
          caller,
          correlationId,
          idempotencyKey: parsePickupIdempotencyKey(request.headers.get('idempotency-key')),
        }
      },
      pathname: API_INTEGRATION_PICKUP_REQUESTS_PATH,
      rateLimit: limit(PICKUP_WRITE_LIMIT),
    }),
    defineAnonymousRoute<WithCaller<{ readonly id: string }>>({
      async handle({ input }): Promise<Response> {
        const record = await dependencies.getPickup({ caller: input.caller, id: input.id })
        return json({ data: toIntegrationView(record) }, 200)
      },
      method: 'GET',
      async parse({ correlationId, pathParameters, request }) {
        const caller = await dependencies.authenticate({
          authorization: request.headers.get('authorization'),
          scope: 'pickup',
        })
        return { caller, correlationId, id: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: `${API_INTEGRATION_PICKUP_REQUESTS_PATH}/:id`,
      rateLimit: limit(PICKUP_READ_LIMIT),
    }),
    defineAnonymousRoute<WithCaller<{ readonly id: string }>>({
      async handle({ input }): Promise<Response> {
        const record = await dependencies.cancelPickup({
          caller: input.caller,
          correlationId: input.correlationId,
          id: input.id,
        })
        return json({ data: toIntegrationView(record) }, 200)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const caller = await dependencies.authenticate({
          authorization: request.headers.get('authorization'),
          scope: 'pickup',
        })
        return { caller, correlationId, id: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: `${API_INTEGRATION_PICKUP_REQUESTS_PATH}/:id/cancel`,
      rateLimit: limit(PICKUP_WRITE_LIMIT),
    }),
  ]
}

function toKeyView(record: IntegrationKeyRecord) {
  return {
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    name: record.name,
    prefix: record.keyPrefix,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    scopes: record.scopes,
  }
}

/** O que o parceiro lê do pedido: o estado e as datas. Nada de contratante, viagem ou decisão interna. */
function toIntegrationView(record: PickupRequestRecord) {
  return {
    acceptedWindowEnd: record.acceptedWindowEnd,
    acceptedWindowStart: record.acceptedWindowStart,
    // A nota de recusa é a resposta ao cliente; a de aceite é do escritório e não sai.
    decisionNote: record.status === 'refused' ? record.decisionNote : null,
    expiresAt: record.expiresAt.toISOString(),
    id: record.id,
    kind: record.kind,
    scheduled: record.status === 'scheduled' || record.status === 'done',
    status: record.status,
    windowEnd: record.windowEnd,
    windowStart: record.windowStart,
  }
}
