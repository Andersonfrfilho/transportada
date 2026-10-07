/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { TRIP_DOCUMENT_SEPARATION_STATUSES } from '../../database/trip.schema.js'
import { MONEY_DECIMAL } from '../../shared/money.constant.js'
import { TRIP_REPORT_TONES } from '../domain/resolve-trip-report-tone.policy.js'

export const tripReportRowSchema = z.strictObject({
  accessKey: z.string(),
  amount: z.string().regex(MONEY_DECIMAL).optional(),
  contractorName: z.string().nullable(),
  deliveredAt: z.iso.datetime().optional(),
  documentNumber: z.string(),
  documentSeries: z.string(),
  documentStatus: z.enum(TRIP_DOCUMENT_SEPARATION_STATUSES),
  recipientCity: z.string().nullable(),
  recipientName: z.string(),
  recipientState: z.string().nullable(),
  returnReason: z.string().optional(),
  returnedAt: z.iso.datetime().optional(),
  tone: z.enum(Object.values(TRIP_REPORT_TONES)),
  tripId: z.uuid(),
})

export const tripReportPageSchema = z.strictObject({
  data: z.array(tripReportRowSchema),
  excludedWithoutTrip: z.number().int().nonnegative().optional(),
  page: z.strictObject({
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  }),
})
