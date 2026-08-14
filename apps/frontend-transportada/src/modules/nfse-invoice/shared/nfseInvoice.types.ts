export const NFSE_INVOICE_STATUSES = [
  'requested',
  'issuing',
  'pending_authorization',
  'authorized',
  'cancellation_requested',
  'rejected',
  'cancelled',
  'failed',
] as const
export type NfseInvoiceStatus = (typeof NFSE_INVOICE_STATUSES)[number]

export const NFSE_CHARGE_CALCULATION_TYPES = [
  'percentage_of_cargo',
  'percentage_of_freight',
  'fixed_amount',
] as const
export type NfseChargeCalculationType = (typeof NFSE_CHARGE_CALCULATION_TYPES)[number]

export const NFSE_ADJUSTMENT_TYPES = ['minimum_amount', 'maximum_amount'] as const
export type NfseAdjustmentType = (typeof NFSE_ADJUSTMENT_TYPES)[number]

export const NFSE_ATTEMPT_STATUSES = ['requested', 'cancellation_requested'] as const

export type NfseInvoiceDocumentKind = 'pdf' | 'xml'

/** Dinheiro e alíquota chegam como string decimal — número binário aqui perde centavo. */
export type NfseInvoice = Readonly<{
  authorizedAt: null | string
  cancelledAt: null | string
  createdAt: string
  documentCount: number
  emissionProfileId: string
  id: string
  issAmount: string
  providerNumber: null | string
  serviceAmount: string
  status: NfseInvoiceStatus
  takerLegalName: string
  takerTaxId: string
  updatedAt: string
  verificationCode: null | string
}>

export type NfseInvoiceCharge = Readonly<{
  amount: string
  baseAmount: string
  calculationType: NfseChargeCalculationType
  label: string
  ordinal: number
  rate: string
}>

export const NFSE_DELIVERY_STATUSES = [
  'pending',
  'in_flight',
  'accepted',
  'authorized',
  'rejected',
  'retry_scheduled',
  'failed',
  'reconciliation_required',
  'cancelled',
] as const
export type NfseDeliveryStatus = (typeof NFSE_DELIVERY_STATUSES)[number]

/**
 * A emissão é automática e não tem botão de transmitir: sem isto a nota parada é indistinguível de
 * uma nota esquecida. A causa é vocabulário aberto — a classificação do gateway entra sem tradução.
 */
export type NfseInvoiceDelivery = Readonly<{
  attemptCount: number
  lastErrorCause: null | string
  lastErrorCode: null | string
  lastErrorMessage: null | string
  nextAttemptAt: null | string
  status: NfseDeliveryStatus
  updatedAt: string
}>

export type NfseInvoiceDetail = NfseInvoice &
  Readonly<{
    cancellationReason: null | string
    charges: readonly NfseInvoiceCharge[]
    delivery: null | NfseInvoiceDelivery
    description: string
    rejectionCode: null | string
    rejectionMessage: null | string
    version: string
  }>

export type NfseInvoiceDocument = Readonly<{
  accessKey: string
  cancelledAt: null | string
  documentId: string
  issuedAt: string
  number: string
  position: number
  series: string
  totalAmount: string
}>

export type NfseInvoicePage = Readonly<{
  items: readonly NfseInvoice[]
  nextCursor: null | string
}>

export type NfsePreviewCharge = Readonly<{
  amount: string
  baseAmount: string
  calculationType: NfseChargeCalculationType
  label: string
  rate: string
}>

export type NfsePreviewAdjustment = Readonly<{
  amount: string
  type: NfseAdjustmentType
}>

export type NfsePreviewDocument = Readonly<{
  accessKey: string
  documentId: string
  number: string
  series: string
  totalAmount: string
}>

export type NfsePreviewInvoice = Readonly<{
  adjustments: readonly NfsePreviewAdjustment[]
  baseAmount: string
  calculatedAmount: string
  charges: readonly NfsePreviewCharge[]
  description: string
  documents: readonly NfsePreviewDocument[]
  issAmount: string
  issRate: string
  listedDocuments: number
  omittedDocuments: number
  percentage: string
  profileId: string
  serviceAmount: string
  takerLegalName: string
  takerTaxId: string
}>

/**
 * A razão de bloqueio é vocabulário aberto: a elegibilidade do CT-e entra aqui sem tradução,
 * então validar contra uma lista fechada recusaria resposta legítima da API.
 */
export type NfsePreviewBlock = Readonly<{
  documentId: string
  reason: string
}>

export type NfseInvoicePreview = Readonly<{
  blocked: readonly NfsePreviewBlock[]
  invoices: readonly NfsePreviewInvoice[]
}>

export type NfseIssuanceSummary = Readonly<{
  attemptId: string
  documentIds: readonly string[]
  invoiceId: string
  replayed: boolean
  requestedAt: string
  status: string
}>

export type NfseCancellationSummary = Readonly<{
  attemptId: string
  invoiceId: string
  releasedDocumentIds: readonly string[]
  replayed: boolean
  requestedAt: string
  status: string
}>

/** O documento fiscal sai por link assinado de vida curta: o corpo nunca traz os bytes. */
export type NfseDocumentDownload = Readonly<{
  expiresAt: string
  url: string
}>

export type NfseInvoiceFilters = Readonly<{
  createdFrom?: string
  createdUntil?: string
  statusIn?: readonly NfseInvoiceStatus[]
  takerTaxIdEq?: string
}>

export const NFSE_EMISSION_PROFILE_STATUSES = ['active', 'inactive'] as const
export type NfseEmissionProfileStatus = (typeof NFSE_EMISSION_PROFILE_STATUSES)[number]

/**
 * O diálogo escolhe o perfil e semeia a descrição com o modelo dele. A rota de opções só serve
 * perfil ativo, então não há status para filtrar aqui — e alíquota, CNAE e tomador ficam atrás de
 * `settings.manage`, que quem emite não tem.
 */
export type NfseEmissionProfileOption = Readonly<{
  descriptionTemplate: string
  id: string
  name: string
}>

export type NfseInvoiceSelection = Readonly<{
  descriptionTemplate?: string
  documentIds: readonly string[]
  profileId: string
}>
