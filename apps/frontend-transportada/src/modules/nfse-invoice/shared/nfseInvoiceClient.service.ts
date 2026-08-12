import {
  NFSE_EMISSION_PROFILE_PAGE_SIZE,
  NFSE_EMISSION_PROFILES_PATH,
  NFSE_INVOICE_ERROR,
  NFSE_INVOICE_PREVIEW_PATH,
  NFSE_SERVICE_INVOICES_PATH,
} from './nfseInvoice.constant'
import { isRecord, isString } from './nfseInvoiceGuards.validation'
import {
  createNfseInvoiceResponseAdapters,
  type NfseInvoiceResponseAdapters,
} from './nfseInvoiceResponse.validation'
import type {
  NfseCancellationSummary,
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

export type NfseInvoiceCancellationInput = Readonly<{
  cancellationReason: string
  idempotencyKey: string
  invoiceId: string
}>

export type NfseInvoiceClient = Readonly<{
  cancelInvoice: (input: NfseInvoiceCancellationInput) => Promise<NfseCancellationSummary>
  createInvoices: (
    input: NfseInvoiceSelection & Readonly<{ idempotencyKey: string }>,
  ) => Promise<NfseIssuanceSummary>
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

export function createNfseInvoiceClient(dependencies: ClientDependencies): NfseInvoiceClient {
  const adapters: NfseInvoiceResponseAdapters = createNfseInvoiceResponseAdapters()

  return {
    async cancelInvoice(input) {
      const payload = await authorizedRequest({
        body: JSON.stringify({ cancellationReason: input.cancellationReason }),
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
      const search = new URLSearchParams({
        limit: String(NFSE_EMISSION_PROFILE_PAGE_SIZE),
        statusEq: 'active',
      })
      const payload = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${NFSE_EMISSION_PROFILES_PATH}?${search.toString()}`,
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
  }
}
