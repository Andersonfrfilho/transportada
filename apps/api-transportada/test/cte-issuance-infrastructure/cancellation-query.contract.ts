/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildCancellationRequestFilters,
  buildIssuedDocumentFilters,
  resolveIssuanceEventName,
  resolveIssuedDocumentStatus,
} from '../../src/cte-issuance/infrastructure/drizzle-cte-issuance.repository.js'

const BATCH_ITEM_ID = '00000000-0000-4000-8000-000000000901'
const COMPANY_ID = '00000000-0000-4000-8000-000000000902'

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('CT-e cancellation query tenant safety', () => {
  test('scopes the authorized document lookup by company and batch item', () => {
    const query = toSql(
      buildIssuedDocumentFilters({ batchItemId: BATCH_ITEM_ID, companyId: COMPANY_ID }),
    )

    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."batch_item_id" = $')
    expect(query.params).toEqual([COMPANY_ID, BATCH_ITEM_ID])
  })

  test('scopes the cancellation update by company and batch item', () => {
    const query = toSql(
      buildCancellationRequestFilters({ batchItemId: BATCH_ITEM_ID, companyId: COMPANY_ID }),
    )

    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."batch_item_id" = $')
    expect(query.params).toEqual([COMPANY_ID, BATCH_ITEM_ID, 'authorized'])
  })

  test('refuses to overwrite a cancellation already in flight', () => {
    const query = toSql(
      buildCancellationRequestFilters({ batchItemId: BATCH_ITEM_ID, companyId: COMPANY_ID }),
    )

    expect(query.sql).toContain('"cte_fiscal_documents"."status" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."cancellation_requested_at" is null')
  })
})

describe('CT-e cancellation state resolution', () => {
  test('keeps an authorized document cancellable', () => {
    expect(
      resolveIssuedDocumentStatus({
        status: 'authorized',
        cancellationRequestedAt: null,
      }),
    ).toBe('authorized')
  })

  test('treats a cancellation already requested as cancelled', () => {
    expect(
      resolveIssuedDocumentStatus({
        status: 'authorized',
        cancellationRequestedAt: new Date('2026-07-28T10:00:00.000Z'),
      }),
    ).toBe('cancelled')
  })

  test('treats a document cancelled at SEFAZ as cancelled', () => {
    expect(
      resolveIssuedDocumentStatus({ status: 'cancelled', cancellationRequestedAt: null }),
    ).toBe('cancelled')
  })

  test('routes the cancel request to its own issuance event name', () => {
    expect(resolveIssuanceEventName('cancel_requested')).toBe('cancel_requested')
    expect(resolveIssuanceEventName('retry_scheduled')).toBe('retry_scheduled')
    expect(resolveIssuanceEventName('anything-else')).toBe('issue_requested')
  })
})
