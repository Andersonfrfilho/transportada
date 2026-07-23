/* Copyright (c) 2026 Ada Technology. MIT License. */
function validationError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isMoneyDecimal(value: unknown): value is string {
  return isString(value) && /^(?:0|[1-9][0-9]{0,14})\.[0-9]{2}$/.test(value)
}

function rejectExtraKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: string,
): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw validationError(code)
  }
}

export function createBillingResponseAdapters() {
  return {
    documentPageFromApi(input: unknown): BillingDocumentPage {
      if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) {
        throw validationError('BILLING_INVALID_DOCUMENTS_RESPONSE')
      }
      const nextCursor = input.page.nextCursor
      if (nextCursor !== null && !isString(nextCursor)) {
        throw validationError('BILLING_INVALID_DOCUMENTS_RESPONSE')
      }
      try {
        return {
          items: input.data.map(mapDocument),
          nextCursor,
        }
      } catch {
        throw validationError('BILLING_INVALID_DOCUMENTS_RESPONSE')
      }
    },
    eligiblePageFromApi(input: unknown): BillingEligiblePage {
      if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) {
        throw validationError('BILLING_INVALID_ELIGIBLE_RESPONSE')
      }
      const nextCursor = input.page.nextCursor
      if (nextCursor !== null && !isString(nextCursor)) {
        throw validationError('BILLING_INVALID_ELIGIBLE_RESPONSE')
      }
      try {
        return {
          items: input.data.map(mapEligibleCte),
          nextCursor,
        }
      } catch {
        throw validationError('BILLING_INVALID_ELIGIBLE_RESPONSE')
      }
    },
    invoiceFromApi(input: unknown): BillingInvoiceSummary {
      if (!isRecord(input) || !isRecord(input.data)) {
        throw validationError('BILLING_INVALID_INVOICE_RESPONSE')
      }
      return mapInvoice(input.data)
    },
  }
}

function mapEligibleCte(input: unknown): BillingEligibleCte {
  if (!isRecord(input)) throw validationError('BILLING_INVALID_ELIGIBLE_RESPONSE')
  rejectExtraKeys(
    input,
    [
      'batchId',
      'cteId',
      'cteNumber',
      'customerDocument',
      'customerName',
      'issuedAt',
      'totalAmount',
    ],
    'BILLING_INVALID_ELIGIBLE_RESPONSE',
  )
  if (
    !isString(input.batchId) ||
    !isString(input.cteId) ||
    !isString(input.cteNumber) ||
    !isString(input.customerDocument) ||
    !isString(input.customerName) ||
    !isString(input.issuedAt) ||
    !isMoneyDecimal(input.totalAmount)
  ) {
    throw validationError('BILLING_INVALID_ELIGIBLE_RESPONSE')
  }
  return {
    batchId: input.batchId,
    cteId: input.cteId,
    cteNumber: input.cteNumber,
    customerDocument: input.customerDocument,
    customerName: input.customerName,
    issuedAt: input.issuedAt,
    totalAmount: input.totalAmount,
  }
}

function mapInvoice(input: unknown): BillingInvoiceSummary {
  if (!isRecord(input) || !isRecord(input.customer)) {
    throw validationError('BILLING_INVALID_INVOICE_RESPONSE')
  }
  rejectExtraKeys(
    input,
    [
      'cancelledAt',
      'cancellationReason',
      'createdAt',
      'customer',
      'dueDate',
      'id',
      'invoiceNumber',
      'issuedAt',
      'itemCount',
      'status',
      'totalAmount',
      'updatedAt',
    ],
    'BILLING_INVALID_INVOICE_RESPONSE',
  )
  rejectExtraKeys(input.customer, ['document', 'name'], 'BILLING_INVALID_INVOICE_RESPONSE')
  if (
    !isString(input.createdAt) ||
    !isString(input.customer.document) ||
    !isString(input.customer.name) ||
    !isString(input.dueDate) ||
    !isString(input.id) ||
    !Number.isSafeInteger(input.invoiceNumber) ||
    !isString(input.issuedAt) ||
    !['issued', 'cancelled'].includes(String(input.status)) ||
    !isMoneyDecimal(input.totalAmount) ||
    !isString(input.updatedAt)
  ) {
    throw validationError('BILLING_INVALID_INVOICE_RESPONSE')
  }
  return {
    createdAt: input.createdAt,
    customer: {
      document: input.customer.document,
      name: input.customer.name,
    },
    dueDate: input.dueDate,
    id: input.id,
    invoiceNumber: input.invoiceNumber as number,
    issuedAt: input.issuedAt,
    ...(typeof input.itemCount === 'number' ? { itemCount: input.itemCount } : {}),
    status: input.status as 'cancelled' | 'issued',
    totalAmount: input.totalAmount,
    updatedAt: input.updatedAt,
  }
}

function mapDocument(input: unknown): BillingDocument {
  if (!isRecord(input)) throw validationError('BILLING_INVALID_DOCUMENTS_RESPONSE')
  rejectExtraKeys(
    input,
    ['contentType', 'documentId', 'documentType', 'downloadUrl', 'expiresAt', 'sha256'],
    'BILLING_INVALID_DOCUMENTS_RESPONSE',
  )
  if (
    input.contentType !== 'application/pdf' ||
    !isString(input.documentId) ||
    input.documentType !== 'invoice_pdf' ||
    !isString(input.downloadUrl) ||
    !isString(input.expiresAt) ||
    !isString(input.sha256)
  ) {
    throw validationError('BILLING_INVALID_DOCUMENTS_RESPONSE')
  }
  return {
    contentType: 'application/pdf',
    documentId: input.documentId,
    documentType: 'invoice_pdf',
    downloadUrl: input.downloadUrl,
    expiresAt: input.expiresAt,
    sha256: input.sha256,
  }
}

type BillingEligibleCte = Readonly<{
  batchId: string
  cteId: string
  cteNumber: string
  customerDocument: string
  customerName: string
  issuedAt: string
  totalAmount: string
}>

type BillingEligiblePage = Readonly<{
  items: readonly BillingEligibleCte[]
  nextCursor: null | string
}>

type BillingInvoiceSummary = Readonly<{
  createdAt: string
  customer: Readonly<{ document: string; name: string }>
  dueDate: string
  id: string
  invoiceNumber: number
  itemCount?: number
  issuedAt: string
  status: 'cancelled' | 'issued'
  totalAmount: string
  updatedAt: string
}>

type BillingDocument = Readonly<{
  contentType: 'application/pdf'
  documentId: string
  documentType: 'invoice_pdf'
  downloadUrl: string
  expiresAt: string
  sha256: string
}>

type BillingDocumentPage = Readonly<{
  items: readonly BillingDocument[]
  nextCursor: null | string
}>
