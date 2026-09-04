/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isScheduledDistributionStatus,
  type ScheduledDistributionStatus,
} from '@/modules/company-settings/shared/scheduledDistribution.validation'
import { mapAddressReport, type AddressReport } from './addressReport.validation'
import {
  JOB_EXECUTION_ORIGINS,
  isJobOutcome,
  type JobExecutionOrigin,
  type JobOutcome,
} from '@/modules/shared/jobCatalog.constant'

export type { ScheduledDistributionStatus }

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

export type NfeDistributionEnvironment = 'homologation' | 'production'

/** A última linha de `job_executions` da rotina — a janela que venceu ou o botão que alguém apertou. */
export type NfeJobRunSnapshot = Readonly<{
  counters: Readonly<Record<string, number>>
  finishedAt: null | string
  origin: JobExecutionOrigin
  outcome: JobOutcome | null
  startedAt: string
}>

export type NfeDistributionStatus = Readonly<{
  canPull: boolean
  environment: NfeDistributionEnvironment
  lastPulledAt: null | string
  lastRun: NfeJobRunSnapshot | null
  maxNsu: string
  nextAllowedAt: null | string
  pullInProgress: boolean
  scheduled: ScheduledDistributionStatus
  ultNsu: string
}>

export type NfeDocumentListItem = Readonly<{
  accessKey: string
  cteBlockReason: null | string
  nfseBlockReason: null | string
  emitterAddress: null | string
  emitterCity: null | string
  emitterCityCode: null | string
  emitterName: string
  emitterState: null | string
  emitterTaxId: null | string
  id: string
  issuedAt: string
  /** O número chega `null` enquanto a prefeitura não autoriza: o vínculo já existe, a numeração não. */
  nfseInvoiceId: null | string
  nfseInvoiceNumber: null | string
  number: string
  recipientAddress: null | string
  /** O CEP do destinatário, cru. A tela da viagem o imprime junto do endereço da parada. */
  recipientPostalCode: null | string
  recipientAddressNumber: null | string
  /** Onde a nota para, e com que precisão — ver `trip.types.ts`. */
  recipientLatitude: null | string
  recipientLongitude: null | string
  recipientLocationPrecision: null | string
  recipientCity: null | string
  recipientCityCode: null | string
  recipientName: string
  recipientState: null | string
  recipientTaxId: null | string
  series: string
  status: 'authorized' | 'cancelled' | 'denied'
  totalAmount: string
  /**
   * Spec 065 D4b: a viagem em que a nota saiu. **Sinal, não bloqueio** — fatura-se o que saiu, e
   * quem monta o lote precisa ver isso sem abrir a tela de viagem nota por nota.
   */
  tripId: null | string
  tripStatus: null | string
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
  onBatchStarted?: (files: readonly File[]) => void
  onBatchFailed?: (files: readonly File[]) => void
  onBatchUploaded?: (files: readonly File[]) => void
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
  getAddressReport: () => Promise<AddressReport>
  getDistributionStatus: () => Promise<NfeDistributionStatus>
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
const DISTRIBUTION_IN_PROGRESS_POLL_MS = 5_000
const DISTRIBUTION_TRIGGER_POLL_MS = 2_000
const DISTRIBUTION_TRIGGER_GRACE_MS = 20_000

function requestError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is null | string {
  return value === null || typeof value === 'string'
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
    isNullableString(value.cteBlockReason) &&
    isNullableString(value.nfseBlockReason) &&
    isNullableString(value.emitterAddress) &&
    isNullableString(value.emitterCity) &&
    isNullableString(value.emitterCityCode) &&
    isString(value.emitterName) &&
    isNullableString(value.emitterState) &&
    isNullableString(value.emitterTaxId) &&
    isString(value.id) &&
    isString(value.issuedAt) &&
    isNullableString(value.nfseInvoiceId) &&
    isNullableString(value.nfseInvoiceNumber) &&
    isString(value.number) &&
    isNullableString(value.recipientAddress) &&
    isNullableString(value.recipientPostalCode) &&
    isNullableString(value.recipientAddressNumber) &&
    isNullableString(value.recipientLatitude) &&
    isNullableString(value.recipientLongitude) &&
    isNullableString(value.recipientLocationPrecision) &&
    isNullableString(value.recipientCity) &&
    isNullableString(value.recipientCityCode) &&
    isString(value.recipientName) &&
    isNullableString(value.recipientState) &&
    isNullableString(value.tripId) &&
    isNullableString(value.tripStatus) &&
    isNullableString(value.recipientTaxId) &&
    isString(value.series) &&
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

const DISTRIBUTION_JOB = 'nfe.distribution.pull'

function isJobRunCounters(value: unknown): value is Readonly<Record<string, number>> {
  return isRecord(value) && Object.values(value).every(isNumber)
}

/**
 * O desfecho é conferido contra o vocabulário **desta** rotina: a coluna é uma só para as quatro,
 * e um `anp_unreachable` numa execução de distribuição é resposta errada, não desfecho desconhecido.
 */
function isNullableJobRunSnapshot(value: unknown): value is NfeJobRunSnapshot | null {
  if (value === null) return true
  return (
    isRecord(value) &&
    isJobRunCounters(value.counters) &&
    isNullableString(value.finishedAt) &&
    JOB_EXECUTION_ORIGINS.includes(value.origin as JobExecutionOrigin) &&
    (value.outcome === null ||
      (isString(value.outcome) &&
        isJobOutcome({ job: DISTRIBUTION_JOB, outcome: value.outcome }))) &&
    isString(value.startedAt)
  )
}

function mapDistributionStatus(value: unknown): NfeDistributionStatus {
  const data = envelopeData(value)
  if (
    !isRecord(data) ||
    typeof data.canPull !== 'boolean' ||
    typeof data.pullInProgress !== 'boolean' ||
    (data.environment !== 'homologation' && data.environment !== 'production') ||
    !isNullableString(data.lastPulledAt) ||
    !isNullableString(data.nextAllowedAt) ||
    !isString(data.maxNsu) ||
    !isString(data.ultNsu) ||
    !isScheduledDistributionStatus(data.scheduled) ||
    !isNullableJobRunSnapshot(data.lastRun)
  ) {
    throw requestError('NFE_WORKSPACE_RESPONSE_INVALID')
  }
  return {
    canPull: data.canPull,
    environment: data.environment,
    lastPulledAt: data.lastPulledAt,
    lastRun: data.lastRun,
    maxNsu: data.maxNsu,
    nextAllowedAt: data.nextAllowedAt,
    pullInProgress: data.pullInProgress,
    scheduled: data.scheduled,
    ultNsu: data.ultNsu,
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

export function createDistributionPollingState(input: {
  readonly now: number
  readonly status: NfeDistributionStatus | undefined
  readonly triggeredAt: null | number
}): ImportPollingState {
  if (input.status?.pullInProgress === true) {
    return { enabled: true, intervalMs: DISTRIBUTION_IN_PROGRESS_POLL_MS }
  }
  const withinGraceWindow =
    input.triggeredAt !== null && input.now - input.triggeredAt < DISTRIBUTION_TRIGGER_GRACE_MS
  if (withinGraceWindow) {
    return { enabled: true, intervalMs: DISTRIBUTION_TRIGGER_POLL_MS }
  }
  return { enabled: false, intervalMs: null }
}

export const createNfeWorkspaceClient: NfeWorkspaceClientFactory = (dependencies) => ({
  async getAddressReport() {
    const response = await requestJson({
      dependencies,
      init: { method: 'GET' },
      path: '/address-report',
    })
    return mapAddressReport(response)
  },
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
  async getDistributionStatus() {
    const response = await requestJson({
      dependencies,
      init: { method: 'GET' },
      path: '/nfe-imports/distribution',
    })
    return mapDistributionStatus(response)
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
