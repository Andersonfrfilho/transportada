/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createCteBatchResponseAdapters } from './cteBatchResponse.validation'

export type CteBatchStatus = 'cancelled' | 'done' | 'draft' | 'error' | 'in_flight' | 'submitted'

export type CteBatchSummary = Readonly<{
  correlationId: string
  createdAt: string
  id: string
  itemCount: number
  name: string
  status: CteBatchStatus
  updatedAt: string
  version: string
}>

export type CteBatchEvent = Readonly<{
  batchId: string
  createdAt: string
  eventName: 'cancelled' | 'created' | 'done' | 'error' | 'in_flight' | 'submitted' | 'updated'
  id: string
  payload: Record<string, unknown>
}>

export type CteBatchListPage = Readonly<{
  items: readonly CteBatchSummary[]
  nextCursor: null | string
}>

export type CteBatchEventListPage = Readonly<{
  items: readonly CteBatchEvent[]
  nextCursor: null | string
}>

export type CteBatchFilters = Readonly<{
  createdFrom?: string
  createdUntil?: string
  itemCountEq?: string
  itemCountGt?: string
  itemCountGte?: string
  itemCountLt?: string
  itemCountLte?: string
  itemCountNe?: string
  nameContains?: string
  statusEq?: CteBatchStatus
  statusNe?: CteBatchStatus
  updatedFrom?: string
  updatedUntil?: string
  versionEq?: string
  versionGt?: string
  versionGte?: string
  versionLt?: string
  versionLte?: string
  versionNe?: string
}>

export type CteBatchCreate = Readonly<{
  documentIds: readonly string[]
  name: string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
  newIdempotencyKey: () => string
  newSubmitIdempotencyKey: () => string
}>

export type CteBatchClient = Readonly<{
  cancelBatch: (batchId: string) => Promise<CteBatchSummary>
  createBatch: (input: CteBatchCreate) => Promise<CteBatchSummary>
  getBatch: (batchId: string) => Promise<CteBatchSummary>
  listBatches: (
    input: Readonly<{ cursor: null | string; filters?: CteBatchFilters; limit: number }>,
  ) => Promise<CteBatchListPage>
  listEvents: (
    input: Readonly<{ batchId: string; cursor: null | string; limit: number }>,
  ) => Promise<CteBatchEventListPage>
  submitBatch: (batchId: string) => Promise<CteBatchSummary>
}>

export type CteBatchClientFactory = (input: ClientDependencies) => CteBatchClient

function requestError(code: string): Error {
  return new Error(code)
}

async function requestJson(
  input: Readonly<{ fetch: ClientDependencies['fetch']; request: Request }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError('CTE_BATCH_REQUEST_FAILED')
  }
  if (!response.ok) throw requestError('CTE_BATCH_REQUEST_FAILED')
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError('CTE_BATCH_RESPONSE_INVALID')
  }
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    idempotencyKey?: string
    method: 'GET' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
  }
  if (input.body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  if (input.idempotencyKey !== undefined) {
    headers['idempotency-key'] = input.idempotencyKey
  }
  const requestInit: RequestInit = {
    cache: 'no-store',
    headers,
    method: input.method,
  }
  if (input.body !== undefined) {
    requestInit.body = input.body
  }
  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readEnvelopeData(input: unknown): unknown {
  if (!isRecord(input) || !('data' in input)) throw requestError('CTE_BATCH_RESPONSE_INVALID')
  return input.data
}

function cleanCreateBatch(input: CteBatchCreate): CteBatchCreate {
  return {
    documentIds: input.documentIds,
    name: input.name,
  }
}

function searchParams(input: Readonly<{ cursor: null | string; limit: number }>): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('limit', String(input.limit))
  return search.toString()
}

function buildBatchSearch(
  input: Readonly<{
    cursor: null | string
    filters?: CteBatchFilters
    limit: number
  }>,
): string {
  const search = new URLSearchParams(searchParams(input))
  const filters = input.filters
  const fields = {
    createdFrom: filters?.createdFrom,
    createdUntil: filters?.createdUntil,
    itemCountEq: filters?.itemCountEq,
    itemCountGt: filters?.itemCountGt,
    itemCountGte: filters?.itemCountGte,
    itemCountLt: filters?.itemCountLt,
    itemCountLte: filters?.itemCountLte,
    itemCountNe: filters?.itemCountNe,
    nameContains: filters?.nameContains,
    statusEq: filters?.statusEq,
    statusNe: filters?.statusNe,
    updatedFrom: filters?.updatedFrom,
    updatedUntil: filters?.updatedUntil,
    versionEq: filters?.versionEq,
    versionGt: filters?.versionGt,
    versionGte: filters?.versionGte,
    versionLt: filters?.versionLt,
    versionLte: filters?.versionLte,
    versionNe: filters?.versionNe,
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value.length > 0) {
      search.set(key, value)
    }
  }
  return search.toString()
}

export const createCteBatchClient: CteBatchClientFactory = (dependencies) => {
  const adapters = createCteBatchResponseAdapters()

  return {
    async cancelBatch(batchId) {
      const response = await authorizedRequest({
        body: JSON.stringify({}),
        dependencies,
        method: 'POST',
        path: `/cte-batches/${batchId}/cancel`,
      })
      try {
        return adapters.batchFromApi(readEnvelopeData(response))
      } catch {
        throw requestError('CTE_BATCH_RESPONSE_INVALID')
      }
    },
    async createBatch(input) {
      const response = await authorizedRequest({
        body: JSON.stringify(cleanCreateBatch(input)),
        dependencies,
        idempotencyKey: dependencies.newIdempotencyKey(),
        method: 'POST',
        path: '/cte-batches',
      })
      try {
        return adapters.batchFromApi(readEnvelopeData(response))
      } catch {
        throw requestError('CTE_BATCH_RESPONSE_INVALID')
      }
    },
    async getBatch(batchId) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `/cte-batches/${batchId}`,
      })
      try {
        return adapters.batchFromApi(readEnvelopeData(response))
      } catch {
        throw requestError('CTE_BATCH_RESPONSE_INVALID')
      }
    },
    async listBatches(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `/cte-batches?${buildBatchSearch(input)}`,
      })
      try {
        return adapters.batchListFromApi(response)
      } catch {
        throw requestError('CTE_BATCH_RESPONSE_INVALID')
      }
    },
    async listEvents(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `/cte-batches/${input.batchId}/events?${searchParams(input)}`,
      })
      try {
        return adapters.eventsFromApi(response)
      } catch {
        throw requestError('CTE_BATCH_RESPONSE_INVALID')
      }
    },
    async submitBatch(batchId) {
      const response = await authorizedRequest({
        body: JSON.stringify({}),
        dependencies,
        idempotencyKey: dependencies.newSubmitIdempotencyKey(),
        method: 'POST',
        path: `/cte-batches/${batchId}/submit`,
      })
      try {
        return adapters.batchFromApi(readEnvelopeData(response))
      } catch {
        throw requestError('CTE_BATCH_RESPONSE_INVALID')
      }
    },
  }
}
