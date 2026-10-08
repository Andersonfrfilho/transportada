/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NFSE_ISSUE_PERMISSION } from './nfseInvoice.constant'
import type { NfseInvoice } from './nfseInvoice.types'
import { NFSE_NATIONAL_TAXATION_MISSING_ERROR } from './nfseNationalTaxation.service'
import { REISSUABLE_STATUSES } from './nfseInvoiceRowActions.service'

export type NfseBulkReissueBlock = Readonly<{
  invoiceId: string
  reason: 'notReissuable'
}>

export type NfseBulkReissuePlan = Readonly<{
  blocked: readonly NfseBulkReissueBlock[]
  eligible: readonly NfseInvoice[]
  isAllowed: boolean
}>

export type NfseBulkReissueOutcome = Readonly<{
  errorCode?: null | string
  invoiceId: string
  isReissued: boolean
}>

export type NfseBulkReissueSummary = Readonly<{
  failed: number
  missingNationalTaxation: number
  reissued: number
  total: number
}>

const EMPTY_PLAN: NfseBulkReissuePlan = { blocked: [], eligible: [], isAllowed: false }

export function planNfseBulkReissue(
  input: Readonly<{ invoices: readonly NfseInvoice[]; permissions: readonly string[] }>,
): NfseBulkReissuePlan {
  if (!input.permissions.includes(NFSE_ISSUE_PERMISSION)) return EMPTY_PLAN

  return {
    blocked: input.invoices
      .filter((invoice) => !REISSUABLE_STATUSES.includes(invoice.status))
      .map((invoice) => ({ invoiceId: invoice.id, reason: 'notReissuable' as const })),
    eligible: input.invoices.filter((invoice) => REISSUABLE_STATUSES.includes(invoice.status)),
    isAllowed: true,
  }
}

export function summarizeNfseBulkReissue(
  outcomes: readonly NfseBulkReissueOutcome[],
): NfseBulkReissueSummary {
  const reissued = outcomes.filter((outcome) => outcome.isReissued).length

  const missingNationalTaxation = outcomes.filter(
    (outcome) => outcome.errorCode === NFSE_NATIONAL_TAXATION_MISSING_ERROR,
  ).length

  return {
    failed: outcomes.length - reissued,
    missingNationalTaxation,
    reissued,
    total: outcomes.length,
  }
}
