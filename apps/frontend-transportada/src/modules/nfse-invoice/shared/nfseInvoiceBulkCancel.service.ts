/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NFSE_CANCEL_PERMISSION } from './nfseInvoice.constant'
import type { NfseInvoice } from './nfseInvoice.types'

/** A API só transita `authorized` → `cancellation_requested`; o resto do lote seria 409 em série. */
const CANCELLABLE_STATUS = 'authorized'

/** Os motivos são chaves de `feedback.*` que já existem — o diálogo traduz sem texto novo. */
const BLOCK_REASON_BY_STATUS: Readonly<Record<string, NfseBulkCancelBlockReason>> = {
  cancellation_requested: 'cancellationInFlight',
  cancelled: 'alreadyCancelled',
}

export type NfseBulkCancelBlockReason =
  | 'alreadyCancelled'
  | 'cancellationInFlight'
  | 'notAuthorized'

export type NfseBulkCancelBlock = Readonly<{
  invoiceId: string
  reason: NfseBulkCancelBlockReason
}>

export type NfseBulkCancelPlan = Readonly<{
  blocked: readonly NfseBulkCancelBlock[]
  eligible: readonly NfseInvoice[]
  isAllowed: boolean
}>

export type NfseBulkCancelOutcome = Readonly<{
  invoiceId: string
  isCancelled: boolean
}>

export type NfseBulkCancelSummary = Readonly<{
  cancelled: number
  failed: number
  total: number
}>

const EMPTY_PLAN: NfseBulkCancelPlan = { blocked: [], eligible: [], isAllowed: false }

function resolveBlockReason(status: string): NfseBulkCancelBlockReason {
  return BLOCK_REASON_BY_STATUS[status] ?? 'notAuthorized'
}

export function planNfseBulkCancellation(
  input: Readonly<{ invoices: readonly NfseInvoice[]; permissions: readonly string[] }>,
): NfseBulkCancelPlan {
  if (!input.permissions.includes(NFSE_CANCEL_PERMISSION)) return EMPTY_PLAN

  return {
    blocked: input.invoices
      .filter((invoice) => invoice.status !== CANCELLABLE_STATUS)
      .map((invoice) => ({ invoiceId: invoice.id, reason: resolveBlockReason(invoice.status) })),
    eligible: input.invoices.filter((invoice) => invoice.status === CANCELLABLE_STATUS),
    isAllowed: true,
  }
}

/** Identificador de nota não diz nada a quem opera: o diálogo mostra o motivo e quantas caíram nele. */
export function countNfseBulkCancelBlocks(
  blocked: readonly NfseBulkCancelBlock[],
): readonly Readonly<{ count: number; reason: NfseBulkCancelBlockReason }>[] {
  const counters = new Map<NfseBulkCancelBlockReason, number>()

  for (const block of blocked) counters.set(block.reason, (counters.get(block.reason) ?? 0) + 1)

  return [...counters].map(([reason, count]) => ({ count, reason }))
}

export function summarizeNfseBulkCancellation(
  outcomes: readonly NfseBulkCancelOutcome[],
): NfseBulkCancelSummary {
  const cancelled = outcomes.filter((outcome) => outcome.isCancelled).length

  return { cancelled, failed: outcomes.length - cancelled, total: outcomes.length }
}
