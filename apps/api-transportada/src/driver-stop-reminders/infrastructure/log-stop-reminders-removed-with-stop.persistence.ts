/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { driverStopReminders } from '../../database/driver-stop-reminder.schema.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'

/** `driver_stop_reminders.trip_stop_id` é `ON DELETE CASCADE`: fechar antes do DELETE seria apagado junto, então o log é o único rastro. */
export async function logStopRemindersRemovedWithStop(
  executor: TripQueryable,
  params: {
    readonly companyId: string
    readonly logger: ApiLogger | undefined
    readonly stopId: string
  },
): Promise<void> {
  if (params.logger === undefined) return
  const pending = await executor
    .select({ id: driverStopReminders.id, stage: driverStopReminders.stage })
    .from(driverStopReminders)
    .where(
      and(
        eq(driverStopReminders.companyId, params.companyId),
        eq(driverStopReminders.tripStopId, params.stopId),
        eq(driverStopReminders.status, 'pending'),
      ),
    )
  for (const reminder of pending) {
    params.logger.info('driver_stop_reminder_discarded_with_stop', {
      companyId: params.companyId,
      reason: 'stop_removed',
      reminderId: reminder.id,
      stage: reminder.stage,
      tripStopId: params.stopId,
    })
  }
}
