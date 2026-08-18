export const NFSE_SERVICE_INVOICES_PATH = '/nfse-service-invoices'
export const NFSE_INVOICE_PREVIEW_PATH = `${NFSE_SERVICE_INVOICES_PATH}/preview`
export const NFSE_INVOICE_EXPORT_PATH = `${NFSE_SERVICE_INVOICES_PATH}/export`
/** O servidor carimba o nome; o padrão só existe para o arquivo não sair sem nome nenhum. */
export const NFSE_INVOICE_EXPORT_FALLBACK_FILE_NAME = 'nfse-documentos.zip'
export const NFSE_EMISSION_PROFILES_PATH = '/nfse-emission-profiles'
/**
 * O diálogo de emissão lê as opções, não a listagem: quem emite tem `nfse.issue`, e a listagem
 * inteira — com alíquota, CNAE e tomador — pede `settings.manage`, que o papel fiscal não tem.
 */
export const NFSE_EMISSION_PROFILE_OPTIONS_PATH = `${NFSE_EMISSION_PROFILES_PATH}/options`
export const NFSE_PROVIDER_CREDENTIALS_PATH = '/nfse-provider-credentials'
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

/** Configuração é outra rota e outro erro: confundir os códigos esconde de quem falhou o quê. */
export const NFSE_SETTINGS_ERROR = {
  REQUEST_FAILED: 'NFSE_SETTINGS_REQUEST_FAILED',
  RESPONSE_INVALID: 'NFSE_SETTINGS_RESPONSE_INVALID',
} as const

/** O resumo da credencial: onze campos e nenhum segredo. Token de volta é resposta recusada. */
export const NFSE_PROVIDER_CREDENTIAL_KEYS = [
  'apiTokenConfigured',
  'callbackTokenConfigured',
  'createdAt',
  'fiscalEnvironment',
  'id',
  'municipalRegistration',
  'provider',
  'status',
  'taxId',
  'updatedAt',
  'version',
] as const

export const NFSE_INVOICE_PAGE_SIZE = 25
export const NFSE_INVOICE_PAGE_SIZES = [25, 50, 100] as const
export type NfseInvoicePageSize = (typeof NFSE_INVOICE_PAGE_SIZES)[number]
export const NFSE_MAX_SELECTION_DOCUMENTS = 500
export const NFSE_CANCELLATION_REASON_MIN_LENGTH = 5
export const NFSE_CANCELLATION_REASON_MAX_LENGTH = 255

/**
 * O `motivo` que a prefeitura lê é **código**, não texto: `2` serviço não prestado, `4` nota
 * duplicada. O `1` (erro na emissão) existe no vocabulário dela e é o único que ela recusa, pedindo
 * substituição da nota — a nota iria para `cancellation_requested`, liberaria as NF-e vinculadas e
 * ficaria esperando um retorno que nunca chega. Por isso a tela não o oferece.
 */
export const NFSE_CANCELLATION_MOTIVES = ['2', '4'] as const
export type NfseCancellationMotive = (typeof NFSE_CANCELLATION_MOTIVES)[number]

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
  'delivery',
  'description',
  'lastPayload',
  'rejectionCode',
  'rejectionMessage',
  'version',
] as const

export const NFSE_LAST_ISSUANCE_PAYLOAD_KEYS = [
  'cnaeCode',
  'description',
  'documentCount',
  'issAmount',
  'issExigibility',
  'issRate',
  'issWithheld',
  'municipalTaxationCode',
  'municipalityIbgeCode',
  'nbsCode',
  'serviceAmount',
  'serviceListItem',
  'takerLegalName',
  'takerTaxId',
] as const

/** Os nove campos que a reemissão pode corrigir — o resto do payload congelado é somente leitura. */
export const NFSE_REISSUE_CORRECTABLE_KEYS = [
  'cnaeCode',
  'description',
  'issExigibility',
  'issRate',
  'issWithheld',
  'municipalTaxationCode',
  'municipalityIbgeCode',
  'nbsCode',
  'serviceListItem',
] as const

export const NFSE_INVOICE_DELIVERY_KEYS = [
  'attemptCount',
  'lastErrorCause',
  'lastErrorCode',
  'lastErrorMessage',
  'nextAttemptAt',
  'status',
  'updatedAt',
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

export const NFSE_REISSUE_SUMMARY_KEYS = [
  'attemptId',
  'attemptNumber',
  'invoiceId',
  'payloadSha256',
  'replayed',
  'requestedAt',
  'status',
] as const

export const NFSE_DISCARD_SUMMARY_KEYS = [
  'invoiceId',
  'releasedDocumentIds',
  'replayed',
  'status',
] as const

export const NFSE_DOCUMENT_DOWNLOAD_KEYS = ['expiresAt', 'url'] as const

/** A rota de opções serve três campos e nada mais — campo fiscal a mais é resposta de outra rota. */
export const NFSE_EMISSION_PROFILE_OPTION_KEYS = ['descriptionTemplate', 'id', 'name'] as const

/** O perfil chega inteiro na listagem de configurações, atrás de `settings.manage`. */
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
