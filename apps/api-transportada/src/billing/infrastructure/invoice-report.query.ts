/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray } from 'drizzle-orm'

import {
  billingInvoiceItems,
  cteBatchItemDocuments,
  cteFiscalDocuments,
  nfeDocuments,
  nfeParticipants,
  nfeVolumes,
} from '../../database/database.schema.js'
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type InvoiceReportQueryable = Database | Transaction

const RECIPIENT_ROLE = 'recipient'
const WEIGHT_ERROR_CODE_PREFIX = 'BILLING_INVOICE_REPORT'

export type InvoiceReportNfeDocument = {
  readonly number: string
  readonly series: string
}

export type InvoiceReportRow = {
  readonly batchItemId: string
  readonly cteFiscalNumber: bigint
  readonly cteFiscalSeries: string
  readonly grossWeight: string
  readonly issuedAt: Date | null
  readonly netWeight: string
  readonly nfeDocuments: readonly InvoiceReportNfeDocument[]
  readonly recipientLegalName: string | null
  readonly recipientTaxId: string | null
  readonly totalAmount: string
}

export type InvoiceReportQuery = {
  readonly companyId: string
  readonly invoiceId: string
}

type CompanyScope = {
  readonly companyId: string
}

type DocumentScope = CompanyScope & {
  readonly documentIds: readonly string[]
}

type WeightTotals = {
  readonly grossWeight: bigint
  readonly netWeight: bigint
}

export function buildInvoiceItemFilters(input: CompanyScope & { readonly invoiceId: string }) {
  return [
    eq(billingInvoiceItems.companyId, input.companyId),
    eq(billingInvoiceItems.invoiceId, input.invoiceId),
  ]
}

export function buildCteDocumentFilters(
  input: CompanyScope & { readonly cteDocumentIds: readonly string[] },
) {
  return [
    eq(cteFiscalDocuments.companyId, input.companyId),
    inArray(cteFiscalDocuments.id, [...input.cteDocumentIds]),
  ]
}

export function buildItemDocumentFilters(
  input: CompanyScope & { readonly batchItemIds: readonly string[] },
) {
  return [
    eq(cteBatchItemDocuments.companyId, input.companyId),
    inArray(cteBatchItemDocuments.itemId, [...input.batchItemIds]),
  ]
}

export function buildNfeDocumentFilters(input: DocumentScope) {
  return [
    eq(nfeDocuments.companyId, input.companyId),
    inArray(nfeDocuments.id, [...input.documentIds]),
  ]
}

export function buildRecipientFilters(input: DocumentScope) {
  return [
    eq(nfeParticipants.companyId, input.companyId),
    inArray(nfeParticipants.documentId, [...input.documentIds]),
    eq(nfeParticipants.role, RECIPIENT_ROLE),
  ]
}

export function buildVolumeFilters(input: DocumentScope) {
  return [
    eq(nfeVolumes.companyId, input.companyId),
    inArray(nfeVolumes.documentId, [...input.documentIds]),
  ]
}

export async function findInvoiceReportRows(
  queryable: InvoiceReportQueryable,
  query: InvoiceReportQuery,
): Promise<readonly InvoiceReportRow[]> {
  const items = await queryable
    .select({
      batchItemId: billingInvoiceItems.batchItemId,
      cteDocumentId: billingInvoiceItems.cteDocumentId,
      totalAmount: billingInvoiceItems.totalAmount,
    })
    .from(billingInvoiceItems)
    .where(
      and(...buildInvoiceItemFilters({ companyId: query.companyId, invoiceId: query.invoiceId })),
    )
    .orderBy(asc(billingInvoiceItems.lineNumber))
  if (items.length === 0) return []

  const cteDocumentIds = items.map((item) => item.cteDocumentId)
  const batchItemIds = items.map((item) => item.batchItemId)

  const [cteDocuments, itemDocuments] = await Promise.all([
    loadCteDocuments(queryable, query.companyId, cteDocumentIds),
    loadItemDocuments(queryable, query.companyId, batchItemIds),
  ])

  const nfeDocumentIds = [...itemDocuments.values()].flat()

  const [documents, recipients, weights] = await Promise.all([
    loadNfeDocuments(queryable, query.companyId, nfeDocumentIds),
    loadRecipients(queryable, query.companyId, nfeDocumentIds),
    loadWeights(queryable, query.companyId, nfeDocumentIds),
  ])

  return items.flatMap((item) => {
    const cteDocument = cteDocuments.get(item.cteDocumentId)
    if (cteDocument === undefined) return []

    const bundledDocumentIds = itemDocuments.get(item.batchItemId) ?? []
    const recipient = recipients.get(bundledDocumentIds[0] ?? '')

    return [
      {
        batchItemId: item.batchItemId,
        cteFiscalNumber: cteDocument.fiscalNumber,
        cteFiscalSeries: cteDocument.fiscalSeries,
        grossWeight: sumWeights(bundledDocumentIds, weights, 'grossWeight'),
        issuedAt: cteDocument.authorizedAt,
        netWeight: sumWeights(bundledDocumentIds, weights, 'netWeight'),
        nfeDocuments: bundledDocumentIds.flatMap((documentId) => {
          const document = documents.get(documentId)
          return document === undefined ? [] : [document]
        }),
        recipientLegalName: recipient?.legalName ?? null,
        recipientTaxId: recipient?.taxId ?? null,
        totalAmount: item.totalAmount,
      },
    ]
  })
}

