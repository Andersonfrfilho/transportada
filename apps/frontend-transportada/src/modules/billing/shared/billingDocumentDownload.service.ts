/* Copyright (c) 2026 Ada Technology. MIT License. */
type BillingDocument = Readonly<{ downloadUrl: string }>

export const BILLING_DOCUMENT_UNKNOWN_MESSAGE_KEY = 'invoices.documentAction.errors.unknown'

const BILLING_DOCUMENT_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  BILLING_FORBIDDEN: 'invoices.documentAction.errors.forbidden',
  BILLING_INVOICE_DOCUMENT_CONFLICT: 'invoices.documentAction.errors.conflict',
  BILLING_INVOICE_FISCAL_PROFILE_MISSING: 'invoices.documentAction.errors.fiscalProfileMissing',
  BILLING_INVOICE_NOT_FOUND: 'invoices.documentAction.errors.notFound',
  FORBIDDEN: 'invoices.documentAction.errors.forbidden',
}

function isDocument(value: unknown): value is BillingDocument {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BillingDocument).downloadUrl === 'string'
  )
}

export function resolveBillingDocumentMessageKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return BILLING_DOCUMENT_MESSAGE_KEYS[code] ?? BILLING_DOCUMENT_UNKNOWN_MESSAGE_KEY
}

export function resolveBillingDocumentActionState(
  input: Readonly<{ canGenerate: boolean; invoiceId: string; pendingInvoiceId: null | string }>,
): Readonly<{ isDisabled: boolean; isPending: boolean }> {
  const isPending = input.pendingInvoiceId === input.invoiceId

  return {
    isDisabled: !input.canGenerate || input.pendingInvoiceId !== null,
    isPending,
  }
}

export function createBillingDocumentDownloadController(
  input: Readonly<{ openUrl: (url: string) => void }>,
) {
  return {
    openDocument(document: unknown): void {
      if (!isDocument(document)) throw new Error('BILLING_INVALID_DOCUMENT')
      input.openUrl(document.downloadUrl)
    },
  }
}
