/* Copyright (c) 2026 Ada Technology. MIT License. */
export type NfeImportSummary = Readonly<{
  companyId: string
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
  requestedByUserId: string
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
  id: string
  issuedAt: string
  number: string
  operationNature: string
  status: 'authorized' | 'cancelled' | 'denied'
  totalValue: string
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

function isNfeImportSummary(value: unknown): value is NfeImportSummary {
  return (
    isRecord(value) &&
    isString(value.companyId) &&
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
    isString(value.requestedByUserId) &&
    (value.source === 'distribution' || value.source === 'upload') &&
    isImportStatus(value.status) &&
    isTerminalError(value.terminalError) &&
    isString(value.updatedAt) &&
    isString(value.version)
  )
}

function isNfeImportListPage(value: unknown): value is NfeImportListPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isNfeImportSummary) &&
    (value.nextCursor === null || isString(value.nextCursor))
  )
}

function isNfeDocumentListItem(value: unknown): value is NfeDocumentListItem {
  return (
    isRecord(value) &&
    isString(value.accessKey) &&
    isString(value.id) &&
    isString(value.issuedAt) &&
    isString(value.number) &&
    isString(value.operationNature) &&
    isDocumentStatus(value.status) &&
    isString(value.totalValue)
  )
}

function isNfeDocumentListPage(value: unknown): value is NfeDocumentListPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isNfeDocumentListItem) &&
    (value.nextCursor === null || isString(value.nextCursor))
  )
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
    if (!isNfeImportSummary(response)) {
      throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
    }
    return response
  },
  async listDocuments(input) {
    const response = await requestJson({
      dependencies,
      init: { method: 'GET' },
      path: searchPath({ ...input, path: '/nfe-documents' }),
    })
    if (!isNfeDocumentListPage(response)) {
      throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
    }
    return response
  },
  async listImports(input) {
    const response = await requestJson({
      dependencies,
      init: { method: 'GET' },
      path: searchPath({ ...input, path: '/nfe-imports' }),
    })
    if (!isNfeImportListPage(response)) {
      throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
    }
    return response
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
    if (!isNfeImportSummary(response)) {
      throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
    }
    return response
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
    if (!isNfeImportSummary(response)) {
      throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
    }
    return response
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
    if (!isNfeImportSummary(response)) {
      throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
    }
    return response
  },
})
