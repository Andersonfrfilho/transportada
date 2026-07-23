/* Copyright (c) 2026 Ada Technology. MIT License. */
export const BILLING_READ = 'billing.read'
export const BILLING_CREATE = 'billing.create'
export const BILLING_CANCEL = 'billing.cancel'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR =
  'WyIyMDI2LTA3LTIzVDEyOjAwOjAwLjAwMFoiLCIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDA3MDEiXQ'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'billing-contract-key-0001'
export const BILLING_INVOICE_ID = '00000000-0000-4000-8000-000000000701'
export const BILLING_DOCUMENT_ID = '00000000-0000-4000-8000-000000000702'
export const BILLING_CTE_ID_PRIMARY = '00000000-0000-4000-8000-000000000711'
export const BILLING_CTE_ID_SECONDARY = '00000000-0000-4000-8000-000000000712'

export type BillingEligibleCteContract = Readonly<{
  batchId: string
  cteId: string
  cteNumber: string
  customerDocument: string
  customerName: string
  issuedAt: string
  totalAmount: string
}>

export type BillingEligiblePageContract = Readonly<{
  items: readonly BillingEligibleCteContract[]
  nextCursor: null | string
}>

export type BillingCreateInvoiceRequestContract = Readonly<{
  cteIds: readonly string[]
  dueDate: string
}>

export type BillingInvoiceSummaryContract = Readonly<{
  createdAt: string
  customer: Readonly<{
    document: string
    name: string
  }>
  dueDate: string
  id: string
  invoiceNumber: number
  issuedAt: string
  status: 'cancelled' | 'issued'
  totalAmount: string
  updatedAt: string
}>

export type BillingDocumentContract = Readonly<{
  contentType: 'application/pdf'
  documentId: string
  documentType: 'invoice_pdf'
  downloadUrl: string
  expiresAt: string
  sha256: string
}>

export type BillingDocumentPageContract = Readonly<{
  items: readonly BillingDocumentContract[]
  nextCursor: null | string
}>

export const BILLING_ELIGIBLE_FILTERS = {
  batchId: '00000000-0000-4000-8000-000000000713',
  cteNumber: '123456',
  customerDocument: '12345678000199',
  issuedFrom: '2026-07-01',
  issuedTo: '2026-07-31',
  limit: 25,
  maxAmount: '350.50',
  minAmount: '100.00',
} as const

export const BILLING_CREATE_REQUEST = {
  cteIds: [BILLING_CTE_ID_PRIMARY, BILLING_CTE_ID_SECONDARY],
  dueDate: '2026-08-05',
} as const satisfies BillingCreateInvoiceRequestContract

export const BILLING_ELIGIBLE_PAGE = {
  items: [
    {
      batchId: BILLING_ELIGIBLE_FILTERS.batchId,
      cteId: BILLING_CTE_ID_PRIMARY,
      cteNumber: '123456',
      customerDocument: '12345678000199',
      customerName: 'Transportes Sul Ltda',
      issuedAt: '2026-07-23T10:00:00.000Z',
      totalAmount: '150.25',
    },
    {
      batchId: BILLING_ELIGIBLE_FILTERS.batchId,
      cteId: BILLING_CTE_ID_SECONDARY,
      cteNumber: '123457',
      customerDocument: '12345678000199',
      customerName: 'Transportes Sul Ltda',
      issuedAt: '2026-07-23T10:05:00.000Z',
      totalAmount: '200.25',
    },
  ],
  nextCursor: SYNTHETIC_CURSOR,
} as const satisfies BillingEligiblePageContract

export const BILLING_ISSUED_INVOICE = {
  createdAt: '2026-07-23T12:00:00.000Z',
  customer: {
    document: '12345678000199',
    name: 'Transportes Sul Ltda',
  },
  dueDate: '2026-08-05',
  id: BILLING_INVOICE_ID,
  invoiceNumber: 17,
  issuedAt: '2026-07-23T12:00:00.000Z',
  status: 'issued',
  totalAmount: '350.50',
  updatedAt: '2026-07-23T12:00:00.000Z',
} as const satisfies BillingInvoiceSummaryContract

export const BILLING_CANCELLED_INVOICE = {
  ...BILLING_ISSUED_INVOICE,
  status: 'cancelled',
  updatedAt: '2026-07-23T12:15:00.000Z',
} as const satisfies BillingInvoiceSummaryContract

export const BILLING_DOCUMENT_PAGE = {
  items: [
    {
      contentType: 'application/pdf',
      documentId: BILLING_DOCUMENT_ID,
      documentType: 'invoice_pdf',
      downloadUrl: 'https://storage.test/temporary/billing-invoice.pdf?signature=redacted',
      expiresAt: '2026-07-23T12:30:00.000Z',
      sha256: '1'.repeat(64),
    },
  ],
  nextCursor: null,
} as const satisfies BillingDocumentPageContract

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
