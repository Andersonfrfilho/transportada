import type { ArchiveFile } from '@/modules/shared/archiveDownload.service'

import type { NfseCancellationMotive } from './nfseInvoice.constant'
import {
  NFSE_EMISSION_PROFILE_OPTIONS_PATH,
  NFSE_INVOICE_ERROR,
  NFSE_INVOICE_EXPORT_FALLBACK_FILE_NAME,
  NFSE_INVOICE_EXPORT_PATH,
  NFSE_INVOICE_PREVIEW_PATH,
  NFSE_SERVICE_INVOICES_PATH,
} from './nfseInvoice.constant'
import { isRecord, isString } from './nfseInvoiceGuards.validation'
import {
  createNfseInvoiceResponseAdapters,
  type NfseInvoiceResponseAdapters,
} from './nfseInvoiceResponse.validation'
import type { NfseReissueCorrection } from './nfseInvoiceRowActions.service'
import type {
  NfseCancellationSummary,
  NfseDiscardSummary,
  NfseDocumentDownload,
  NfseEmissionProfileOption,
  NfseInvoiceDetail,
  NfseInvoiceDocument,
  NfseInvoiceDocumentKind,
  NfseInvoiceFilters,
  NfseInvoicePage,
  NfseInvoicePreview,
  NfseInvoiceSelection,
  NfseIssuanceSummary,
  NfseReissueSummary,
} from './nfseInvoice.types'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type NfseInvoiceListQuery = Readonly<{
  cursor: null | string
  filters?: NfseInvoiceFilters
  limit: number
}>

/** O código vai para a prefeitura, o texto fica no registro da nota — nenhum substitui o outro. */
export type NfseInvoiceCancellationInput = Readonly<{
  cancellationMotive: NfseCancellationMotive
  cancellationReason: string
  idempotencyKey: string
  invoiceId: string
}>

export const NFSE_EXPORT_FORMATS = ['both', 'pdf', 'xml'] as const
export type NfseExportFormat = (typeof NFSE_EXPORT_FORMATS)[number]

export type NfseInvoiceExportInput = Readonly<{
  format?: NfseExportFormat
  invoiceIds: readonly string[]
}>

export type NfseInvoiceDiscardInput = Readonly<{
  idempotencyKey: string
  invoiceId: string
}>

/** `correction` ausente ou vazia manda corpo ausente — a rota distingue "sem corpo" de `{}`. */
export type NfseInvoiceReissueInput = Readonly<{
  correction?: NfseReissueCorrection
  idempotencyKey: string
  invoiceId: string
}>

export type NfseInvoiceClient = Readonly<{
  cancelInvoice: (input: NfseInvoiceCancellationInput) => Promise<NfseCancellationSummary>
  createInvoices: (
    input: NfseInvoiceSelection & Readonly<{ idempotencyKey: string }>,
  ) => Promise<NfseIssuanceSummary>
  discardInvoice: (input: NfseInvoiceDiscardInput) => Promise<NfseDiscardSummary>
  exportInvoices: (input: NfseInvoiceExportInput) => Promise<ArchiveFile>
  getInvoice: (input: Readonly<{ invoiceId: string }>) => Promise<NfseInvoiceDetail>
  getInvoiceDocumentUrl: (
    input: Readonly<{ invoiceId: string; kind: NfseInvoiceDocumentKind }>,
  ) => Promise<NfseDocumentDownload>
  listEmissionProfiles: () => Promise<readonly NfseEmissionProfileOption[]>
  listInvoiceDocuments: (
    input: Readonly<{ invoiceId: string }>,
  ) => Promise<readonly NfseInvoiceDocument[]>
  listInvoices: (input: NfseInvoiceListQuery) => Promise<NfseInvoicePage>
  previewInvoices: (input: NfseInvoiceSelection) => Promise<NfseInvoicePreview>
  reissueInvoice: (input: NfseInvoiceReissueInput) => Promise<NfseReissueSummary>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return NFSE_INVOICE_ERROR.REQUEST_FAILED
}

async function requestJson(
  input: Readonly<{
    fetch: ClientDependencies['fetch']
    request: Request
  }>,
): Promise<unknown> {
  const response = await input.fetch(input.request)
  const text = await response.text()

  let payload: unknown
  try {
    payload = text.length === 0 ? undefined : (JSON.parse(text) as unknown)
  } catch {
    throw requestError(
      response.ok ? NFSE_INVOICE_ERROR.RESPONSE_INVALID : NFSE_INVOICE_ERROR.REQUEST_FAILED,
    )
  }

  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

function readEnvelopeData(input: unknown): unknown {
  if (!isRecord(input) || !('data' in input))
    throw requestError(NFSE_INVOICE_ERROR.RESPONSE_INVALID)
  return input.data
}

/** O corpo é montado campo a campo: `companyId` vem do token, e a API recusa chave desconhecida. */
function buildSelectionBody(input: NfseInvoiceSelection): string {
  const body: Record<string, unknown> = {
    documentIds: input.documentIds,
    profileId: input.profileId,
  }
  if (input.descriptionTemplate !== undefined) {
    body['descriptionTemplate'] = input.descriptionTemplate
  }
  return JSON.stringify(body)
}

function buildListSearch(input: NfseInvoiceListQuery): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('limit', String(input.limit))

  const filters = input.filters ?? {}
  if (filters.createdFrom !== undefined) search.set('createdFrom', filters.createdFrom)
  if (filters.createdUntil !== undefined) search.set('createdUntil', filters.createdUntil)
  if (filters.statusIn !== undefined && filters.statusIn.length > 0) {
    search.set('statusIn', filters.statusIn.join(','))
  }
  if (filters.takerTaxIdEq !== undefined && filters.takerTaxIdEq.length > 0) {
    search.set('takerTaxIdEq', filters.takerTaxIdEq)
  }

  return search.toString()
}

