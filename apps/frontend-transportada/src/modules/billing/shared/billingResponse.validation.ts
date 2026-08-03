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
    documentFromApi(input: unknown): BillingDocument {
      if (!isRecord(input) || !isRecord(input.data)) {
        throw validationError('BILLING_INVALID_DOCUMENTS_RESPONSE')
      }
      return mapDocument(input.data)
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
    invoicePageFromApi(input: unknown): BillingInvoicePage {
      if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) {
        throw validationError('BILLING_INVALID_INVOICES_RESPONSE')
      }
      const nextCursor = input.page.nextCursor
      if (nextCursor !== null && !isString(nextCursor)) {
        throw validationError('BILLING_INVALID_INVOICES_RESPONSE')
      }
      try {
        return {
          items: input.data.map(mapInvoice),
          nextCursor,
        }
      } catch {
        throw validationError('BILLING_INVALID_INVOICES_RESPONSE')
      }
    },
    previewFromApi(input: unknown): BillingPreview {
      if (
        !isRecord(input) ||
        !isRecord(input.data) ||
        !Array.isArray(input.data.blocked) ||
        !Array.isArray(input.data.groups)
      ) {
        throw validationError('BILLING_INVALID_PREVIEW_RESPONSE')
      }
      rejectExtraKeys(input.data, ['blocked', 'groups'], 'BILLING_INVALID_PREVIEW_RESPONSE')
      return {
        blocked: input.data.blocked.map(mapPreviewBlock),
        groups: input.data.groups.map(mapPreviewGroup),
      }
    },
  }
}

function mapPreviewBlock(input: unknown): BillingPreviewBlock {
  if (!isRecord(input)) throw validationError('BILLING_INVALID_PREVIEW_RESPONSE')
  rejectExtraKeys(input, ['cteId', 'reason'], 'BILLING_INVALID_PREVIEW_RESPONSE')
  if (!isString(input.cteId) || !isString(input.reason)) {
    throw validationError('BILLING_INVALID_PREVIEW_RESPONSE')
  }
  return { cteId: input.cteId, reason: input.reason }
}

function mapPreviewGroup(input: unknown): BillingPreviewGroup {
  if (!isRecord(input)) throw validationError('BILLING_INVALID_PREVIEW_RESPONSE')
  rejectExtraKeys(
    input,
    ['cteCount', 'cteIds', 'customerDocument', 'customerName', 'totalAmount'],
    'BILLING_INVALID_PREVIEW_RESPONSE',
  )
  if (
    typeof input.cteCount !== 'number' ||
    !Array.isArray(input.cteIds) ||
    !input.cteIds.every(isString) ||
    !isString(input.customerDocument) ||
    !isString(input.customerName) ||
    !isMoneyDecimal(input.totalAmount)
  ) {
    throw validationError('BILLING_INVALID_PREVIEW_RESPONSE')
  }
  return {
    cteCount: input.cteCount,
    cteIds: input.cteIds,
    customerDocument: input.customerDocument,
    customerName: input.customerName,
    totalAmount: input.totalAmount,
  }
}

