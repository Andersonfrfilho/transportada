/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createCteIssuanceResponseAdapters } from './cteIssuanceResponse.validation'

export type CteIssuanceStatus =
  | 'authorized'
  | 'cancelled'
  | 'failed'
  | 'rejected'
  | 'requested'
  | 'retry_scheduled'

export type CteIssuanceSummary = Readonly<{
  accessKey?: string
  attemptId: string
  batchId: string
  batchItemId: string
  environment: 'homologation'
  protocol?: string
  reasonCause?: string
  reasonCode?: string
  status: CteIssuanceStatus
  updatedAt: string
}>

export type CteIssuanceRequest = Readonly<{
  batchId: string
  requestedAt: string
  status: 'requested'
}>

export type CteIssuanceDocument = Readonly<{
  accessKey: string
  contentType: 'application/xml'
  documentId: string
  downloadUrl: string
  expiresAt: string
  sha256: string
}>

export type CteIssuanceDocumentPage = Readonly<{
  items: readonly CteIssuanceDocument[]
  nextCursor: null | string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type CteIssuanceClient = Readonly<{
  cancelItem: (
    input: Readonly<{
      batchId: string
      batchItemId: string
      idempotencyKey: string
      justification: string
    }>,
  ) => Promise<CteIssuanceRequest>
  getIssuance: (
    input: Readonly<{ batchId: string; batchItemId: string }>,
  ) => Promise<CteIssuanceSummary>
  issueBatch: (
    input: Readonly<{ batchId: string; idempotencyKey: string }>,
  ) => Promise<CteIssuanceRequest>
  listDocuments: (
    input: Readonly<{ batchId: string; batchItemId: string }>,
  ) => Promise<CteIssuanceDocumentPage>
  reprocessItem: (
    input: Readonly<{
      batchId: string
      batchItemId: string
      idempotencyKey: string
      reason: string
    }>,
  ) => Promise<CteIssuanceRequest>
}>

export type CteIssuanceClientFactory = (input: ClientDependencies) => CteIssuanceClient

export const CTE_ISSUANCE_REQUEST_FAILED = 'CTE_ISSUANCE_REQUEST_FAILED'
export const CTE_ISSUANCE_REQUEST_UNCONFIRMED = 'CTE_ISSUANCE_REQUEST_UNCONFIRMED'
export const CTE_ISSUANCE_RESPONSE_INVALID = 'CTE_ISSUANCE_RESPONSE_INVALID'

function requestError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function envelopeData(value: unknown): unknown {
  if (!isRecord(value) || !('data' in value)) throw requestError(CTE_ISSUANCE_RESPONSE_INVALID)
  return value.data
}

/** O envelope `{error:{code}}` da API é o único motivo real da recusa — genérico só como último recurso. */
async function readApiErrorCode(response: Response): Promise<string> {
  let payload: unknown
  try {
    payload = JSON.parse(await response.text())
  } catch {
    return CTE_ISSUANCE_REQUEST_FAILED
  }

  if (!isRecord(payload)) return CTE_ISSUANCE_REQUEST_FAILED
  const error = payload['error']
  if (!isRecord(error)) return CTE_ISSUANCE_REQUEST_FAILED
  const code = error['code']
  return typeof code === 'string' && code !== '' ? code : CTE_ISSUANCE_REQUEST_FAILED
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
  const headers = new Headers({ authorization: `Bearer ${accessToken}` })
  if (input.body !== undefined) headers.set('content-type', 'application/json')
  if (input.idempotencyKey !== undefined) headers.set('idempotency-key', input.idempotencyKey)
  const request = new Request(`${input.dependencies.apiUrl}${input.path}`, {
    cache: 'no-store',
    headers,
    method: input.method,
    ...(input.body === undefined ? {} : { body: input.body }),
  })
  let response: Response
  try {
    response = await input.dependencies.fetch(request)
  } catch {
    // Escrita idempotente sem resposta pode ter sido aplicada: dizer "falhou" seria inventar o fato.
    throw requestError(
      input.method === 'POST' ? CTE_ISSUANCE_REQUEST_UNCONFIRMED : CTE_ISSUANCE_REQUEST_FAILED,
    )
  }
  if (!response.ok) throw requestError(await readApiErrorCode(response))
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError(CTE_ISSUANCE_RESPONSE_INVALID)
  }
}

export const createCteIssuanceClient: CteIssuanceClientFactory = (dependencies) => {
  const adapters = createCteIssuanceResponseAdapters()

  return {
    async cancelItem(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ justification: input.justification }),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `/cte-batches/${input.batchId}/items/${input.batchItemId}/cancel`,
      })
      return adapters.requestFromApi(envelopeData(response))
    },
    async getIssuance(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `/cte-batches/${input.batchId}/items/${input.batchItemId}/issuance`,
      })
      return adapters.issuanceFromApi(response)
    },
    async issueBatch(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({}),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `/cte-batches/${input.batchId}/issue`,
      })
      return adapters.requestFromApi(envelopeData(response))
    },
    async listDocuments(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `/cte-batches/${input.batchId}/items/${input.batchItemId}/documents`,
      })
      return adapters.documentPageFromApi(response)
    },
    async reprocessItem(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ reason: input.reason }),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `/cte-batches/${input.batchId}/items/${input.batchItemId}/reprocess`,
      })
      return adapters.requestFromApi(envelopeData(response))
    },
  }
}