/** A chave de idempotência é cabeçalho, nunca corpo: o schema da API é `.strict()`. */
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
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey

  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body

  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  })
}

const CONTENT_DISPOSITION_FILE_NAME = /filename="([^"]+)"/u

/** O corpo de erro ainda é JSON numa rota de arquivo; parse quebrado não pode virar exceção crua. */
async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    return undefined
  }
}

function readFileName(input: Readonly<{ disposition: null | string; fallback: string }>): string {
  const matched =
    input.disposition === null ? null : CONTENT_DISPOSITION_FILE_NAME.exec(input.disposition)
  return matched?.[1] ?? input.fallback
}

async function requestArchive(
  input: Readonly<{
    body: string
    dependencies: ClientDependencies
    fallbackFileName: string
    path: string
  }>,
): Promise<ArchiveFile> {
  const accessToken = await input.dependencies.getAccessToken()
  const request = new Request(`${input.dependencies.apiUrl}${input.path}`, {
    body: input.body,
    cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    method: 'POST',
  })

  let response: Response
  try {
    response = await input.dependencies.fetch(request)
  } catch {
    throw requestError(NFSE_INVOICE_ERROR.REQUEST_FAILED)
  }

  if (!response.ok) throw requestError(readErrorCode(await readJsonPayload(response)))

  return {
    blob: await response.blob(),
    fileName: readFileName({
      disposition: response.headers.get('content-disposition'),
      fallback: input.fallbackFileName,
    }),
  }
}

export function createNfseInvoiceClient(dependencies: ClientDependencies): NfseInvoiceClient {
  const adapters: NfseInvoiceResponseAdapters = createNfseInvoiceResponseAdapters()

  return {
    async cancelInvoice(input) {
      const payload = await authorizedRequest({
        body: JSON.stringify({
          cancellationMotive: input.cancellationMotive,
          cancellationReason: input.cancellationReason,
        }),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `${NFSE_SERVICE_INVOICES_PATH}/${input.invoiceId}/cancel`,
      })
      return adapters.cancellationSummaryFromApi(readEnvelopeData(payload))
    },
    async createInvoices(input) {
      const payload = await authorizedRequest({
        body: buildSelectionBody(input),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: NFSE_SERVICE_INVOICES_PATH,
      })
      return adapters.issuanceSummaryFromApi(readEnvelopeData(payload))
    },
    async discardInvoice(input) {
      const payload = await authorizedRequest({
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `${NFSE_SERVICE_INVOICES_PATH}/${input.invoiceId}/discard`,
      })
      return adapters.discardSummaryFromApi(readEnvelopeData(payload))
    },
    async exportInvoices(input) {
      const body: Record<string, unknown> = { invoiceIds: input.invoiceIds }
      if (input.format !== undefined) body['format'] = input.format

      return requestArchive({
        body: JSON.stringify(body),
        dependencies,
        fallbackFileName: NFSE_INVOICE_EXPORT_FALLBACK_FILE_NAME,
        path: NFSE_INVOICE_EXPORT_PATH,
      })
    },
    async getInvoice(input) {
      const payload = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${NFSE_SERVICE_INVOICES_PATH}/${input.invoiceId}`,
      })
      return adapters.invoiceDetailFromApi(readEnvelopeData(payload))
    },
    async getInvoiceDocumentUrl(input) {
      const payload = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${NFSE_SERVICE_INVOICES_PATH}/${input.invoiceId}/${input.kind}`,
      })
      return adapters.documentDownloadFromApi(readEnvelopeData(payload))
    },
    async listEmissionProfiles() {
      const payload = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: NFSE_EMISSION_PROFILE_OPTIONS_PATH,
      })
      return adapters.emissionProfilesFromApi(payload)
    },
    async listInvoiceDocuments(input) {
      const payload = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${NFSE_SERVICE_INVOICES_PATH}/${input.invoiceId}/documents`,
      })
      return adapters.invoiceDocumentsFromApi(readEnvelopeData(payload))
    },
    async listInvoices(input) {
      const payload = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${NFSE_SERVICE_INVOICES_PATH}?${buildListSearch(input)}`,
      })
      return adapters.invoiceListFromApi(payload)
    },
    async previewInvoices(input) {
      const payload = await authorizedRequest({
        body: buildSelectionBody(input),
        dependencies,
        method: 'POST',
        path: NFSE_INVOICE_PREVIEW_PATH,
      })
      return adapters.previewFromApi(readEnvelopeData(payload))
    },
    async reissueInvoice(input) {
      const hasCorrection =
        input.correction !== undefined && Object.keys(input.correction).length > 0
      const payload = await authorizedRequest({
        ...(hasCorrection ? { body: JSON.stringify(input.correction) } : {}),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `${NFSE_SERVICE_INVOICES_PATH}/${input.invoiceId}/reissue`,
      })
      return adapters.reissueSummaryFromApi(readEnvelopeData(payload))
    },
  }
}
