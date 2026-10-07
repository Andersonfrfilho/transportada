/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF3: quatro tons, `cancelled` sem tom, e `total_return` só quando toda nota restante voltou.
 */
import { describe, expect, it } from 'bun:test'

import { TRIP_STATUSES, type TripDocumentSeparationStatus } from '../../src/database/trip.schema.js'
import {
  TRIP_ON_ROAD_STATUSES,
  TRIP_STATUSES_BEFORE_DISPATCH,
} from '../../src/trips/domain/trip-state.policy.js'
import {
  resolveTripReportTone,
  TRIP_REPORT_TONES,
} from '../../src/trips/domain/resolve-trip-report-tone.policy.js'

const MIXED: readonly TripDocumentSeparationStatus[] = ['delivered', 'returned']

describe('resolveTripReportTone', () => {
  it('declares the four tones', () => {
    expect([...Object.values(TRIP_REPORT_TONES)].sort()).toEqual([
      'finished',
      'on_route',
      'total_return',
      'warehouse',
    ])
  })

  it('maps every status before dispatch to warehouse', () => {
    for (const status of TRIP_STATUSES_BEFORE_DISPATCH) {
      expect(resolveTripReportTone(status, ['pending'])).toBe('warehouse')
    }
  })

  it('maps every on-the-road status to on_route', () => {
    for (const status of TRIP_ON_ROAD_STATUSES) {
      expect(resolveTripReportTone(status, ['loaded'])).toBe('on_route')
    }
  })

  it('maps cancelled to no tone', () => {
    expect(resolveTripReportTone('cancelled', ['pending'])).toBeUndefined()
    expect(resolveTripReportTone('cancelled', ['returned'])).toBeUndefined()
  })

  it('covers every trip status with a defined tone except cancelled', () => {
    for (const status of TRIP_STATUSES) {
      const tone = resolveTripReportTone(status, ['delivered'])
      expect(tone === undefined).toBe(status === 'cancelled')
    }
  })

  it('maps completed with every document returned to total_return', () => {
    expect(resolveTripReportTone('completed', ['returned'])).toBe('total_return')
    expect(resolveTripReportTone('completed', ['returned', 'returned'])).toBe('total_return')
  })

  it('maps completed with a delivered and a returned document to finished', () => {
    expect(resolveTripReportTone('completed', MIXED)).toBe('finished')
  })

  it('maps completed with one returned and one still pending to finished', () => {
    expect(resolveTripReportTone('completed', ['returned', 'loaded'])).toBe('finished')
  })

  it('maps completed with an empty list (manual close) to finished', () => {
    expect(resolveTripReportTone('completed', [])).toBe('finished')
  })

  it('maps completed with every document delivered to finished', () => {
    expect(resolveTripReportTone('completed', ['delivered', 'delivered'])).toBe('finished')
  })

  it('ignores document statuses for non-completed trips', () => {
    expect(resolveTripReportTone('in_transit', ['returned'])).toBe('on_route')
    expect(resolveTripReportTone('loading', ['returned'])).toBe('warehouse')
  })
})
