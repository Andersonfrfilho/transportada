/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { BillingInvoiceCreate } from './billingClient.service'

function draftError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)
}

export function createBillingDrafts() {
  return {
    createCancelDraft(input: Record<string, unknown>) {
      if (
        !isRecord(input) ||
        Object.keys(input).some((key) => !['invoiceId', 'reason'].includes(key)) ||
        typeof input.invoiceId !== 'string' ||
        typeof input.reason !== 'string' ||
        input.reason.trim().length < 3
      ) {
        throw draftError('BILLING_INVALID_CANCEL_DRAFT')
      }
      return { invoiceId: input.invoiceId, reason: input.reason.trim() }
    },
    createInvoiceDraft(input: Record<string, unknown>): BillingInvoiceCreate {
      if (
        !isRecord(input) ||
        Object.keys(input).some((key) => !['cteIds', 'dueDate'].includes(key)) ||
        !isStringArray(input.cteIds) ||
        typeof input.dueDate !== 'string' ||
        input.dueDate.length === 0
      ) {
        throw draftError('BILLING_INVALID_INVOICE_DRAFT')
      }
      return { cteIds: [...input.cteIds], dueDate: input.dueDate }
    },
    createSelectionDraft(input: Record<string, unknown>) {
      if (
        !isRecord(input) ||
        Object.keys(input).some((key) => !['selectedIds'].includes(key)) ||
        !isStringArray(input.selectedIds)
      ) {
        throw draftError('BILLING_INVALID_SELECTION_DRAFT')
      }
      return { selectedIds: [...input.selectedIds] }
    },
  }
}
