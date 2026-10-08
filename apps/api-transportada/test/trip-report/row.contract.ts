/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  tripReportPageSchema,
  tripReportRowSchema,
} from '../../src/trips/presentation/trip-report-row.schema.js'

const ROW = {
  accessKey: '35260112345678000199550010000001231000001234',
  contractorName: 'Contratante',
  documentNumber: '123',
  documentSeries: '1',
  documentStatus: 'delivered',
  recipientCity: 'Recife',
  recipientName: 'Destinatario',
  recipientState: 'PE',
  tone: 'finished',
  tripId: '11111111-1111-4111-8111-111111111111',
} as const

describe('tripReportRowSchema', () => {
  it('accepts a row without financials, without tripCode and without amount', () => {
    expect(tripReportRowSchema.safeParse(ROW).success).toBe(true)
    expect('amount' in tripReportRowSchema.parse(ROW)).toBe(false)
  })

  it('keeps the amount as a decimal string when present', () => {
    expect(tripReportRowSchema.safeParse({ ...ROW, amount: '10.5000' }).success).toBe(true)
    expect(tripReportRowSchema.safeParse({ ...ROW, amount: 10.5 }).success).toBe(false)
  })

  it('refuses tripCode and unknown tones', () => {
    expect(tripReportRowSchema.safeParse({ ...ROW, tripCode: 'T-1' }).success).toBe(false)
    expect(tripReportRowSchema.safeParse({ ...ROW, tone: 'purple' }).success).toBe(false)
  })
})

describe('tripReportPageSchema', () => {
  it('accepts the first page with total and excludedWithoutTrip', () => {
    const page = { data: [ROW], excludedWithoutTrip: 2, page: { nextCursor: null, total: 1 } }
    expect(tripReportPageSchema.safeParse(page).success).toBe(true)
  })

  it('accepts a later page without total and excludedWithoutTrip', () => {
    const page = { data: [ROW], page: { nextCursor: 'abc' } }
    expect(tripReportPageSchema.safeParse(page).success).toBe(true)
  })
})
