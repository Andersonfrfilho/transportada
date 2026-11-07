/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { driverStopReminders } from '../../database/driver-stop-reminder.schema.js'
import type { DriverStopReminderClosedReason } from '../../shared/driver-stop-reminder.constant.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import { resolveStopReminderClosedStatus } from './stop-reminder-closed-status.mapper.js'

/** Encerrar ou cancelar a viagem fecha tudo o que ficou aberto, na transação do repositório da viagem. */
export async function closePendingStopReminders(
  executor: TripQueryable,
  params: {
    readonly companyId: string
    readonly tripId: string
    readonly reason: Extract<DriverStopReminderClosedReason, 'trip_closed' | 'trip_cancelled'>
  },
): Promise<void> {
  await executor
    .update(driverStopReminders)
    .set({
      closedAt: new Date(),
      closedReason: params.reason,
      status: resolveStopReminderClosedStatus(params.reason),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(driverStopReminders.companyId, params.companyId),
        eq(driverStopReminders.tripId, params.tripId),
        eq(driverStopReminders.status, 'pending'),
      ),
    )
}
