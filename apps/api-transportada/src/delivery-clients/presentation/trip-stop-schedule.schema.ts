/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { TRIP_STOP_SCHEDULE_STATUSES } from '../../database/delivery-client.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'
import type { TripStopScheduleWrite } from '../application/trip-stop-schedule.use-case.js'

const scheduleSchema = z
  .object({
    notes: z.string().trim().max(500).default(''),
    /** O número que o motorista diz na portaria. Vazio até o cliente devolver o protocolo. */
    protocol: z.string().trim().max(80).default(''),
    scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
    status: z.enum(TRIP_STOP_SCHEDULE_STATUSES),
  })
  .strict()

export async function parseTripStopScheduleRequest(
  request: Request,
): Promise<TripStopScheduleWrite> {
  return parseBody(scheduleSchema, request)
}
