export const NFSE_SERVICE_INVOICES_PATH = '/nfse-service-invoices'
export const NFSE_INVOICE_PREVIEW_PATH = `${NFSE_SERVICE_INVOICES_PATH}/preview`
export const NFSE_EMISSION_PROFILES_PATH = '/nfse-emission-profiles'
export const NFSE_INVOICE_WORKSPACE_ROUTE = '/nfse-invoices'

export const NFSE_READ_PERMISSION = 'nfse.read'
export const NFSE_ISSUE_PERMISSION = 'nfse.issue'
export const NFSE_CANCEL_PERMISSION = 'nfse.cancel'
export const NFSE_MANAGE_PERMISSION = 'nfse.manage'

export const NFSE_INVOICE_ERROR = {
  FORBIDDEN: 'NFSE_INVOICE_FORBIDDEN',
  REQUEST_FAILED: 'NFSE_INVOICE_REQUEST_FAILED',
  RESPONSE_INVALID: 'NFSE_INVOICE_RESPONSE_INVALID',
} as const

export const NFSE_INVOICE_PAGE_SIZE = 25
export const NFSE_MAX_SELECTION_DOCUMENTS = 500
export const NFSE_CANCELLATION_REASON_MIN_LENGTH = 5
export const NFSE_CANCELLATION_REASON_MAX_LENGTH = 255

export const NFSE_SETTINGS_MANAGE_PERMISSION = 'settings.manage'
export const NFSE_EMISSION_PROFILE_PAGE_SIZE = 100

export const NFSE_INVOICES_QUERY_KEY = 'nfse-invoices'
export const NFSE_EMISSION_PROFILES_QUERY_KEY = 'nfse-emission-profiles'
export const NFSE_INVOICE_DETAIL_QUERY_KEY = 'nfse-invoice-detail'
export const NFSE_INVOICE_DOCUMENTS_QUERY_KEY = 'nfse-invoice-documents'

export const NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR: Readonly<Record<string, string>> = {
  NFSE_CREDENTIAL_MISSING: 'credentialMissing',
  NFSE_CREDENTIAL_UNAVAILABLE: 'credentialUnavailable',
  NFSE_DESCRIPTION_TEMPLATE_INVALID: 'descriptionTemplateInvalid',
  NFSE_DESCRIPTION_TOO_LONG: 'descriptionTooLong',
  NFSE_DOCUMENT_ALREADY_LINKED: 'documentAlreadyLinked',
  NFSE_DOCUMENT_DUPLICATED: 'documentDuplicated',
  NFSE_DOCUMENT_LINKED_TO_CTE_BATCH: 'documentLinkedToCteBatch',
  NFSE_DOCUMENT_MISSING_TAKER_NAME: 'documentMissingTakerName',
  NFSE_DOCUMENT_NOT_FOUND: 'documentNotFound',
  NFSE_EMISSION_PROFILE_NOT_ACTIVE: 'profileNotActive',
  NFSE_FISCAL_DOCUMENT_UNAVAILABLE: 'fiscalDocumentUnavailable',
  NFSE_FISCAL_SETTINGS_MISSING: 'fiscalSettingsMissing',
  NFSE_FREIGHT_RULE_VERSION_MISSING: 'freightRuleVersionMissing',
  NFSE_INVOICE_ALREADY_AUTHORIZED: 'alreadyAuthorized',
  NFSE_INVOICE_ALREADY_CANCELLED: 'alreadyCancelled',
  NFSE_INVOICE_CANCELLATION_IN_FLIGHT: 'cancellationInFlight',
  NFSE_INVOICE_CREATE_SPANS_MULTIPLE_TAKERS: 'spansMultipleTakers',
  NFSE_INVOICE_FORBIDDEN: 'readOnly',
  NFSE_INVOICE_IN_FLIGHT: 'inFlight',
  NFSE_INVOICE_NOT_AUTHORIZED: 'notAuthorized',
  NFSE_INVOICE_NOT_FOUND: 'notFound',
  NFSE_INVOICE_PENDING_AUTHORIZATION: 'pendingAuthorization',
  NFSE_INVOICE_REQUEST_FAILED: 'requestFailed',
  NFSE_INVOICE_RESPONSE_INVALID: 'responseInvalid',
  NFSE_ISS_RATE_OUT_OF_RANGE: 'issRateOutOfRange',
}

export const NFSE_INVOICE_KEYS = [
  'authorizedAt',
  'cancelledAt',
  'createdAt',
  'documentCount',
  'emissionProfileId',
  'id',
  'issAmount',
  'providerNumber',
  'serviceAmount',
  'status',
  'takerLegalName',
  'takerTaxId',
  'updatedAt',
  'verificationCode',
] as const

export const NFSE_INVOICE_DETAIL_KEYS = [
  ...NFSE_INVOICE_KEYS,
  'cancellationReason',
  'charges',
  'description',
  'rejectionCode',
  'rejectionMessage',
  'version',
] as const

export const NFSE_INVOICE_CHARGE_KEYS = [
  'amount',
  'baseAmount',
  'calculationType',
  'label',
  'ordinal',
  'rate',
] as const

export const NFSE_INVOICE_DOCUMENT_KEYS = [
  'accessKey',
  'cancelledAt',
  'documentId',
  'issuedAt',
  'number',
  'position',
  'series',
  'totalAmount',
] as const

export const NFSE_PREVIEW_KEYS = ['blocked', 'invoices'] as const
export const NFSE_PREVIEW_BLOCK_KEYS = ['documentId', 'reason'] as const

export const NFSE_PREVIEW_INVOICE_KEYS = [
  'adjustments',
  'baseAmount',
  'calculatedAmount',
  'charges',
  'description',
  'documents',
  'issAmount',
  'issRate',
  'listedDocuments',
  'omittedDocuments',
  'percentage',
  'profileId',
  'serviceAmount',
  'takerLegalName',
  'takerTaxId',
] as const

export const NFSE_PREVIEW_CHARGE_KEYS = [
  'amount',
  'baseAmount',
  'calculationType',
  'label',
  'rate',
] as const

export const NFSE_PREVIEW_DOCUMENT_KEYS = [
  'accessKey',
  'documentId',
  'number',
  'series',
  'totalAmount',
] as const

export const NFSE_PREVIEW_ADJUSTMENT_KEYS = ['amount', 'type'] as const

export const NFSE_ISSUANCE_SUMMARY_KEYS = [
  'attemptId',
  'documentIds',
  'invoiceId',
  'replayed',
  'requestedAt',
  'status',
] as const

export const NFSE_CANCELLATION_SUMMARY_KEYS = [
  'attemptId',
  'invoiceId',
  'releasedDocumentIds',
  'replayed',
  'requestedAt',
  'status',
] as const

export const NFSE_DOCUMENT_DOWNLOAD_KEYS = ['expiresAt', 'url'] as const

/** O perfil chega inteiro da API; o diálogo usa cinco campos, mas o guarda continua estrito. */
export const NFSE_EMISSION_PROFILE_KEYS = [
  'chargeComponentLabel',
  'cnaeCode',
  'companyId',
  'createdAt',
  'descriptionMaxLength',
  'descriptionTemplate',
  'freightRuleId',
  'id',
  'issExigibility',
  'issRate',
  'issWithheld',
  'municipalTaxationCode',
  'municipalityIbgeCode',
  'municipalityName',
  'name',
  'nbsCode',
  'observations',
  'serviceListItem',
  'status',
  'taker',
  'updatedAt',
  'version',
] as const
