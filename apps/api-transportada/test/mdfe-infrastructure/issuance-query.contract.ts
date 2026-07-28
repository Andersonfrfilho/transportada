/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildAttemptIdempotencyFilters,
  buildFiscalDocumentFilters,
  buildIssuanceStateFilters,
  buildOpenAttemptFilters,
  buildReservationFilters,
} from '../../src/mdfe-manifests/infrastructure/mdfe-issuance.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000b1'
const MANIFEST_ID = '00000000-0000-4000-8000-0000000000b2'
const IDEMPOTENCY_KEY = 'mdfe-issue-key-1'
const RESERVATION_KEY = 'mdfe:00000000-0000-4000-8000-0000000000b2:1'

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('MDF-e issuance query tenant safety', () => {
  test('scopes the issuance state lookup by company and manifest', () => {
    const query = toSql(
      buildIssuanceStateFilters({ companyId: COMPANY_ID, manifestId: MANIFEST_ID }),
    )

    expect(query.sql).toContain('"mdfe_manifests"."company_id" = $')
    expect(query.sql).toContain('"mdfe_manifests"."id" = $')
    expect(query.params).toEqual([COMPANY_ID, MANIFEST_ID])
  })

  test('never resolves an idempotency key across companies', () => {
    const query = toSql(
      buildAttemptIdempotencyFilters({ companyId: COMPANY_ID, idempotencyKey: IDEMPOTENCY_KEY }),
    )

    expect(query.sql).toContain('"mdfe_issuance_attempts"."company_id" = $')
    expect(query.sql).toContain('"mdfe_issuance_attempts"."idempotency_key" = $')
    expect(query.params).toEqual([COMPANY_ID, IDEMPOTENCY_KEY])
  })

  test('looks for an open attempt of the same kind inside the company', () => {
    const query = toSql(
      buildOpenAttemptFilters({
        attemptKind: 'close',
        companyId: COMPANY_ID,
        manifestId: MANIFEST_ID,
      }),
    )

    expect(query.sql).toContain('"mdfe_issuance_attempts"."company_id" = $')
    expect(query.sql).toContain('"mdfe_issuance_attempts"."manifest_id" = $')
    expect(query.sql).toContain('"mdfe_issuance_attempts"."attempt_kind" = $')
    expect(query.sql).toContain('"mdfe_issuance_attempts"."status" in ')
    expect(query.params).toEqual([
      COMPANY_ID,
      MANIFEST_ID,
      'close',
      'pending',
      'in_flight',
      'retry_scheduled',
    ])
  })

  test('scopes the fiscal document write by company and manifest', () => {
    const query = toSql(
      buildFiscalDocumentFilters({ companyId: COMPANY_ID, manifestId: MANIFEST_ID }),
    )

    expect(query.sql).toContain('"mdfe_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"mdfe_fiscal_documents"."manifest_id" = $')
    expect(query.params).toEqual([COMPANY_ID, MANIFEST_ID])
  })

  test('reads the reservation ledger row inside the company', () => {
    const query = toSql(
      buildReservationFilters({ companyId: COMPANY_ID, reservationKey: RESERVATION_KEY }),
    )

    expect(query.sql).toContain('"fiscal_sequence_reservations"."company_id" = $')
    expect(query.sql).toContain('"fiscal_sequence_reservations"."reservation_key" = $')
    expect(query.params).toEqual([COMPANY_ID, RESERVATION_KEY])
  })
})
