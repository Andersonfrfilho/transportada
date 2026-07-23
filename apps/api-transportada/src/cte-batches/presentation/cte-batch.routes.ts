/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_CTE_BATCHES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import {
  parseCreateCteBatchRequest,
  parseCteBatchList,
  parseEmptyJsonRequest,
  parseIdempotencyKey,
  parseUuidPathIdentifier,
} from './cte-batch.schema.js'

const CTE_MANAGE_POLICY = { permission: 'cte.manage', scope: 'company' } as const
const CTE_SUBMIT_POLICY = { permission: 'cte.submit', scope: 'company' } as const

type CteBatchListInput = {
  readonly cursor: string | null
  readonly filters?: {
    readonly createdFrom?: string
    readonly createdUntil?: string
    readonly itemCountEq?: string
    readonly itemCountGt?: string
    readonly itemCountGte?: string
    readonly itemCountLt?: string
    readonly itemCountLte?: string
    readonly itemCountNe?: string
    readonly nameContains?: string
    readonly statusEq?: 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'
    readonly statusNe?: 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'
    readonly updatedFrom?: string
    readonly updatedUntil?: string
    readonly versionEq?: string
    readonly versionGt?: string
    readonly versionGte?: string
    readonly versionLt?: string
    readonly versionLte?: string
    readonly versionNe?: string
  }
  readonly limit: number
}

type CreateCteBatchInput = {
  readonly correlationId: string
  readonly documentIds: readonly string[]
  readonly idempotencyKey: string
  readonly name: string
}

type BatchIdentifierInput = {
  readonly batchId: string
}

type SubmitCteBatchInput = BatchIdentifierInput & {
  readonly correlationId: string
  readonly idempotencyKey: string
}

type CancelCteBatchInput = BatchIdentifierInput & {
  readonly correlationId: string
}

type CteBatchEventsInput = BatchIdentifierInput & CteBatchListInput

type CteBatchSummary = Readonly<Record<string, unknown>>
type WithContext<TInput> = TInput & {
  readonly context: CompanyContext
}

type CteBatchPage = {
  readonly items: readonly CteBatchSummary[]
  readonly nextCursor: string | null
}

type CteBatchEventPage = {
  readonly items: readonly CteBatchSummary[]
  readonly nextCursor: string | null
}

type Dependencies = {
  readonly cteBatches: {
    readonly cancel: (input: WithContext<CancelCteBatchInput>) => Promise<CteBatchSummary>
    readonly create: (input: WithContext<CreateCteBatchInput>) => Promise<CteBatchSummary>
    readonly get: (input: WithContext<BatchIdentifierInput>) => Promise<CteBatchSummary>
    readonly submit: (input: WithContext<SubmitCteBatchInput>) => Promise<CteBatchSummary>
  }
  readonly listBatches: {
    readonly execute: (input: WithContext<CteBatchListInput>) => Promise<CteBatchPage>
  }
  readonly listEvents: {
    readonly execute: (input: WithContext<CteBatchEventsInput>) => Promise<CteBatchEventPage>
  }
}

export function createCteBatchRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<CteBatchListInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listBatches.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: {
            data: page.items.map(serializeBatch),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseCteBatchList(new URL(request.url)),
      pathname: API_CTE_BATCHES_PATH,
      policy: CTE_SUBMIT_POLICY,
    }),
    defineRoute<CreateCteBatchInput>({
      async handle({ context, input }): Promise<Response> {
        const batch = await dependencies.cteBatches.create({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeBatch(batch) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          ...(await parseCreateCteBatchRequest(request)),
        }
      },
      pathname: API_CTE_BATCHES_PATH,
      policy: CTE_MANAGE_POLICY,
    }),
    defineRoute<BatchIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        const batch = await dependencies.cteBatches.get({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeBatch(batch) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_CTE_BATCHES_PATH}/:id`,
      policy: CTE_SUBMIT_POLICY,
    }),
    defineRoute<SubmitCteBatchInput>({
      async handle({ context, input }): Promise<Response> {
        const batch = await dependencies.cteBatches.submit({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeBatch(batch) }, status: 202 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        await parseEmptyJsonRequest(request)
        return {
          batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
        }
      },
      pathname: `${API_CTE_BATCHES_PATH}/:id/submit`,
      policy: CTE_SUBMIT_POLICY,
    }),
    defineRoute<CancelCteBatchInput>({
      async handle({ context, input }): Promise<Response> {
        const batch = await dependencies.cteBatches.cancel({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeBatch(batch) }, status: 200 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        await parseEmptyJsonRequest(request)
        return {
          batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          correlationId,
        }
      },
      pathname: `${API_CTE_BATCHES_PATH}/:id/cancel`,
      policy: CTE_MANAGE_POLICY,
    }),
    defineRoute<CteBatchEventsInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listEvents.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: {
            data: page.items.map(serializeEvent),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters, request }) => ({
        batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ...parseCteBatchList(new URL(request.url)),
      }),
      pathname: `${API_CTE_BATCHES_PATH}/:id/events`,
      policy: CTE_SUBMIT_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeBatch(batch: CteBatchSummary): object {
  return {
    correlationId: batch['correlationId'],
    createdAt: batch['createdAt'],
    id: batch['id'],
    itemCount: batch['itemCount'],
    name: batch['name'],
    status: batch['status'],
    updatedAt: batch['updatedAt'],
    version: batch['version'],
  }
}

function serializeEvent(event: CteBatchSummary): object {
  return {
    batchId: event['batchId'],
    createdAt: event['createdAt'],
    eventName: event['eventName'],
    id: event['id'],
    payload: event['payload'],
  }
}
