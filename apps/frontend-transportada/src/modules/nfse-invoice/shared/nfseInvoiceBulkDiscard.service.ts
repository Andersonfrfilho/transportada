/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NFSE_CANCEL_PERMISSION } from './nfseInvoice.constant'
import type { NfseInvoice } from './nfseInvoice.types'
import { DISCARDABLE_STATUSES } from './nfseInvoiceRowActions.service'

export type NfseBulkDiscardBlock = Readonly<{
  invoiceId: string
  reason: 'notDiscardable'
}>

export type NfseBulkDiscardPlan = Readonly<{
  blocked: readonly NfseBulkDiscardBlock[]
  eligible: readonly NfseInvoice[]
  isAllowed: boolean
}>

export type NfseBulkDiscardOutcome = Readonly<{
  invoiceId: string
  isDiscarded: boolean
}>

export type NfseBulkDiscardSummary = Readonly<{
  discarded: number
  failed: number
  total: number
}>

const EMPTY_PLAN: NfseBulkDiscardPlan = { blocked: [], eligible: [], isAllowed: false }

export function planNfseBulkDiscard(
  input: Readonly<{ invoices: readonly NfseInvoice[]; permissions: readonly string[] }>,
): NfseBulkDiscardPlan {
  if (!input.permissions.includes(NFSE_CANCEL_PERMISSION)) return EMPTY_PLAN

  return {
    blocked: input.invoices
      .filter((invoice) => !DISCARDABLE_STATUSES.includes(invoice.status))
      .map((invoice) => ({ invoiceId: invoice.id, reason: 'notDiscardable' as const })),
    eligible: input.invoices.filter((invoice) => DISCARDABLE_STATUSES.includes(invoice.status)),
    isAllowed: true,
  }
}

export function summarizeNfseBulkDiscard(
  outcomes: readonly NfseBulkDiscardOutcome[],
): NfseBulkDiscardSummary {
  const discarded = outcomes.filter((outcome) => outcome.isDiscarded).length

  return { discarded, failed: outcomes.length - discarded, total: outcomes.length }
}
