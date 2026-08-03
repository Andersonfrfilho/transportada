/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildCompanyItemFilters } from '../../src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.js'

const BATCH_ID = '00000000-0000-4000-8000-000000000501'
const COMPANY_ID = '00000000-0000-4000-8000-000000000502'
const ITEM_ID = '00000000-0000-4000-8000-000000000507'
const CURSOR_AT = new Date('2026-07-22T20:00:00.000Z')
const CURSOR_AT_PARAM = CURSOR_AT.toISOString()

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

const listFilters = (input: Parameters<typeof buildCompanyItemFilters>[0]) =>
  toSql(buildCompanyItemFilters(input))

describe('CT-e item listing query tenant safety', () => {
  test('scopes the listing by company even without a single filter', () => {
    const query = listFilters({ companyId: COMPANY_ID, cursor: null })

    expect(query.sql).toContain('"cte_batch_items"."company_id" = $')
    expect(query.params).toEqual([COMPANY_ID])
  })

  test('keeps the company filter in front of every optional filter', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: {
        batchId: BATCH_ID,
        cteNumberGte: '10',
        cteNumberLte: '90',
        invoiceNumberGte: '100',
        invoiceNumberLte: '900',
        issuedFrom: '2026-07-01T00:00:00.000Z',
        issuedUntil: '2026-07-31T23:59:59.000Z',
        statusIn: ['pending', 'authorized'],
      },
    })

    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).not.toContain(undefined)
  })

  test('reaches the linked invoices through a company scoped subquery', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { invoiceNumberGte: '100', invoiceNumberLte: '900' },
    })

    expect(query.sql).toContain('"cte_batch_item_documents"."company_id" = $')
    expect(query.sql).toContain('"nfe_documents"."company_id" = $')
    expect(query.sql).toContain('select')
    expect(query.params.filter((value) => value === COMPANY_ID)).toHaveLength(3)
  })

  test('reaches the linked invoices through a company scoped subquery for the invoice number list', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { invoiceNumberIn: ['100', '900'] },
    })

    expect(query.sql).toContain('"cte_batch_item_documents"."company_id" = $')
    expect(query.sql).toContain('"nfe_documents"."company_id" = $')
    expect(query.sql).toContain('select')
    expect(query.params.filter((value) => value === COMPANY_ID)).toHaveLength(3)
  })
})

describe('CT-e item listing query shape', () => {
  test('pages by the same keyset the batch listing uses', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: { createdAt: CURSOR_AT, id: ITEM_ID },
    })

    expect(query.sql).toContain('"cte_batch_items"."created_at" < $')
    expect(query.sql).toContain('"cte_batch_items"."created_at" = $')
    expect(query.sql).toContain('"cte_batch_items"."id" < $')
    expect(query.params).toEqual([COMPANY_ID, CURSOR_AT_PARAM, CURSOR_AT_PARAM, ITEM_ID])
  })

  test('filters the creation window by the item timestamp', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { issuedFrom: '2026-07-01T00:00:00.000Z', issuedUntil: '2026-07-31T23:59:59.000Z' },
    })

    expect(query.sql).toContain('"cte_batch_items"."created_at" >= $')
    expect(query.sql).toContain('"cte_batch_items"."created_at" <= $')
    expect(query.params).toEqual([
      COMPANY_ID,
      '2026-07-01T00:00:00.000Z',
      '2026-07-31T23:59:59.000Z',
    ])
  })

  test('filters one batch without losing the company scope', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { batchId: BATCH_ID },
    })

    expect(query.sql).toContain('"cte_batch_items"."batch_id" = $')
    expect(query.params).toEqual([COMPANY_ID, BATCH_ID])
  })

  test('ranges the CT-e number over the fiscal document, falling back to the attempt', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { cteNumberGte: '10', cteNumberLte: '90' },
    })

    expect(query.sql).toContain('coalesce')
    expect(query.sql).toContain('"cte_fiscal_documents"."fiscal_number"')
    expect(query.sql).toContain('"cte_issuance_attempts"."fiscal_number"')
    expect(query.params).toEqual([COMPANY_ID, 10n, 90n])
  })

  test('accepts an open ended CT-e number range', () => {
    const lowerOnly = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { cteNumberGte: '10' },
    })
    const upperOnly = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { cteNumberLte: '90' },
    })

    expect(lowerOnly.params).toEqual([COMPANY_ID, 10n])
    expect(upperOnly.params).toEqual([COMPANY_ID, 90n])
  })

  test('matches an exact list of CT-e numbers over the same derived expression as the range', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { cteNumberIn: ['10', '90', '4'] },
    })

    expect(query.sql).toContain('coalesce')
    expect(query.sql).toContain('"cte_fiscal_documents"."fiscal_number"')
    expect(query.sql).toContain('"cte_issuance_attempts"."fiscal_number"')
    expect(query.sql).toContain(' in (')
    expect(query.params).toEqual([COMPANY_ID, 10n, 90n, 4n])
  })

  test('matches an exact list of invoice numbers through the same company scoped subquery', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { invoiceNumberIn: ['100', '900'] },
    })

    expect(query.sql).toContain(' in (')
    expect(query.params).toEqual([COMPANY_ID, COMPANY_ID, COMPANY_ID, '100', '900'])
  })
})

