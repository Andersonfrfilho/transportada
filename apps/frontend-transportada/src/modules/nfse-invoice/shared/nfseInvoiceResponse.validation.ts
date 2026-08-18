import {
  NFSE_CANCELLATION_SUMMARY_KEYS,
  NFSE_DISCARD_SUMMARY_KEYS,
  NFSE_DOCUMENT_DOWNLOAD_KEYS,
  NFSE_EMISSION_PROFILE_OPTION_KEYS,
  NFSE_INVOICE_CHARGE_KEYS,
  NFSE_INVOICE_DELIVERY_KEYS,
  NFSE_INVOICE_DETAIL_KEYS,
  NFSE_INVOICE_DOCUMENT_KEYS,
  NFSE_INVOICE_ERROR,
  NFSE_INVOICE_KEYS,
  NFSE_ISSUANCE_SUMMARY_KEYS,
  NFSE_LAST_ISSUANCE_PAYLOAD_KEYS,
  NFSE_PREVIEW_ADJUSTMENT_KEYS,
  NFSE_PREVIEW_BLOCK_KEYS,
  NFSE_PREVIEW_CHARGE_KEYS,
  NFSE_PREVIEW_DOCUMENT_KEYS,
  NFSE_PREVIEW_INVOICE_KEYS,
  NFSE_PREVIEW_KEYS,
  NFSE_REISSUE_SUMMARY_KEYS,
} from './nfseInvoice.constant'
import {
  hasExactKeys,
  isBoolean,
  isDecimalString,
  isEveryItem,
  isNullableString,
  isOneOf,
  isRecord,
  isString,
  isStringArray,
  isUnsignedInteger,
} from './nfseInvoiceGuards.validation'
import {
  NFSE_ADJUSTMENT_TYPES,
  NFSE_CHARGE_CALCULATION_TYPES,
  NFSE_DELIVERY_STATUSES,
  NFSE_INVOICE_STATUSES,
  type NfseCancellationSummary,
  type NfseDiscardSummary,
  type NfseDocumentDownload,
  type NfseEmissionProfileOption,
  type NfseInvoice,
  type NfseInvoiceCharge,
  type NfseInvoiceDelivery,
  type NfseInvoiceDetail,
  type NfseInvoiceDocument,
  type NfseInvoicePage,
  type NfseInvoicePreview,
  type NfseIssuanceSummary,
  type NfseLastIssuancePayload,
  type NfsePreviewAdjustment,
  type NfsePreviewBlock,
  type NfsePreviewCharge,
  type NfsePreviewDocument,
  type NfsePreviewInvoice,
  type NfseReissueSummary,
} from './nfseInvoice.types'

function invalid(): Error {
  return new Error(NFSE_INVOICE_ERROR.RESPONSE_INVALID)
}

function isInvoice(value: unknown): value is NfseInvoice {
  return (
    hasExactKeys(value, NFSE_INVOICE_KEYS) &&
    isNullableString(value.authorizedAt) &&
    isNullableString(value.cancelledAt) &&
    isString(value.createdAt) &&
    isUnsignedInteger(value.documentCount) &&
    isString(value.emissionProfileId) &&
    isString(value.id) &&
    isDecimalString(value.issAmount) &&
    isNullableString(value.providerNumber) &&
    isDecimalString(value.serviceAmount) &&
    isOneOf(value.status, NFSE_INVOICE_STATUSES) &&
    isString(value.takerLegalName) &&
    isString(value.takerTaxId) &&
    isString(value.updatedAt) &&
    isNullableString(value.verificationCode)
  )
}

function isCharge(value: unknown): value is NfseInvoiceCharge {
  return (
    hasExactKeys(value, NFSE_INVOICE_CHARGE_KEYS) &&
    isDecimalString(value.amount) &&
    isDecimalString(value.baseAmount) &&
    isOneOf(value.calculationType, NFSE_CHARGE_CALCULATION_TYPES) &&
    isString(value.label) &&
    isUnsignedInteger(value.ordinal) &&
    isDecimalString(value.rate)
  )
}

/** A nota criada e ainda não entregue não tem tentativa nenhuma: aí o bloco inteiro vem nulo. */
function isDelivery(value: unknown): value is NfseInvoiceDelivery {
  return (
    hasExactKeys(value, NFSE_INVOICE_DELIVERY_KEYS) &&
    isUnsignedInteger(value.attemptCount) &&
    isNullableString(value.lastErrorCause) &&
    isNullableString(value.lastErrorCode) &&
    isNullableString(value.lastErrorMessage) &&
    isNullableString(value.nextAttemptAt) &&
    isOneOf(value.status, NFSE_DELIVERY_STATUSES) &&
    isString(value.updatedAt)
  )
}

