/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  TRIP_PROOF_REPORT_MAX_DOCUMENTS,
  TRIP_REPORT_MAX_ROWS,
} from '../../src/trips/domain/trip-report.constant.js'
import {
  TripProofReportTooLargeError,
  TripReportTooLargeError,
} from '../../src/trips/domain/trip.error.js'

describe('trip report ceilings', () => {
  it('declares 5000 rows and 200 proofs', () => {
    expect(TRIP_REPORT_MAX_ROWS).toBe(5000)
    expect(TRIP_PROOF_REPORT_MAX_DOCUMENTS).toBe(200)
  })

  it('refuses a report above the row ceiling with 422 and the ceiling in the message', () => {
    const error = new TripReportTooLargeError()
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('TRIP_REPORT_TOO_LARGE')
    expect(error.status).toBe(422)
    expect(error.message).toContain(String(TRIP_REPORT_MAX_ROWS))
  })

  it('refuses a proof report above the proof ceiling with 422 and the ceiling in the message', () => {
    const error = new TripProofReportTooLargeError()
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('TRIP_PROOF_REPORT_TOO_LARGE')
    expect(error.status).toBe(422)
    expect(error.message).toContain(String(TRIP_PROOF_REPORT_MAX_DOCUMENTS))
  })
})
