/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildBillingDocumentObjectKey,
  createInvoiceDocumentArchiveGateway,
} from '../../src/billing/infrastructure/invoice-document-archive.gateway.js'
import {
  buildDocumentFiscalProfileFilters,
  buildDocumentInvoiceFilters,
  buildInvoiceDocumentFilters,
  buildInvoiceDocumentListFilters,
  DOCUMENT_FISCAL_PROFILE_SELECTION,
  DOCUMENT_INVOICE_SELECTION,
} from '../../src/billing/infrastructure/drizzle-invoice-document.repository.js'
import { REPORT_COMPANY_ID, REPORT_INVOICE_ID } from './support.js'

const dialect = new PgDialect()
const ARCHIVE_BUCKET = 'billing-documents-test'
const ARCHIVE_NOW = new Date('2026-07-30T12:00:00.000Z')

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('Invoice document query tenant safety', () => {
  test('a fatura de origem do PDF é lida presa ao company_id do contexto', () => {
    const query = toSql(
      buildDocumentInvoiceFilters({ companyId: REPORT_COMPANY_ID, invoiceId: REPORT_INVOICE_ID }),
    )

    expect(query.sql).toContain('"billing_invoices"."company_id" = $')
    expect(query.sql).toContain('"billing_invoices"."id" = $')
    expect(query.params).toEqual([REPORT_COMPANY_ID, REPORT_INVOICE_ID])
  })

  test('o perfil fiscal do cabeçalho é lido presa ao company_id do contexto', () => {
    const query = toSql(buildDocumentFiscalProfileFilters({ companyId: REPORT_COMPANY_ID }))

    expect(query.sql).toContain('"company_fiscal_profiles"."company_id" = $')
    expect(query.params).toEqual([REPORT_COMPANY_ID])
  })

  test('a busca do documento já arquivado filtra empresa, fatura e espécie', () => {
    const query = toSql(
      buildInvoiceDocumentFilters({
        companyId: REPORT_COMPANY_ID,
        documentKind: 'pdf',
        invoiceId: REPORT_INVOICE_ID,
      }),
    )

    expect(query.sql).toContain('"billing_invoice_documents"."company_id" = $')
    expect(query.sql).toContain('"billing_invoice_documents"."invoice_id" = $')
    expect(query.sql).toContain('"billing_invoice_documents"."document_kind" = $')
    expect(query.params).toEqual([REPORT_COMPANY_ID, REPORT_INVOICE_ID, 'pdf'])
  })

  test('a listagem de documentos da fatura filtra empresa e fatura', () => {
    const query = toSql(
      buildInvoiceDocumentListFilters({
        companyId: REPORT_COMPANY_ID,
        invoiceId: REPORT_INVOICE_ID,
      }),
    )

    expect(query.sql).toContain('"billing_invoice_documents"."company_id" = $')
    expect(query.sql).toContain('"billing_invoice_documents"."invoice_id" = $')
    expect(query.params).toEqual([REPORT_COMPANY_ID, REPORT_INVOICE_ID])
  })

  test('a chave do objeto isola o tenant e a fatura no prefixo', () => {
    const key = buildBillingDocumentObjectKey({
      companyId: REPORT_COMPANY_ID,
      invoiceId: REPORT_INVOICE_ID,
      objectId: 'object-001',
    })

    expect(key).toBe(
      `tenants/${REPORT_COMPANY_ID}/billing-invoices/${REPORT_INVOICE_ID}/pdf/object-001.pdf`,
    )
    expect(key.startsWith(`tenants/${REPORT_COMPANY_ID}/`)).toBe(true)
  })
})

describe('Invoice document source columns contract', () => {
  test('a observação impressa vem da própria fatura, não de um texto fixo no código', () => {
    expect(DOCUMENT_INVOICE_SELECTION.observations.name).toBe('observations')
  })

  test('o fechamento do PDF lê banco, conta, PIX e observação padrão da empresa', () => {
    expect(DOCUMENT_FISCAL_PROFILE_SELECTION.defaultObservations.name).toBe('billing_observations')
    expect(
      Object.entries(DOCUMENT_FISCAL_PROFILE_SELECTION.payment).map(([key, column]) => [
        key,
        column.name,
      ]),
    ).toEqual([
      ['bankAccount', 'billing_bank_account'],
      ['bankBranch', 'billing_bank_branch'],
      ['bankCode', 'billing_bank_code'],
      ['bankName', 'billing_bank_name'],
      ['pixKey', 'billing_pix_key'],
    ])
  })
})

describe('Invoice document archive download contract', () => {
  test('assina o PDF como anexo com o nome pedido pela aplicação', async () => {
    const requests: Record<string, unknown>[] = []
    const objectKey = buildBillingDocumentObjectKey({
      companyId: REPORT_COMPANY_ID,
      invoiceId: REPORT_INVOICE_ID,
      objectId: 'object-001',
    })
    const gateway = createInvoiceDocumentArchiveGateway({
      bucket: ARCHIVE_BUCKET,
      now: () => ARCHIVE_NOW,
      storage: {
        async createSignedDownload(input) {
          requests.push(input)
          return new URL(`https://storage.test/${input.key}?signature=stub`)
        },
        async storeObject() {
          return undefined
        },
      },
    })

    const download = await gateway.createDownloadUrl({
      bucket: ARCHIVE_BUCKET,
      fileName: 'fatura-1042.pdf',
      key: objectKey,
    })

    // Sem `attachment` assinado o navegador abre o PDF na aba em vez de baixar.
    expect(requests).toEqual([
      {
        bucket: ARCHIVE_BUCKET,
        disposition: 'attachment',
        expiresInSeconds: 300,
        filename: 'fatura-1042.pdf',
        key: objectKey,
      },
    ])
    expect(download).toEqual({
      expiresAt: '2026-07-30T12:05:00.000Z',
      url: `https://storage.test/${objectKey}?signature=stub`,
    })
  })
})
