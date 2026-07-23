/* Copyright (c) 2026 Ada Technology. MIT License. */
export type NfeImportSummary = Readonly<{
  correlationId: string
  createdAt: string
  duplicatedCount: number
  failedCount: number
  id: string
  idempotencyKey: string
  importedCount: number
  invalidCount: number
  processedCount: number
  receivedCount: number
  rejectedCount: number
  source: 'distribution' | 'upload'
  status:
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'partially_processed'
    | 'pending'
    | 'processing'
    | 'queued'
  terminalError: null | Readonly<{
    code: string
    message: string
  }>
  updatedAt: string
  version: string
}>

export type NfeImportListPage = Readonly<{
  items: readonly NfeImportSummary[]
  nextCursor: null | string
}>

export type NfeDocumentListItem = Readonly<{
  accessKey: string
  emitterName: string
  id: string
  issuedAt: string
  recipientName: string
  status: 'authorized' | 'cancelled' | 'denied'
  totalAmount: string
  variant: 'complete' | 'event' | 'summary'
}>

export type NfeDocumentListPage = Readonly<{
  items: readonly NfeDocumentListItem[]
  nextCursor: null | string
}>

export type ImportPollingState = Readonly<{
  enabled: boolean
  intervalMs: null | number
}>

export type RequestUploadInput = Readonly<{
  files: readonly File[]
  idempotencyKey: string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type NfeWorkspaceClient = Readonly<{
  downloadDocumentXml: (input: Readonly<{ id: string }>) => Promise<Blob>
  getImportDetail: (input: Readonly<{ id: string }>) => Promise<NfeImportSummary>
  listDocuments: (
    input: Readonly<{ cursor: null | string; limit: number }>,
  ) => Promise<NfeDocumentListPage>
  listImports: (
    input: Readonly<{ cursor: null | string; limit: number }>,
  ) => Promise<NfeImportListPage>
  reprocessImport: (
    input: Readonly<{ id: string; idempotencyKey: string }>,
  ) => Promise<NfeImportSummary>
  requestDistribution: (input: Readonly<{ idempotencyKey: string }>) => Promise<NfeImportSummary>
  requestUpload: (input: RequestUploadInput) => Promise<NfeImportSummary>
}>

export type NfeWorkspaceClientFactory = (input: ClientDependencies) => NfeWorkspaceClient

const ACTIVE_IMPORT_POLL_INTERVAL_MS = 5_000

function requestError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseCounter(value: unknown): number | null {
  if (!isString(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

function isTerminalError(value: unknown): value is NfeImportSummary['terminalError'] {
  if (value === null) {
    return true
  }
  return isRecord(value) && isString(value.code) && isString(value.message)
}

function isImportStatus(value: unknown): value is NfeImportSummary['status'] {
  return (
    isString(value) &&
    [
      'cancelled',
      'completed',
      'failed',
      'partially_processed',
      'pending',
      'processing',
      'queued',
    ].includes(value)
  )
}

function isDocumentStatus(value: unknown): value is NfeDocumentListItem['status'] {
  return isString(value) && ['authorized', 'cancelled', 'denied'].includes(value)
}

function isDocumentVariant(value: unknown): value is NfeDocumentListItem['variant'] {
  return isString(value) && ['complete', 'event', 'summary'].includes(value)
}

function isNfeImportSummary(value: unknown): value is NfeImportSummary {
  return (
    isRecord(value) &&
    isString(value.correlationId) &&
    isString(value.createdAt) &&
    isNumber(value.duplicatedCount) &&
    isNumber(value.failedCount) &&
    isString(value.id) &&
    isString(value.idempotencyKey) &&
    isNumber(value.importedCount) &&
    isNumber(value.invalidCount) &&
    isNumber(value.processedCount) &&
    isNumber(value.receivedCount) &&
    isNumber(value.rejectedCount) &&
    (value.source === 'distribution' || value.source === 'upload') &&
    isImportStatus(value.status) &&
    isTerminalError(value.terminalError) &&
    isString(value.updatedAt) &&
    isString(value.version)
  )
}

function isNfeDocumentListItem(value: unknown): value is NfeDocumentListItem {
  return (
    isRecord(value) &&
    isString(value.accessKey) &&
    isString(value.emitterName) &&
    isString(value.id) &&
    isString(value.issuedAt) &&
    isString(value.recipientName) &&
    isDocumentStatus(value.status) &&
    isString(value.totalAmount) &&
    isDocumentVariant(value.variant)
  )
}

function envelopeData(value: unknown): unknown {
  if (!isRecord(value) || !('data' in value)) {
    throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
  }
  return value.data
}

function pageNextCursor(value: unknown): null | string {
  if (!isRecord(value) || !isRecord(value.page)) {
    throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
  }
  const nextCursor = value.page.nextCursor
  if (nextCursor !== null && !isString(nextCursor)) {
    throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
  }
  return nextCursor
}

function mapImportSummary(value: unknown): NfeImportSummary {
  if (!isRecord(value) || !isRecord(value.counters)) {
    throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
  }
  const duplicatedCount = parseCounter(value.counters.duplicated)
  const failedCount = parseCounter(value.counters.failed)
  const importedCount = parseCounter(value.counters.imported)
  const invalidCount = parseCounter(value.counters.invalid)
  const processedCount = parseCounter(value.counters.processed)
  const receivedCount = parseCounter(value.counters.received)
  const rejectedCount = parseCounter(value.counters.rejected)
  const mapped = {
    correlationId: value.correlationId,
    createdAt: value.createdAt,
    duplicatedCount,
    failedCount,
    id: value.id,
    idempotencyKey: value.idempotencyKey,
    importedCount,
    invalidCount,
    processedCount,
    receivedCount,
    rejectedCount,
    source: value.source,
    status: value.status,
    terminalError: value.terminalError,
    updatedAt: value.updatedAt,
    version: value.version,
  }
  if (
    mapped.duplicatedCount === null ||
    mapped.failedCount === null ||
    mapped.importedCount === null ||
    mapped.invalidCount === null ||
    mapped.processedCount === null ||
    mapped.receivedCount === null ||
    mapped.rejectedCount === null ||
    !isNfeImportSummary(mapped)
  ) {
    throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
  }
  return mapped
}

function mapImportListPage(value: unknown): NfeImportListPage {
  const data = envelopeData(value)
  if (!Array.isArray(data)) {
    throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
  }
  return {
    items: data.map(mapImportSummary),
    nextCursor: pageNextCursor(value),
  }
}

function mapDocumentListPage(value: unknown): NfeDocumentListPage {
  const data = envelopeData(value)
  if (!Array.isArray(data) || !data.every(isNfeDocumentListItem)) {
    throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
  }
  return {
    items: data,
    nextCursor: pageNextCursor(value),
  }
}

async function getAccessTokenRequest(
  input: Readonly<{
    dependencies: ClientDependencies
    init?: RequestInit
    path: string
  }>,
): Promise<Request> {
  const accessToken = await input.dependencies.getAccessToken()
  const requestHeaders = new Headers(input.init?.headers)
  requestHeaders.set('authorization', `Bearer ${accessToken}`)
  return new Request(`${input.dependencies.apiUrl}${input.path}`, {
    ...input.init,
    cache: 'no-store',
    headers: requestHeaders,
  })
}

async function requestJson(
  input: Readonly<{
    dependencies: ClientDependencies
    init?: RequestInit
    path: string
  }>,
): Promise<unknown> {
  const request = await getAccessTokenRequest(input)
  let response: Response
  try {
    response = await input.dependencies.fetch(request)
  } catch {
    throw requestError('NFE_WORKSPACE_REQUEST_FAILED')
  }
  if (!response.ok) {
    throw requestError('NFE_WORKSPACE_REQUEST_FAILED')
  }
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
  }
}

function searchPath(
  input: Readonly<{ cursor: null | string; limit: number; path: string }>,
): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) {
    search.set('cursor', input.cursor)
  }
  search.set('limit', String(input.limit))
  return `${input.path}?${search.toString()}`
}

export function createImportPollingState(input: {
  readonly activeImport: null | NfeImportSummary
}): ImportPollingState {
  if (
    input.activeImport === null ||
    ['cancelled', 'completed', 'failed', 'partially_processed'].includes(input.activeImport.status)
  ) {
    return { enabled: false, intervalMs: null }
  }

  return { enabled: true, intervalMs: ACTIVE_IMPORT_POLL_INTERVAL_MS }
}

export const createNfeWorkspaceClient: NfeWorkspaceClientFactory = (dependencies) => ({
  async downloadDocumentXml(input) {
    const request = await getAccessTokenRequest({
      dependencies,
      init: {
        headers: { accept: 'application/xml' },
        method: 'GET',
      },
      path: `/nfe-documents/${input.id}/xml`,
    })
    let response: Response
    try {
      response = await dependencies.fetch(request)
    } catch {
      throw requestError('NFE_WORKSPACE_REQUEST_FAILED')
    }
    if (!response.ok) {
      throw requestError('NFE_WORKSPACE_REQUEST_FAILED')
    }
    return response.blob()
  },
  async getImportDetail(input) {
    const response = await requestJson({
      dependencies,
      init: { method: 'GET' },
      path: `/nfe-imports/${input.id}`,
    })
    return mapImportSummary(envelopeData(response))
  },
  async listDocuments(input) {
    const response = await requestJson({
      dependencies,
      init: { method: 'GET' },
      path: searchPath({ ...input, path: '/nfe-documents' }),
    })
    return mapDocumentListPage(response)
  },
  async listImports(input) {
    const response = await requestJson({
      dependencies,
      init: { method: 'GET' },
      path: searchPath({ ...input, path: '/nfe-imports' }),
    })
    return mapImportListPage(response)
  },
  async reprocessImport(input) {
    const response = await requestJson({
      dependencies,
      init: {
        headers: { 'idempotency-key': input.idempotencyKey },
        method: 'POST',
      },
      path: `/nfe-imports/${input.id}/reprocess`,
    })
    return mapImportSummary(envelopeData(response))
  },
  async requestDistribution(input) {
    const response = await requestJson({
      dependencies,
      init: {
        headers: { 'idempotency-key': input.idempotencyKey },
        method: 'POST',
      },
      path: '/nfe-imports/distribution',
    })
    return mapImportSummary(envelopeData(response))
  },
  async requestUpload(input) {
    const body = new FormData()
    input.files.forEach((file) => {
      body.append('files', file)
    })
    const response = await requestJson({
      dependencies,
      init: {
        body,
        headers: { 'idempotency-key': input.idempotencyKey },
        method: 'POST',
      },
      path: '/nfe-imports/xml',
    })
    return mapImportSummary(envelopeData(response))
  },
})
