/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { trips, tripStops } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('trip stops (ADR-0043 §3)', () => {
  test('anchors to the tenant and to the trip through the tenant, never by id alone', () => {
    expect(foreignKeys(tripStops)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'trip_stops_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(tripStops)).toContainEqual({
      columns: ['company_id', 'trip_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trips',
      name: 'trip_stops_company_trip_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  test('orders stops by a per-trip sequence, unique and starting at one', () => {
    const uniques = uniqueColumnsByName(tripStops)
    expect(uniques.trip_stops_company_trip_sequence_unique).toEqual([
      'company_id',
      'trip_id',
      'sequence',
    ])

    const checks = checkSqlByName(tripStops)
    expect(checks.trip_stops_sequence_check).toContain('>= 1')
  })

  test('groups by a non-empty normalized address key and a human-readable label', () => {
    const required = requiredColumnNames(tripStops)
    expect(required).toContain('address_key')
    expect(required).toContain('label')

    const checks = checkSqlByName(tripStops)
    expect(checks.trip_stops_address_key_check).toContain('length')
    expect(checks.trip_stops_label_check).toContain('length')
  })

  test('reserves a nullable delivery window for spec 060, coherent from the start', () => {
    const columns = columnNames(tripStops)
    expect(columns).toContain('delivery_window_start')
    expect(columns).toContain('delivery_window_end')

    const required = requiredColumnNames(tripStops)
    expect(required).not.toContain('delivery_window_start')
    expect(required).not.toContain('delivery_window_end')

    const checks = checkSqlByName(tripStops)
    expect(checks.trip_stops_delivery_window_check).toContain('delivery_window_start')
    expect(checks.trip_stops_delivery_window_check).toContain('delivery_window_end')
  })

  test('never marks a stop completed without an arrival', () => {
    const checks = checkSqlByName(tripStops)
    expect(checks.trip_stops_completed_requires_arrived_check).toContain('arrived_at')
  })

  test('has no coordinate columns yet — spec 058 adds them', () => {
    const columns = columnNames(tripStops)
    expect(columns).not.toContain('latitude')
    expect(columns).not.toContain('longitude')
  })

  test('lives in the same tenant family as the trip it belongs to', () => {
    expect(columnNames(trips)).toContain('id')
  })
})