function mapEligibleCte(input: unknown): BillingEligibleCte {
  if (!isRecord(input)) throw validationError('BILLING_INVALID_ELIGIBLE_RESPONSE')
  rejectExtraKeys(
    input,
    [
      'batchId',
      'batchName',
      'cteId',
      'cteNumber',
      'customerDocument',
      'customerName',
      'issuedAt',
      'nfeNumber',
      'totalAmount',
    ],
    'BILLING_INVALID_ELIGIBLE_RESPONSE',
  )
  // CT-e sem nota vinculada continua listável: o número vem `null`, não ausente.
  if (
    !isString(input.batchId) ||
    !isString(input.batchName) ||
    !isString(input.cteId) ||
    !isString(input.cteNumber) ||
    !isString(input.customerDocument) ||
    !isString(input.customerName) ||
    !isString(input.issuedAt) ||
    (input.nfeNumber !== null && !isString(input.nfeNumber)) ||
    !isMoneyDecimal(input.totalAmount)
  ) {
    throw validationError('BILLING_INVALID_ELIGIBLE_RESPONSE')
  }
  return {
    batchId: input.batchId,
    batchName: input.batchName,
    cteId: input.cteId,
    cteNumber: input.cteNumber,
    customerDocument: input.customerDocument,
    customerName: input.customerName,
    issuedAt: input.issuedAt,
    nfeNumber: input.nfeNumber,
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
      'discountAmount',
      'dueDate',
      'id',
      'invoiceNumber',
      'issuedAt',
      'itemCount',
      'items',
      'observations',
      'status',
      'subtotalAmount',
      'surchargeAmount',
      'totalAmount',
      'updatedAt',
    ],
    'BILLING_INVALID_INVOICE_RESPONSE',
  )
  rejectExtraKeys(input.customer, ['document', 'name'], 'BILLING_INVALID_INVOICE_RESPONSE')
  if (
    !isMoneyDecimal(input.discountAmount) ||
    !isMoneyDecimal(input.subtotalAmount) ||
    !isMoneyDecimal(input.surchargeAmount) ||
    !isString(input.observations) ||
    (input.items !== undefined && !Array.isArray(input.items)) ||
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
  /** A listagem não traz o detalhamento por CT-e: só o detalhe da fatura carrega `items`. */
  const items = Array.isArray(input.items) ? input.items.map(mapInvoiceItem) : []
  return {
    createdAt: input.createdAt,
    customer: {
      document: input.customer.document,
      name: input.customer.name,
    },
    discountAmount: input.discountAmount,
    dueDate: input.dueDate,
    id: input.id,
    invoiceNumber: input.invoiceNumber as number,
    issuedAt: input.issuedAt,
    itemCount: typeof input.itemCount === 'number' ? input.itemCount : items.length,
    items,
    observations: input.observations,
    status: input.status as 'cancelled' | 'issued',
    subtotalAmount: input.subtotalAmount,
    surchargeAmount: input.surchargeAmount,
    totalAmount: input.totalAmount,
    updatedAt: input.updatedAt,
  }
}

function mapInvoiceItem(input: unknown): BillingInvoiceItem {
  if (!isRecord(input)) throw validationError('BILLING_INVALID_INVOICE_RESPONSE')
  rejectExtraKeys(
    input,
    ['accessKey', 'cteNumber', 'description', 'totalAmount'],
    'BILLING_INVALID_INVOICE_RESPONSE',
  )
  if (
    !isString(input.accessKey) ||
    !isString(input.cteNumber) ||
    !isString(input.description) ||
    !isMoneyDecimal(input.totalAmount)
  ) {
    throw validationError('BILLING_INVALID_INVOICE_RESPONSE')
  }
  return {
    accessKey: input.accessKey,
    cteNumber: input.cteNumber,
    description: input.description,
    totalAmount: input.totalAmount,
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
  batchName: string
  cteId: string
  cteNumber: string
  customerDocument: string
  customerName: string
  issuedAt: string
  nfeNumber: null | string
  totalAmount: string
}>

type BillingEligiblePage = Readonly<{
  items: readonly BillingEligibleCte[]
  nextCursor: null | string
}>

type BillingInvoiceItem = Readonly<{
  accessKey: string
  cteNumber: string
  description: string
  totalAmount: string
}>

type BillingInvoiceSummary = Readonly<{
  createdAt: string
  customer: Readonly<{ document: string; name: string }>
  discountAmount: string
  dueDate: string
  id: string
  invoiceNumber: number
  itemCount: number
  items: readonly BillingInvoiceItem[]
  issuedAt: string
  observations: string
  status: 'cancelled' | 'issued'
  subtotalAmount: string
  surchargeAmount: string
  totalAmount: string
  updatedAt: string
}>

type BillingInvoicePage = Readonly<{
  items: readonly BillingInvoiceSummary[]
  nextCursor: null | string
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

type BillingPreviewBlock = Readonly<{ cteId: string; reason: string }>

type BillingPreviewGroup = Readonly<{
  cteCount: number
  cteIds: readonly string[]
  customerDocument: string
  customerName: string
  totalAmount: string
}>

type BillingPreview = Readonly<{
  blocked: readonly BillingPreviewBlock[]
  groups: readonly BillingPreviewGroup[]
}>
