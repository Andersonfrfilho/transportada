/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_DOCUMENT_SEPARATION_STATUSES, TRIP_STATUSES } from '../../src/database/trip.schema.js'
import { tripDocuments, trips } from '../../src/database/database.schema.js'
import { checkSqlByName, columnSqlTypes, requiredColumnNames } from '../fiscal-schema/support.js'

describe('trip status machine (ADR-0042)', () => {
  test('replaces the binary open/closed cycle with the eight operational states', () => {
    expect(TRIP_STATUSES).toEqual([
      'draft',
      'route_planned',
      'separating',
      'loading',
      'dispatched',
      'in_transit',
      'completed',
      'cancelled',
    ])
    expect(TRIP_STATUSES).not.toContain('open')
    expect(TRIP_STATUSES).not.toContain('closed')
  })

  test('gives the document a separation axis independent from the trip', () => {
    expect(TRIP_DOCUMENT_SEPARATION_STATUSES).toEqual([
      'pending',
      'separated',
      'loaded',
      'delivered',
      'returned',
    ])
  })

  test('checks the trip status against the full enumeration', () => {
    const checks = checkSqlByName(trips)
    for (const status of TRIP_STATUSES) {
      expect(checks.trips_status_check).toContain(`'${status}'`)
    }
    expect(checks.trips_status_check).not.toContain("'open'")
    expect(checks.trips_status_check).not.toContain("'closed'")
  })

  test('checks the document separation status against the full enumeration', () => {
    const checks = checkSqlByName(tripDocuments)
    for (const status of TRIP_DOCUMENT_SEPARATION_STATUSES) {
      expect(checks.trip_documents_separation_status_check).toContain(`'${status}'`)
    }
  })

  test('requires a return reason exactly when the document is returned, and only then', () => {
    const checks = checkSqlByName(tripDocuments)
    expect(checks.trip_documents_return_reason_check).toContain('returned')
    expect(checks.trip_documents_return_reason_check).toContain('return_reason')
  })

  test('adds the separation timeline as nullable timestamps, and the status as required text', () => {
    const required = requiredColumnNames(tripDocuments)
    expect(required).toContain('separation_status')
    expect(required).not.toContain('separated_at')
    expect(required).not.toContain('loaded_at')
    expect(required).not.toContain('returned_at')
    expect(required).not.toContain('return_reason')

    const types = columnSqlTypes(tripDocuments)
    expect(types.separated_at).toContain('timestamp')
    expect(types.loaded_at).toContain('timestamp')
    expect(types.returned_at).toContain('timestamp')
  })
})