/** O payload congelado da última tentativa — nulo quando a fatura ainda não tem tentativa nenhuma. */
function isLastIssuancePayload(value: unknown): value is NfseLastIssuancePayload {
  return (
    hasExactKeys(value, NFSE_LAST_ISSUANCE_PAYLOAD_KEYS) &&
    isString(value.cnaeCode) &&
    isString(value.description) &&
    isUnsignedInteger(value.documentCount) &&
    isDecimalString(value.issAmount) &&
    isString(value.issExigibility) &&
    isDecimalString(value.issRate) &&
    isBoolean(value.issWithheld) &&
    isString(value.municipalTaxationCode) &&
    isString(value.municipalityIbgeCode) &&
    isString(value.nbsCode) &&
    isDecimalString(value.serviceAmount) &&
    isString(value.serviceListItem) &&
    isString(value.takerLegalName) &&
    isString(value.takerTaxId)
  )
}

function isInvoiceDetail(value: unknown): value is NfseInvoiceDetail {
  if (!hasExactKeys(value, NFSE_INVOICE_DETAIL_KEYS)) return false
  const {
    cancellationReason,
    charges,
    delivery,
    description,
    lastPayload,
    rejectionCode,
    rejectionMessage,
    version,
  } = value
  const summary = Object.fromEntries(NFSE_INVOICE_KEYS.map((key) => [key, value[key]]))
  return (
    isInvoice(summary) &&
    isNullableString(cancellationReason) &&
    isEveryItem(charges, isCharge) &&
    (delivery === null || isDelivery(delivery)) &&
    isString(description) &&
    (lastPayload === null || isLastIssuancePayload(lastPayload)) &&
    isNullableString(rejectionCode) &&
    isNullableString(rejectionMessage) &&
    isString(version)
  )
}

function isDocument(value: unknown): value is NfseInvoiceDocument {
  return (
    hasExactKeys(value, NFSE_INVOICE_DOCUMENT_KEYS) &&
    isString(value.accessKey) &&
    isNullableString(value.cancelledAt) &&
    isString(value.documentId) &&
    isString(value.issuedAt) &&
    isString(value.number) &&
    isUnsignedInteger(value.position) &&
    isString(value.series) &&
    isDecimalString(value.totalAmount)
  )
}

/** A razão do bloqueio é vocabulário aberto: a do CT-e entra sem tradução, e lista fechada recusaria. */
function isBlock(value: unknown): value is NfsePreviewBlock {
  return (
    hasExactKeys(value, NFSE_PREVIEW_BLOCK_KEYS) &&
    isString(value.documentId) &&
    isString(value.reason)
  )
}

function isPreviewCharge(value: unknown): value is NfsePreviewCharge {
  return (
    hasExactKeys(value, NFSE_PREVIEW_CHARGE_KEYS) &&
    isDecimalString(value.amount) &&
    isDecimalString(value.baseAmount) &&
    isOneOf(value.calculationType, NFSE_CHARGE_CALCULATION_TYPES) &&
    isString(value.label) &&
    isDecimalString(value.rate)
  )
}

function isAdjustment(value: unknown): value is NfsePreviewAdjustment {
  return (
    hasExactKeys(value, NFSE_PREVIEW_ADJUSTMENT_KEYS) &&
    isDecimalString(value.amount) &&
    isOneOf(value.type, NFSE_ADJUSTMENT_TYPES)
  )
}

function isPreviewDocument(value: unknown): value is NfsePreviewDocument {
  return (
    hasExactKeys(value, NFSE_PREVIEW_DOCUMENT_KEYS) &&
    isString(value.accessKey) &&
    isString(value.documentId) &&
    isString(value.number) &&
    isString(value.series) &&
    isDecimalString(value.totalAmount)
  )
}

function isPreviewInvoice(value: unknown): value is NfsePreviewInvoice {
  return (
    hasExactKeys(value, NFSE_PREVIEW_INVOICE_KEYS) &&
    isEveryItem(value.adjustments, isAdjustment) &&
    isDecimalString(value.baseAmount) &&
    isDecimalString(value.calculatedAmount) &&
    isEveryItem(value.charges, isPreviewCharge) &&
    isString(value.description) &&
    isEveryItem(value.documents, isPreviewDocument) &&
    isDecimalString(value.issAmount) &&
    isDecimalString(value.issRate) &&
    isUnsignedInteger(value.listedDocuments) &&
    isUnsignedInteger(value.omittedDocuments) &&
    isDecimalString(value.percentage) &&
    isString(value.profileId) &&
    isDecimalString(value.serviceAmount) &&
    isString(value.takerLegalName) &&
    isString(value.takerTaxId)
  )
}

