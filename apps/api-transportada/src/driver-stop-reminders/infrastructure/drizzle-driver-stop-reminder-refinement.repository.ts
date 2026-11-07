/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq, isNotNull, lt } from 'drizzle-orm'

import { companyDriverReminderSettings } from '../../database/company-driver-reminder-settings.schema.js'
import { driverStopReminders } from '../../database/driver-stop-reminder.schema.js'
import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { tripStopEvents, tripStops } from '../../database/trip.schema.js'
import type { TripDatabase } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  ApplyStopReminderRefinementParams,
  DriverStopReminderRefinementRepository,
  StopReminderRefinementInput,
} from '../application/driver-stop-reminder.port.js'
import { DRIVER_STOP_REMINDER_DEFAULT_SETTINGS } from '../domain/driver-stop-reminder.constant.js'
import type { GeoPoint } from '../domain/driver-stop-reminder.types.js'

type Coordinates = { readonly latitude: string; readonly longitude: string }

function toPoint(row: Coordinates | undefined): GeoPoint | undefined {
  if (row === undefined) return undefined
  return { latitude: Number(row.latitude), longitude: Number(row.longitude) }
}

export class DrizzleDriverStopReminderRefinementRepository
  implements DriverStopReminderRefinementRepository
{
  public constructor(private readonly database: TripDatabase) {}

  public async readRefinementInput(params: {
    readonly reminderId: string
  }): Promise<StopReminderRefinementInput | undefined> {
    const [reminder] = await this.database
      .select()
      .from(driverStopReminders)
      .where(
        and(
          eq(driverStopReminders.id, params.reminderId),
          eq(driverStopReminders.status, 'pending'),
        ),
      )
      .limit(1)
    if (reminder === undefined) return undefined

    const [stop] = await this.database
      .select({ addressKey: tripStops.addressKey, sequence: tripStops.sequence })
      .from(tripStops)
      .where(eq(tripStops.id, reminder.tripStopId))
      .limit(1)
    if (stop === undefined) return undefined

    const [settings, sharedPoint, destination, previousStopPoint] = await Promise.all([
      this.readSettings(reminder.companyId),
      this.readSharedPoint(reminder.tripStopId),
      this.readGeocode(stop.addressKey),
      this.readPreviousStopPoint({ sequence: stop.sequence, tripId: reminder.tripId }),
    ])
    return {
      anchorAt: reminder.anchorAt,
      companyId: reminder.companyId,
      destination,
      previousStopPoint,
      reminderId: reminder.id,
      settings,
      sharedPoint,
      tripStopId: reminder.tripStopId,
      version: reminder.version,
    }
  }

  public async applyRefinement(params: ApplyStopReminderRefinementParams): Promise<boolean> {
    const updated = await this.database
      .update(driverStopReminders)
      .set({
        dueAt: params.dueAt,
        expectedAt: params.expectedAt,
        originKind: params.originKind,
        travelSeconds: params.travelSeconds,
        updatedAt: new Date(),
        version: params.version + 1n,
      })
      .where(
        and(
          eq(driverStopReminders.id, params.reminderId),
          eq(driverStopReminders.version, params.version),
          eq(driverStopReminders.status, 'pending'),
        ),
      )
      .returning({ id: driverStopReminders.id })
    return updated.length > 0
  }

  private async readSettings(companyId: string) {
    const [row] = await this.database
      .select({
        dwellMinutes: companyDriverReminderSettings.dwellMinutes,
        graceMinMinutes: companyDriverReminderSettings.graceMinMinutes,
        gracePercent: companyDriverReminderSettings.gracePercent,
        intervalMinutes: companyDriverReminderSettings.intervalMinutes,
        maxAttempts: companyDriverReminderSettings.maxAttempts,
      })
      .from(companyDriverReminderSettings)
      .where(eq(companyDriverReminderSettings.companyId, companyId))
      .limit(1)
    return row ?? DRIVER_STOP_REMINDER_DEFAULT_SETTINGS
  }

  private async readSharedPoint(stopId: string): Promise<GeoPoint | undefined> {
    const [event] = await this.database
      .select({ latitude: tripStopEvents.latitude, longitude: tripStopEvents.longitude })
      .from(tripStopEvents)
      .where(
        and(
          eq(tripStopEvents.stopId, stopId),
          eq(tripStopEvents.kind, 'departed'),
          isNotNull(tripStopEvents.latitude),
          isNotNull(tripStopEvents.longitude),
        ),
      )
      .orderBy(desc(tripStopEvents.createdAt))
      .limit(1)
    if (event?.latitude == null || event.longitude == null) return undefined
    return toPoint({ latitude: event.latitude, longitude: event.longitude })
  }

  private async readGeocode(addressKey: string): Promise<GeoPoint | undefined> {
    const [row] = await this.database
      .select({ latitude: geocodedAddresses.latitude, longitude: geocodedAddresses.longitude })
      .from(geocodedAddresses)
      .where(eq(geocodedAddresses.addressKey, addressKey))
      .limit(1)
    return toPoint(row)
  }

  private async readPreviousStopPoint(params: {
    readonly sequence: bigint
    readonly tripId: string
  }): Promise<GeoPoint | undefined> {
    const [previous] = await this.database
      .select({ addressKey: tripStops.addressKey })
      .from(tripStops)
      .where(and(eq(tripStops.tripId, params.tripId), lt(tripStops.sequence, params.sequence)))
      .orderBy(desc(tripStops.sequence))
      .limit(1)
    return previous === undefined ? undefined : this.readGeocode(previous.addressKey)
  }
}
