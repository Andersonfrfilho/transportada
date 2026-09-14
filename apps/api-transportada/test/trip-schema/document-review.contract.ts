/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7: a fila de revisão das notas que não couberam — tabela própria, aditiva.
 */
import { describe, expect, test } from 'bun:test'

import {
  TRIP_DOCUMENT_REVIEW_REASONS,
  TRIP_DOCUMENT_REVIEW_STATUSES,
  tripDocumentReviews,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
  uniqueIndexWhereSqlByName,
  unqualifiedCheckSqlByName,
} from '../fiscal-schema/support.js'

describe('trip document reviews (spec 148 T7)', () => {
  test('is its own table with a generated uuid key and utc timestamps', () => {
    expectGeneratedUuidPrimaryKey(tripDocumentReviews)
    expectRequiredUtcTimestamps(tripDocumentReviews)
  })

  test('requires the tenant, the invoice, the source trip, the reason and the status', () => {
    const required = requiredColumnNames(tripDocumentReviews)
    for (const column of [
      'company_id',
      'nfe_document_id',
      'source_trip_id',
      'source_trip_document_id',
      'reason',
      'status',
    ]) {
      expect(required).toContain(column)
    }
  })

  test('closes status and reason with CHECK, never a native enum', () => {
    expect(columnSqlTypes(tripDocumentReviews).status).toBe('text')
    expect(columnSqlTypes(tripDocumentReviews).reason).toBe('text')

    const checks = checkSqlByName(tripDocumentReviews)
    for (const status of TRIP_DOCUMENT_REVIEW_STATUSES) {
      expect(checks.trip_document_reviews_status_check).toContain(`'${status}'`)
    }
    for (const reason of TRIP_DOCUMENT_REVIEW_REASONS) {
      expect(checks.trip_document_reviews_reason_check).toContain(`'${reason}'`)
    }
  })

  test('a pending entry has no destination; a resolved one has', () => {
    const checks = unqualifiedCheckSqlByName(tripDocumentReviews)
    expect(checks.trip_document_reviews_resolution_check).toContain(
      `("status" = 'pending') = ("resolved_at" is null)`,
    )
    expect(checks.trip_document_reviews_resolution_check).toContain(
      `("status" = 'pending') = ("resolution_trip_id" is null)`,
    )
    expect(checks.trip_document_reviews_swap_check).toContain(
      `("status" = 'swapped_in') = ("swapped_review_id" is not null)`,
    )
  })

  /** A nota trocada não sai de planta nenhuma; a solta pela planta carrega a planta e o hash. */
  test('ties the layout and its hash to every reason but the swap', () => {
    expect(
      unqualifiedCheckSqlByName(tripDocumentReviews).trip_document_reviews_layout_check,
    ).toContain(`("reason" = 'swapped_out') = ("layout_id" is null)`)
  })

  test('one pending entry per invoice, and one entry per released link (idempotent release)', () => {
    expect(uniqueIndexWhereSqlByName(tripDocumentReviews)).toEqual({
      trip_document_reviews_pending_nfe_document_unique: `"trip_document_reviews"."status" = 'pending'`,
    })
    expect(uniqueColumnsByName(tripDocumentReviews)).toEqual({
      trip_document_reviews_company_id_id_unique: ['company_id', 'id'],
      trip_document_reviews_company_source_trip_document_unique: [
        'company_id',
        'source_trip_document_id',
      ],
    })
  })

  test('reaches invoice, trips, links, the swapped entry and the actors through the tenant', () => {
    const keys = foreignKeys(tripDocumentReviews)
    const composite = [
      [
        'trip_document_reviews_company_nfe_document_fk',
        'nfe_documents',
        ['company_id', 'nfe_document_id'],
      ],
      ['trip_document_reviews_company_source_trip_fk', 'trips', ['company_id', 'source_trip_id']],
      [
        'trip_document_reviews_company_source_trip_document_fk',
        'trip_documents',
        ['company_id', 'source_trip_document_id'],
      ],
      [
        'trip_document_reviews_company_resolution_trip_fk',
        'trips',
        ['company_id', 'resolution_trip_id'],
      ],
      [
        'trip_document_reviews_company_resolution_trip_document_fk',
        'trip_documents',
        ['company_id', 'resolution_trip_document_id'],
      ],
      [
        'trip_document_reviews_company_swapped_review_fk',
        'trip_document_reviews',
        ['company_id', 'swapped_review_id'],
      ],
    ] as const
    for (const [name, foreignTable, columns] of composite) {
      expect(keys.find((key) => key.name === name)).toMatchObject({
        columns: [...columns],
        foreignColumns: ['company_id', 'id'],
        foreignTable,
      })
    }
    expect(keys).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'trip_document_reviews_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(
      keys.find((key) => key.name === 'trip_document_reviews_created_by_membership_fk'),
    ).toMatchObject({
      columns: ['created_by', 'company_id'],
      foreignTable: 'user_company_memberships',
    })
  })
})