function isPreview(value: unknown): value is NfseInvoicePreview {
  return (
    hasExactKeys(value, NFSE_PREVIEW_KEYS) &&
    isEveryItem(value.blocked, isBlock) &&
    isEveryItem(value.invoices, isPreviewInvoice)
  )
}

function isIssuanceSummary(value: unknown): value is NfseIssuanceSummary {
  return (
    hasExactKeys(value, NFSE_ISSUANCE_SUMMARY_KEYS) &&
    isString(value.attemptId) &&
    isStringArray(value.documentIds) &&
    isString(value.invoiceId) &&
    isBoolean(value.replayed) &&
    isString(value.requestedAt) &&
    isString(value.status)
  )
}

function isCancellationSummary(value: unknown): value is NfseCancellationSummary {
  return (
    hasExactKeys(value, NFSE_CANCELLATION_SUMMARY_KEYS) &&
    isString(value.attemptId) &&
    isString(value.invoiceId) &&
    isStringArray(value.releasedDocumentIds) &&
    isBoolean(value.replayed) &&
    isString(value.requestedAt) &&
    isString(value.status)
  )
}

function isReissueSummary(value: unknown): value is NfseReissueSummary {
  return (
    hasExactKeys(value, NFSE_REISSUE_SUMMARY_KEYS) &&
    isString(value.attemptId) &&
    isUnsignedInteger(value.attemptNumber) &&
    isString(value.invoiceId) &&
    isString(value.payloadSha256) &&
    isBoolean(value.replayed) &&
    isString(value.requestedAt) &&
    isString(value.status)
  )
}

function isDiscardSummary(value: unknown): value is NfseDiscardSummary {
  return (
    hasExactKeys(value, NFSE_DISCARD_SUMMARY_KEYS) &&
    isString(value.invoiceId) &&
    isStringArray(value.releasedDocumentIds) &&
    isBoolean(value.replayed) &&
    isString(value.status)
  )
}

function isDocumentDownload(value: unknown): value is NfseDocumentDownload {
  return (
    hasExactKeys(value, NFSE_DOCUMENT_DOWNLOAD_KEYS) &&
    isString(value.expiresAt) &&
    isString(value.url)
  )
}

/**
 * Estrito nos dois sentidos: campo de menos é resposta quebrada, campo de mais é parâmetro fiscal
 * vindo da listagem de configurações — nenhum dos dois é a rota de opções.
 */
function isEmissionProfileOption(value: unknown): value is NfseEmissionProfileOption {
  return (
    hasExactKeys(value, NFSE_EMISSION_PROFILE_OPTION_KEYS) &&
    isString(value.descriptionTemplate) &&
    isString(value.id) &&
    isString(value.name)
  )
}

export function createNfseInvoiceResponseAdapters() {
  return {
    cancellationSummaryFromApi(input: unknown): NfseCancellationSummary {
      if (!isCancellationSummary(input)) throw invalid()
      return input
    },
    discardSummaryFromApi(input: unknown): NfseDiscardSummary {
      if (!isDiscardSummary(input)) throw invalid()
      return input
    },
    documentDownloadFromApi(input: unknown): NfseDocumentDownload {
      if (!isDocumentDownload(input)) throw invalid()
      return input
    },
    emissionProfilesFromApi(input: unknown): readonly NfseEmissionProfileOption[] {
      if (!isRecord(input) || !isEveryItem(input.data, isEmissionProfileOption)) throw invalid()
      return input.data
    },
    invoiceDetailFromApi(input: unknown): NfseInvoiceDetail {
      if (!isInvoiceDetail(input)) throw invalid()
      return input
    },
    invoiceDocumentsFromApi(input: unknown): readonly NfseInvoiceDocument[] {
      if (!isEveryItem(input, isDocument)) throw invalid()
      return input
    },
    invoiceFromApi(input: unknown): NfseInvoice {
      if (!isInvoice(input)) throw invalid()
      return input
    },
    invoiceListFromApi(input: unknown): NfseInvoicePage {
      if (!isRecord(input) || !isRecord(input.page)) throw invalid()
      const nextCursor = input.page.nextCursor
      if (!isNullableString(nextCursor)) throw invalid()
      if (!isEveryItem(input.data, isInvoice)) throw invalid()
      return { items: input.data, nextCursor }
    },
    issuanceSummaryFromApi(input: unknown): NfseIssuanceSummary {
      if (!isIssuanceSummary(input)) throw invalid()
      return input
    },
    previewFromApi(input: unknown): NfseInvoicePreview {
      if (!isPreview(input)) throw invalid()
      return input
    },
    reissueSummaryFromApi(input: unknown): NfseReissueSummary {
      if (!isReissueSummary(input)) throw invalid()
      return input
    },
  }
}

export type NfseInvoiceResponseAdapters = ReturnType<typeof createNfseInvoiceResponseAdapters>
