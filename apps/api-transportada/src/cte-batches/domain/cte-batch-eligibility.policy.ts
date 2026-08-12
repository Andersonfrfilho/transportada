/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const CTE_BATCH_BLOCK_REASON = {
  alreadyLinked: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
  duplicated: 'CTE_BATCH_DOCUMENT_DUPLICATED',
  linkedToNfse: 'CTE_BATCH_DOCUMENT_LINKED_TO_NFSE',
  missingMunicipality: 'CTE_BATCH_DOCUMENT_MISSING_MUNICIPALITY',
  missingParty: 'CTE_BATCH_DOCUMENT_MISSING_PARTY',
  missingTotal: 'CTE_BATCH_DOCUMENT_MISSING_TOTAL',
  missingWeight: 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT',
  notAuthorized: 'CTE_BATCH_DOCUMENT_NOT_AUTHORIZED',
  notFound: 'CTE_BATCH_DOCUMENT_NOT_FOUND',
  ruleNotInForce: 'CTE_PROFILE_RULE_NOT_IN_FORCE',
  summaryOnly: 'CTE_BATCH_DOCUMENT_SUMMARY_ONLY',
} as const

export type CteBatchBlockReason =
  (typeof CTE_BATCH_BLOCK_REASON)[keyof typeof CTE_BATCH_BLOCK_REASON]

const FULL_TAX_ID_PATTERN = /^[0-9]{14}$/

export type EligibilityDocument = {
  readonly grossWeight: string | null
  readonly recipientCity: string | null
  readonly recipientState: string | null
  readonly recipientTaxId: string | null
  readonly senderCity: string | null
  readonly senderState: string | null
  readonly senderTaxId: string | null
  readonly status: string
  readonly totalAmount: string | null
  readonly variant: string
}

export type FreightRuleWindow = {
  readonly referenceDate: string
  readonly validFrom: string
  readonly validUntil: string | null
}

export type ChargeableParties = {
  readonly recipientTaxId: string
  readonly senderTaxId: string
  readonly totalAmount: string
}

export type DocumentEligibility =
  | { readonly chargeable: ChargeableParties; readonly reason?: undefined }
  | { readonly chargeable?: undefined; readonly reason: CteBatchBlockReason }

export type DocumentBlock = {
  readonly batchId: string | null
  readonly reason: CteBatchBlockReason
}

export type DocumentBlockDecision =
  | { readonly blocked: DocumentBlock; readonly chargeable?: undefined }
  | { readonly blocked?: undefined; readonly chargeable: ChargeableParties }

/**
 * Single source of truth for the block reported by the batch preview and by the notes listing:
 * eligibility answers first, so a linked document that is also ineligible reports why it is
 * ineligible.
 */
export function resolveDocumentBlock({
  document,
  linkedBatchId,
  linkedNfseInvoiceId,
}: {
  readonly document: EligibilityDocument
  readonly linkedBatchId: string | null
  readonly linkedNfseInvoiceId: string | null
}): DocumentBlockDecision {
  const eligibility = checkDocumentEligibility(document)
  if (eligibility.reason !== undefined) {
    return { blocked: { batchId: null, reason: eligibility.reason } }
  }
  if (linkedBatchId !== null) {
    return { blocked: { batchId: linkedBatchId, reason: CTE_BATCH_BLOCK_REASON.alreadyLinked } }
  }
  // Emitir CT-e e nota de serviço para o mesmo transporte é bitributação.
  if (linkedNfseInvoiceId !== null) {
    return { blocked: { batchId: null, reason: CTE_BATCH_BLOCK_REASON.linkedToNfse } }
  }

  return { chargeable: eligibility.chargeable }
}

/** RF09: a CT-e needs an authorized full NF-e with both parties, municipality and cargo weight. */
export function checkDocumentEligibility(document: EligibilityDocument): DocumentEligibility {
  if (document.status !== 'authorized') return { reason: CTE_BATCH_BLOCK_REASON.notAuthorized }
  if (document.variant !== 'complete') return { reason: CTE_BATCH_BLOCK_REASON.summaryOnly }

  const totalAmount = document.totalAmount
  if (totalAmount === null || !isPositiveAmount(totalAmount)) {
    return { reason: CTE_BATCH_BLOCK_REASON.missingTotal }
  }

  const senderTaxId = document.senderTaxId
  const recipientTaxId = document.recipientTaxId
  if (!isFullTaxId(senderTaxId) || !isFullTaxId(recipientTaxId)) {
    return { reason: CTE_BATCH_BLOCK_REASON.missingParty }
  }
  if (
    !isFilled(document.senderCity) ||
    !isFilled(document.senderState) ||
    !isFilled(document.recipientCity) ||
    !isFilled(document.recipientState)
  ) {
    return { reason: CTE_BATCH_BLOCK_REASON.missingMunicipality }
  }
  if (document.grossWeight === null || !isPositiveAmount(document.grossWeight)) {
    return { reason: CTE_BATCH_BLOCK_REASON.missingWeight }
  }

  return { chargeable: { recipientTaxId, senderTaxId, totalAmount } }
}

export function isFreightRuleInForce({
  referenceDate,
  validFrom,
  validUntil,
}: FreightRuleWindow): boolean {
  const reference = Date.parse(referenceDate)
  if (Date.parse(validFrom) > reference) return false

  return validUntil === null || Date.parse(validUntil) >= reference
}

function isFilled(value: string | null): boolean {
  return value !== null && value.trim().length > 0
}

function isFullTaxId(value: string | null): value is string {
  return value !== null && FULL_TAX_ID_PATTERN.test(value)
}

/** Persisted decimals are constrained to be non-negative, so any non-zero digit means positive. */
function isPositiveAmount(value: string): boolean {
  return /[1-9]/.test(value)
}
