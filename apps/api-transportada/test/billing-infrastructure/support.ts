/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SQL } from 'drizzle-orm'
import { getTableName } from 'drizzle-orm'
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core'

import type { InvoiceReportQueryable } from '../../src/billing/infrastructure/invoice-report.query.js'

type Row = Record<string, unknown>

export type StubRowsByTable = Readonly<Record<string, readonly Row[]>>

type QueryBuilder = {
  readonly from: (table: PgTable) => QueryBuilder
  readonly innerJoin: () => QueryBuilder
  readonly leftJoin: () => QueryBuilder
  readonly limit: (count: number) => QueryBuilder
  readonly orderBy: (...expressions: readonly SQL[]) => QueryBuilder
  readonly then: (resolve: (rows: readonly Row[]) => unknown) => Promise<unknown>
  readonly where: () => QueryBuilder
}

const dialect = new PgDialect()

/**
 * Substitui o query builder do Drizzle sem banco: devolve linhas por tabela consultada, no mesmo
 * padrão usado em test/cte-issuance-infrastructure/support.ts.
 */
export function createInvoiceReportQueryableStub(rows: StubRowsByTable): {
  readonly orderings: readonly string[]
  readonly queryable: InvoiceReportQueryable
} {
  const orderings: string[] = []

  function createBuilder(): QueryBuilder {
    let tableName = ''
    let limitCount: null | number = null

    const builder: QueryBuilder = {
      from(table) {
        tableName = getTableName(table)
        return builder
      },
      innerJoin: () => builder,
      leftJoin: () => builder,
      limit(count) {
        limitCount = count
        return builder
      },
      orderBy(...expressions) {
        for (const expression of expressions) orderings.push(dialect.sqlToQuery(expression).sql)
        return builder
      },
      then(resolve) {
        const selected = rows[tableName] ?? []
        return Promise.resolve(limitCount === null ? selected : selected.slice(0, limitCount)).then(
          resolve,
        )
      },
      where: () => builder,
    }

    return builder
  }

  return {
    orderings,
    queryable: { select: () => createBuilder() } as unknown as InvoiceReportQueryable,
  }
}

export const REPORT_COMPANY_ID = '00000000-0000-4000-8000-000000000901'
export const REPORT_INVOICE_ID = '00000000-0000-4000-8000-000000000902'
export const REPORT_BATCH_ITEM_A_ID = '00000000-0000-4000-8000-000000000903'
export const REPORT_BATCH_ITEM_B_ID = '00000000-0000-4000-8000-000000000904'
export const REPORT_CTE_DOCUMENT_A_ID = '00000000-0000-4000-8000-000000000905'
export const REPORT_CTE_DOCUMENT_B_ID = '00000000-0000-4000-8000-000000000906'

export const REPORT_CTE_DOCUMENT_A_AUTHORIZED_AT = new Date('2026-07-10T12:00:00.000Z')
export const REPORT_CTE_DOCUMENT_B_AUTHORIZED_AT = new Date('2026-07-12T09:30:00.000Z')

export function buildInvoiceReportRows(): StubRowsByTable {
  return {
    billing_invoice_items: [
      {
        batchItemId: REPORT_BATCH_ITEM_A_ID,
        cteDocumentId: REPORT_CTE_DOCUMENT_A_ID,
        lineNumber: 1n,
        totalAmount: '850.00',
      },
      {
        batchItemId: REPORT_BATCH_ITEM_B_ID,
        cteDocumentId: REPORT_CTE_DOCUMENT_B_ID,
        lineNumber: 2n,
        totalAmount: '620.00',
      },
    ],
    cte_batch_item_documents: [
      { itemId: REPORT_BATCH_ITEM_A_ID, nfeDocumentId: 'nfe-1', position: 1n },
      { itemId: REPORT_BATCH_ITEM_B_ID, nfeDocumentId: 'nfe-2', position: 1n },
      { itemId: REPORT_BATCH_ITEM_B_ID, nfeDocumentId: 'nfe-3', position: 2n },
    ],
    cte_fiscal_documents: [
      {
        authorizedAt: REPORT_CTE_DOCUMENT_A_AUTHORIZED_AT,
        fiscalNumber: 1001n,
        fiscalSeries: '1',
        id: REPORT_CTE_DOCUMENT_A_ID,
      },
      {
        authorizedAt: REPORT_CTE_DOCUMENT_B_AUTHORIZED_AT,
        fiscalNumber: 1002n,
        fiscalSeries: '1',
        id: REPORT_CTE_DOCUMENT_B_ID,
      },
    ],
    nfe_documents: [
      { id: 'nfe-1', number: '555', series: '1' },
      { id: 'nfe-2', number: '600', series: '2' },
      { id: 'nfe-3', number: '601', series: '2' },
    ],
    nfe_participants: [
      {
        documentId: 'nfe-1',
        legalName: 'DESTINATARIO ALFA LTDA',
        role: 'recipient',
        taxId: '11222333000181',
      },
      {
        documentId: 'nfe-2',
        legalName: 'DESTINATARIO BRAVO LTDA',
        role: 'recipient',
        taxId: '44555666000172',
      },
      {
        documentId: 'nfe-3',
        legalName: 'DESTINATARIO BRAVO LTDA',
        role: 'recipient',
        taxId: '44555666000172',
      },
    ],
    nfe_volumes: [
      { documentId: 'nfe-1', grossWeight: '120.5000', netWeight: '110.0000' },
      { documentId: 'nfe-1', grossWeight: '10.0000', netWeight: '9.0000' },
      { documentId: 'nfe-2', grossWeight: '45.2500', netWeight: '40.0000' },
    ],
  }
}