async function loadCteDocuments(
  queryable: InvoiceReportQueryable,
  companyId: string,
  cteDocumentIds: readonly string[],
): Promise<
  Map<
    string,
    {
      readonly authorizedAt: Date | null
      readonly fiscalNumber: bigint
      readonly fiscalSeries: string
    }
  >
> {
  const rows = await queryable
    .select({
      authorizedAt: cteFiscalDocuments.authorizedAt,
      fiscalNumber: cteFiscalDocuments.fiscalNumber,
      fiscalSeries: cteFiscalDocuments.fiscalSeries,
      id: cteFiscalDocuments.id,
    })
    .from(cteFiscalDocuments)
    .where(and(...buildCteDocumentFilters({ cteDocumentIds, companyId })))

  return new Map(rows.map((row) => [row.id, row]))
}

async function loadItemDocuments(
  queryable: InvoiceReportQueryable,
  companyId: string,
  batchItemIds: readonly string[],
): Promise<Map<string, readonly string[]>> {
  const rows = await queryable
    .select({
      itemId: cteBatchItemDocuments.itemId,
      nfeDocumentId: cteBatchItemDocuments.nfeDocumentId,
    })
    .from(cteBatchItemDocuments)
    .where(and(...buildItemDocumentFilters({ batchItemIds, companyId })))
    .orderBy(asc(cteBatchItemDocuments.itemId), asc(cteBatchItemDocuments.position))

  const documents = new Map<string, string[]>()
  for (const row of rows) {
    const current = documents.get(row.itemId) ?? []
    current.push(row.nfeDocumentId)
    documents.set(row.itemId, current)
  }
  return documents
}

async function loadNfeDocuments(
  queryable: InvoiceReportQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, InvoiceReportNfeDocument>> {
  if (documentIds.length === 0) return new Map()

  const rows = await queryable
    .select({ id: nfeDocuments.id, number: nfeDocuments.number, series: nfeDocuments.series })
    .from(nfeDocuments)
    .where(and(...buildNfeDocumentFilters({ companyId, documentIds })))

  return new Map(rows.map((row) => [row.id, { number: row.number, series: row.series }]))
}

async function loadRecipients(
  queryable: InvoiceReportQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, { readonly legalName: string | null; readonly taxId: string | null }>> {
  if (documentIds.length === 0) return new Map()

  const rows = await queryable
    .select({
      documentId: nfeParticipants.documentId,
      legalName: nfeParticipants.legalName,
      taxId: nfeParticipants.taxId,
    })
    .from(nfeParticipants)
    .where(and(...buildRecipientFilters({ companyId, documentIds })))

  return new Map(
    rows.map((row) => [row.documentId, { legalName: row.legalName, taxId: row.taxId }]),
  )
}

async function loadWeights(
  queryable: InvoiceReportQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, WeightTotals>> {
  if (documentIds.length === 0) return new Map()

  const rows = await queryable
    .select({
      documentId: nfeVolumes.documentId,
      grossWeight: nfeVolumes.grossWeight,
      netWeight: nfeVolumes.netWeight,
    })
    .from(nfeVolumes)
    .where(and(...buildVolumeFilters({ companyId, documentIds })))

  const totals = new Map<string, WeightTotals>()
  for (const row of rows) {
    const current = totals.get(row.documentId) ?? { grossWeight: 0n, netWeight: 0n }
    totals.set(row.documentId, {
      grossWeight: current.grossWeight + parseWeight(row.grossWeight),
      netWeight: current.netWeight + parseWeight(row.netWeight),
    })
  }
  return totals
}

function parseWeight(value: string | null): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({
    errorCodePrefix: WEIGHT_ERROR_CODE_PREFIX,
    scale: MONEY_SCALE,
    value,
  })
}

function sumWeights(
  documentIds: readonly string[],
  weights: Map<string, WeightTotals>,
  field: keyof WeightTotals,
): string {
  const total = documentIds.reduce(
    (accumulated, documentId) => accumulated + (weights.get(documentId)?.[field] ?? 0n),
    0n,
  )
  return formatScaledDecimal(total, MONEY_SCALE)
}
