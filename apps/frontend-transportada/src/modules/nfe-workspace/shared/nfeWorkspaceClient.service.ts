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

export type NfeImportFilters = Readonly<{
  correlationIdEq?: string
  correlationIdNe?: string
  createdFrom?: string
  createdUntil?: string
  duplicatedCountEq?: string
  duplicatedCountGt?: string
  duplicatedCountGte?: string
  duplicatedCountLt?: string
  duplicatedCountLte?: string
  duplicatedCountNe?: string
  failedCountEq?: string
  failedCountGt?: string
  failedCountGte?: string
  failedCountLt?: string
  failedCountLte?: string
  failedCountNe?: string
  idEq?: string
  idNe?: string
  importedCountEq?: string
  importedCountGt?: string
  importedCountGte?: string
  importedCountLt?: string
  importedCountLte?: string
  importedCountNe?: string
  invalidCountEq?: string
  invalidCountGt?: string
  invalidCountGte?: string
  invalidCountLt?: string
  invalidCountLte?: string
  invalidCountNe?: string
  processedCountEq?: string
  processedCountGt?: string
  processedCountGte?: string
  processedCountLt?: string
  processedCountLte?: string
  processedCountNe?: string
  receivedCountEq?: string
  receivedCountGt?: string
  receivedCountGte?: string
  receivedCountLt?: string
  receivedCountLte?: string
  receivedCountNe?: string
  rejectedCountEq?: string
  rejectedCountGt?: string
  rejectedCountGte?: string
  rejectedCountLt?: string
  rejectedCountLte?: string
  rejectedCountNe?: string
  requestedByUserIdEq?: string
  requestedByUserIdNe?: string
  sourceEq?: NfeImportSummary['source']
  sourceNe?: NfeImportSummary['source']
  statusEq?: NfeImportSummary['status']
  statusNe?: NfeImportSummary['status']
  updatedFrom?: string
  updatedUntil?: string
  versionEq?: string
  versionGt?: string
  versionGte?: string
  versionLt?: string
  versionLte?: string
  versionNe?: string
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
    input: Readonly<{ cursor: null | string; filters?: NfeImportFilters; limit: number }>,
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

function buildImportSearchPath(
  input: Readonly<{ cursor: null | string; filters?: NfeImportFilters; limit: number }>,
): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) {
    search.set('cursor', input.cursor)
  }
  search.set('limit', String(input.limit))
  const filters = input.filters
  const fields = {
    correlationIdEq: filters?.correlationIdEq,
    correlationIdNe: filters?.correlationIdNe,
    createdFrom: filters?.createdFrom,
    createdUntil: filters?.createdUntil,
    duplicatedCountEq: filters?.duplicatedCountEq,
    duplicatedCountGt: filters?.duplicatedCountGt,
    duplicatedCountGte: filters?.duplicatedCountGte,
    duplicatedCountLt: filters?.duplicatedCountLt,
    duplicatedCountLte: filters?.duplicatedCountLte,
    duplicatedCountNe: filters?.duplicatedCountNe,
    failedCountEq: filters?.failedCountEq,
    failedCountGt: filters?.failedCountGt,
    failedCountGte: filters?.failedCountGte,
    failedCountLt: filters?.failedCountLt,
    failedCountLte: filters?.failedCountLte,
    failedCountNe: filters?.failedCountNe,
    idEq: filters?.idEq,
    idNe: filters?.idNe,
    importedCountEq: filters?.importedCountEq,
    importedCountGt: filters?.importedCountGt,
    importedCountGte: filters?.importedCountGte,
    importedCountLt: filters?.importedCountLt,
    importedCountLte: filters?.importedCountLte,
    importedCountNe: filters?.importedCountNe,
    invalidCountEq: filters?.invalidCountEq,
    invalidCountGt: filters?.invalidCountGt,
    invalidCountGte: filters?.invalidCountGte,
    invalidCountLt: filters?.invalidCountLt,
    invalidCountLte: filters?.invalidCountLte,
    invalidCountNe: filters?.invalidCountNe,
    processedCountEq: filters?.processedCountEq,
    processedCountGt: filters?.processedCountGt,
    processedCountGte: filters?.processedCountGte,
    processedCountLt: filters?.processedCountLt,
    processedCountLte: filters?.processedCountLte,
    processedCountNe: filters?.processedCountNe,
    receivedCountEq: filters?.receivedCountEq,
    receivedCountGt: filters?.receivedCountGt,
    receivedCountGte: filters?.receivedCountGte,
    receivedCountLt: filters?.receivedCountLt,
    receivedCountLte: filters?.receivedCountLte,
    receivedCountNe: filters?.receivedCountNe,
    rejectedCountEq: filters?.rejectedCountEq,
    rejectedCountGt: filters?.rejectedCountGt,
    rejectedCountGte: filters?.rejectedCountGte,
    rejectedCountLt: filters?.rejectedCountLt,
    rejectedCountLte: filters?.rejectedCountLte,
    rejectedCountNe: filters?.rejectedCountNe,
    requestedByUserIdEq: filters?.requestedByUserIdEq,
    requestedByUserIdNe: filters?.requestedByUserIdNe,
    sourceEq: filters?.sourceEq,
    sourceNe: filters?.sourceNe,
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
  return `/nfe-imports?${search.toString()}`
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
      path: buildImportSearchPath(input),
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
