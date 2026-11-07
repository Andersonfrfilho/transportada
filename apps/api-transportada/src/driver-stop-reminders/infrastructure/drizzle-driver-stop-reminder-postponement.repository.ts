/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, sql } from 'drizzle-orm'

import { companyDriverReminderSettings } from '../../database/company-driver-reminder-settings.schema.js'
import { driverStopReminders } from '../../database/driver-stop-reminder.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  ApplyStopReminderPostponementParams,
  DriverStopReminderPostponementRepository,
  PostponableStopReminder,
} from '../application/driver-stop-reminder-postponement.port.js'
import { DRIVER_STOP_REMINDER_DEFAULT_SETTINGS } from '../domain/driver-stop-reminder.constant.js'

const PENDING = 'pending'

export class DrizzleDriverStopReminderPostponementRepository
  implements DriverStopReminderPostponementRepository
{
  public constructor(private readonly executor: TripQueryable) {}

  public async find(params: {
    readonly companyId: string
    readonly reminderId: string
  }): Promise<PostponableStopReminder | undefined> {
    const [row] = await this.executor
      .select({
        postponements: driverStopReminders.postponements,
        status: driverStopReminders.status,
      })
      .from(driverStopReminders)
      .where(
        and(
          eq(driverStopReminders.companyId, params.companyId),
          eq(driverStopReminders.id, params.reminderId),
        ),
      )
      .limit(1)
    return row
  }

  public async readIntervalMinutes(companyId: string): Promise<number> {
    const [row] = await this.executor
      .select({ intervalMinutes: companyDriverReminderSettings.intervalMinutes })
      .from(companyDriverReminderSettings)
      .where(eq(companyDriverReminderSettings.companyId, companyId))
      .limit(1)
    return row?.intervalMinutes ?? DRIVER_STOP_REMINDER_DEFAULT_SETTINGS.intervalMinutes
  }

  public async applyPostponement(params: ApplyStopReminderPostponementParams): Promise<boolean> {
    const rows = await this.executor
      .update(driverStopReminders)
      .set({
        attempts: sql`greatest(${driverStopReminders.attempts} - 1, 0)`,
        dispatchingUntil: null,
        dueAt: params.dueAt,
        postponements: sql`${driverStopReminders.postponements} + 1`,
        updatedAt: params.now,
        version: sql`${driverStopReminders.version} + 1`,
      })
      .where(
        and(
          eq(driverStopReminders.companyId, params.companyId),
          eq(driverStopReminders.id, params.reminderId),
          eq(driverStopReminders.status, PENDING),
          eq(driverStopReminders.postponements, params.postponements),
        ),
      )
      .returning({ id: driverStopReminders.id })
    return rows.length > 0
  }
}
