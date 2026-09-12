/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CARGO_LAYOUT_OUTBOX_EVENT_TYPES,
  tripCargoLayoutOutbox,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('trip cargo layout outbox (spec 145 D8)', () => {
  test('is its own table with a generated uuid key and utc timestamps', () => {
    expectGeneratedUuidPrimaryKey(tripCargoLayoutOutbox)
    expectRequiredUtcTimestamps(tripCargoLayoutOutbox)
  })

  test('requires the event identity, the layout reference and the payload', () => {
    const required = requiredColumnNames(tripCargoLayoutOutbox)

    expect(required).toContain('event_id')
    expect(required).toContain('company_id')
    expect(required).toContain('layout_id')
    expect(required).toContain('event_type')
    expect(required).toContain('correlation_id')
    expect(required).toContain('payload')
    expect(columnSqlTypes(tripCargoLayoutOutbox).payload).toBe('jsonb')
  })

  test('closes the event type on the single spec 145 event, without a native enum', () => {
    expect(CARGO_LAYOUT_OUTBOX_EVENT_TYPES).toEqual(['transportada.trip.cargo-layout.requested'])
    expect(columnSqlTypes(tripCargoLayoutOutbox).event_type).toBe('text')

    const checks = checkSqlByName(tripCargoLayoutOutbox)
    expect(checks.trip_cargo_layout_outbox_event_type_check).toContain(
      `'transportada.trip.cargo-layout.requested'`,
    )
  })

  test('makes both the row and the event idempotency key unique per company', () => {
    expect(uniqueColumnsByName(tripCargoLayoutOutbox)).toEqual({
      trip_cargo_layout_outbox_company_id_event_id_unique: ['company_id', 'event_id'],
      trip_cargo_layout_outbox_company_id_id_unique: ['company_id', 'id'],
    })
  })

  test('reaches company and layout through the tenant, never by id alone', () => {
    expect(foreignKeys(tripCargoLayoutOutbox)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'trip_cargo_layout_outbox_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(tripCargoLayoutOutbox)).toContainEqual({
      columns: ['company_id', 'layout_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trip_cargo_layouts',
      name: 'trip_cargo_layout_outbox_company_layout_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('indexes the claim scan the relay reads by', () => {
    expect(indexColumnsByName(tripCargoLayoutOutbox)).toEqual({
      trip_cargo_layout_outbox_company_published_next_attempt_created_idx: [
        'company_id',
        'published_at',
        'next_attempt_at',
        'created_at',
      ],
    })
  })
})
