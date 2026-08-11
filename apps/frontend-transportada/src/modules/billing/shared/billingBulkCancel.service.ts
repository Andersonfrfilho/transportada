/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolveProgressPercent } from '@/modules/shared/progress.service'

import type { BillingInvoiceSummary } from './billingClient.service'
import {
  BILLING_GROUP_CONCURRENCY,
  BILLING_UNKNOWN_ERROR_CODE,
} from './billingFromSelection.service'
import {
  BILLING_CANCEL_REASON_MIN_LENGTH,
  BILLING_CANCELLED_STATUS,
} from './billingInvoiceDetail.service'

export const BILLING_CANCEL_REASON_ERROR = {
  REQUIRED: 'required',
  TOO_SHORT: 'tooShort',
} as const
export type BillingCancelReasonError =
  (typeof BILLING_CANCEL_REASON_ERROR)[keyof typeof BILLING_CANCEL_REASON_ERROR]

export type BillingCancelSelection = Readonly<{
  alreadyCancelled: readonly BillingInvoiceSummary[]
  cancellable: readonly BillingInvoiceSummary[]
}>

export type BillingCancelOutcome = Readonly<{
  errorCode?: string
  invoiceId: string
  invoiceNumber: number
}>

export type BillingCancelProgressEvent = Readonly<{
  completed: number
  outcome: BillingCancelOutcome
  total: number
}>

export type BillingCancelProgress = Readonly<{
  errorCount: number
  isComplete: boolean
  percent: number
  successCount: number
  total: number
}>

type CancelInvoicePort = Readonly<{
  cancelInvoice: (
    input: Readonly<{ invoiceId: string; reason: string }>,
  ) => Promise<BillingInvoiceSummary>
}>

/**
 * A seleção sobrevive à paginação e à recarga da lista: id que não está mais na página não vira
 * requisição às cegas, e fatura já cancelada sai da fila antes — a API responderia 409.
 */
export function selectCancellableInvoices(
  input: Readonly<{
    invoices: readonly BillingInvoiceSummary[]
    selectedIds: readonly string[]
  }>,
): BillingCancelSelection {
  const selected = new Set(input.selectedIds)
  const chosen = input.invoices.filter((invoice) => selected.has(invoice.id))

  return {
    alreadyCancelled: chosen.filter((invoice) => invoice.status === BILLING_CANCELLED_STATUS),
    cancellable: chosen.filter((invoice) => invoice.status !== BILLING_CANCELLED_STATUS),
  }
}

export function validateBillingCancelReason(value: string): BillingCancelReasonError | null {
  const reason = value.trim()
  if (reason.length === 0) return BILLING_CANCEL_REASON_ERROR.REQUIRED
  if (reason.length < BILLING_CANCEL_REASON_MIN_LENGTH) return BILLING_CANCEL_REASON_ERROR.TOO_SHORT
  return null
}

function readErrorCode(caught: unknown): string {
  return caught instanceof Error && caught.message !== ''
    ? caught.message
    : BILLING_UNKNOWN_ERROR_CODE
}

async function cancelOne(
  input: Readonly<{ client: CancelInvoicePort; invoice: BillingInvoiceSummary; reason: string }>,
): Promise<BillingCancelOutcome> {
  try {
    await input.client.cancelInvoice({ invoiceId: input.invoice.id, reason: input.reason })
    return { invoiceId: input.invoice.id, invoiceNumber: input.invoice.invoiceNumber }
  } catch (caught: unknown) {
    return {
      errorCode: readErrorCode(caught),
      invoiceId: input.invoice.id,
      invoiceNumber: input.invoice.invoiceNumber,
    }
  }
}

/**
 * Cancelar é irreversível e uma a uma: uma falha no meio não pode abortar as demais, senão o
 * operador fica sem saber quais faturas realmente saíram. A fila anda em poucas por vez.
 */
export async function cancelBillingInvoices(
  input: Readonly<{
    client: CancelInvoicePort
    invoices: readonly BillingInvoiceSummary[]
    onProgress?: (event: BillingCancelProgressEvent) => void
    reason: string
  }>,
): Promise<readonly BillingCancelOutcome[]> {
  const total = input.invoices.length
  const reason = input.reason.trim()
  const outcomes: BillingCancelOutcome[] = []
  let nextIndex = 0
  let completed = 0

  async function consumeQueue(): Promise<void> {
    for (;;) {
      const index = nextIndex
      const invoice = input.invoices[index]
      if (invoice === undefined) return
      nextIndex += 1
      const outcome = await cancelOne({ client: input.client, invoice, reason })
      outcomes[index] = outcome
      completed += 1
      input.onProgress?.({ completed, outcome, total })
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BILLING_GROUP_CONCURRENCY, total) }, consumeQueue),
  )

  return outcomes
}

export function resolveBillingCancelProgress(
  input: Readonly<{
    completed: number
    outcomes: readonly BillingCancelOutcome[]
    total: number
  }>,
): BillingCancelProgress {
  const errorCount = input.outcomes.filter((outcome) => outcome.errorCode !== undefined).length

  return {
    errorCount,
    isComplete: input.total > 0 && input.completed >= input.total,
    percent: resolveProgressPercent({ completed: input.completed, total: input.total }),
    successCount: input.outcomes.length - errorCount,
    total: input.total,
  }
}
