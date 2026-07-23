/* Copyright (c) 2026 Ada Technology. MIT License. */
type BillingDocument = Readonly<{ downloadUrl: string }>

function isDocument(value: unknown): value is BillingDocument {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BillingDocument).downloadUrl === 'string'
  )
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