describe('CT-e item listing billing status filter', () => {
  test('reads the invoiced CT-e from a company scoped billing item subquery', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { billingStatusIn: ['invoiced'] },
    })

    expect(query.sql).toContain('exists (')
    expect(query.sql).toContain('"billing_invoice_items"')
    expect(query.sql).toContain(
      '"billing_invoice_items"."company_id" = "cte_batch_items"."company_id"',
    )
    expect(query.sql).toContain(
      '"billing_invoice_items"."cte_document_id" = "cte_fiscal_documents"."id"',
    )
    expect(query.params).toEqual([COMPANY_ID])
  })

  test('reports a CT-e without billing item as pending, the same rule the eligibility query uses', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { billingStatusIn: ['pending'] },
    })

    expect(query.sql).toContain('not exists (')
    expect(query.sql).toContain(
      '"billing_invoice_items"."company_id" = "cte_batch_items"."company_id"',
    )
    expect(query.params).toEqual([COMPANY_ID])
  })

  test('combines both billing statuses as alternatives, never as a conjunction', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { billingStatusIn: ['invoiced', 'pending'] },
    })

    expect(query.sql).toContain(' or ')
    expect(query.sql).toContain('not exists (')
  })

  test('keeps the company filter in front of the billing status filter', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { billingStatusIn: ['invoiced'], statusIn: ['authorized'] },
    })

    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.sql.indexOf('"cte_batch_items"."company_id" = $')).toBeLessThan(
      query.sql.indexOf('"billing_invoice_items"'),
    )
  })
})

describe('CT-e item listing derived status filter', () => {
  test('reads an authorized CT-e from the fiscal document, not from the attempt', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { statusIn: ['authorized'] },
    })

    expect(query.sql).toContain('"cte_fiscal_documents"."status" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."cancellation_requested_at" is null')
    // Sem documento gravado ainda, quem responde é a tentativa — a política faz o mesmo.
    expect(query.sql).toContain('"cte_fiscal_documents"."status" is null')
    expect(query.sql).toContain('"cte_issuance_attempts"')
    expect(query.params).toEqual([COMPANY_ID, 'authorized', 'authorized'])
  })

  test('treats a requested cancellation as cancelled, like the status policy does', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { statusIn: ['cancelled'] },
    })

    expect(query.sql).toContain('"cte_fiscal_documents"."cancellation_requested_at" is not null')
    expect(query.sql).toContain('"cte_fiscal_documents"."status" is null')
    expect(query.params).toEqual([COMPANY_ID, 'cancelled', 'cancelled'])
  })

  test('reads a not yet issued status from the latest attempt only', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { statusIn: ['rejected'] },
    })

    expect(query.sql).toContain('"cte_fiscal_documents"."status" is null')
    expect(query.sql).toContain('"cte_issuance_attempts"."status"')
    expect(query.params).toEqual([COMPANY_ID, 'rejected'])
  })

  test('reports an item without attempt and without document as pending', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { statusIn: ['pending'] },
    })

    expect(query.sql).toContain('coalesce')
    expect(query.params).toEqual([COMPANY_ID, 'pending', 'pending'])
  })

  test('combines the requested statuses as alternatives, never as a conjunction', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { statusIn: ['pending', 'failed', 'rejected'] },
    })

    expect(query.sql).toContain(' or ')
    expect(query.params).toContain('failed')
    expect(query.params).toContain('rejected')
  })
})
