/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { companyDriverReminderSettings } from '../../database/company-driver-reminder-settings.schema.js'
import { driverStopReminders } from '../../database/driver-stop-reminder.schema.js'
import { tripDocuments, tripDrivers, tripStops } from '../../database/trip.schema.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  CloseStopReminderParams,
  DriverStopReminderRepository,
  OpenStopReminderParams,
  StopReminderStopContext,
} from '../application/driver-stop-reminder.port.js'
import { DRIVER_STOP_REMINDER_DEFAULT_SETTINGS } from '../domain/driver-stop-reminder.constant.js'
import { resolveStopReminderClosedStatus } from './stop-reminder-closed-status.mapper.js'

type PostgresErrorShape = { readonly cause?: unknown; readonly errno?: unknown }

/** O driver do Bun grava o SQLSTATE em `errno`; o Drizzle embrulha o erro do driver em `cause`. */
function readPostgresSqlState(error: unknown): string | undefined {
  for (const candidate of [error, (error as PostgresErrorShape | null)?.cause]) {
    const { errno } = (candidate ?? {}) as PostgresErrorShape
    if (typeof errno === 'string' && errno.length === 5) return errno
  }
  return undefined
}

export class DrizzleDriverStopReminderRepository implements DriverStopReminderRepository {
  public constructor(
    private readonly executor: TripQueryable,
    private readonly logger?: ApiLogger,
  ) {}

  public async readStopContexts(params: {
    readonly companyId: string
    readonly stopIds?: readonly string[]
    readonly documentIds?: readonly string[]
  }): Promise<readonly StopReminderStopContext[]> {
    const stopIds = await this.resolveStopIds(params)
    if (stopIds.length === 0) return []

    const stops = await this.executor
      .select({ stopId: tripStops.id, tripId: tripStops.tripId })
      .from(tripStops)
      .where(and(eq(tripStops.companyId, params.companyId), inArray(tripStops.id, [...stopIds])))
    const tripIds = [...new Set(stops.map((stop) => stop.tripId))]
    const crew = await this.executor
      .select({ driverId: tripDrivers.driverId, tripId: tripDrivers.tripId })
      .from(tripDrivers)
      .where(and(eq(tripDrivers.companyId, params.companyId), inArray(tripDrivers.tripId, tripIds)))
      .orderBy(asc(tripDrivers.position))
    const leadByTrip = new Map<string, string>()
    for (const member of crew) {
      if (!leadByTrip.has(member.tripId)) leadByTrip.set(member.tripId, member.driverId)
    }
    return stops.map((stop) => ({ ...stop, driverId: leadByTrip.get(stop.tripId) }))
  }

  public async listPending(params: { readonly companyId: string; readonly tripId: string }) {
    return this.executor
      .select({
        id: driverStopReminders.id,
        stage: driverStopReminders.stage,
        stopId: driverStopReminders.tripStopId,
      })
      .from(driverStopReminders)
      .where(
        and(
          eq(driverStopReminders.companyId, params.companyId),
          eq(driverStopReminders.tripId, params.tripId),
          eq(driverStopReminders.status, 'pending'),
        ),
      )
  }

  public async readSettings(params: { readonly companyId: string }) {
    const [row] = await this.executor
      .select({
        dwellMinutes: companyDriverReminderSettings.dwellMinutes,
        graceMinMinutes: companyDriverReminderSettings.graceMinMinutes,
        gracePercent: companyDriverReminderSettings.gracePercent,
        idleMinutes: companyDriverReminderSettings.idleMinutes,
        intervalMinutes: companyDriverReminderSettings.intervalMinutes,
        maxAttempts: companyDriverReminderSettings.maxAttempts,
      })
      .from(companyDriverReminderSettings)
      .where(eq(companyDriverReminderSettings.companyId, params.companyId))
      .limit(1)
    return row ?? DRIVER_STOP_REMINDER_DEFAULT_SETTINGS
  }

  public async open(params: OpenStopReminderParams): Promise<{ readonly id: string } | undefined> {
    const { context } = params
    if (context.driverId === undefined) return undefined
    const { driverId } = context
    try {
      // Savepoint: o lembrete que falha desfaz só a própria inserção e o evento do motorista confirma.
      return await this.executor.transaction(async (savepoint) => {
        const [created] = await savepoint
          .insert(driverStopReminders)
          .values({
            anchorAt: params.anchorAt,
            companyId: params.companyId,
            driverId,
            dueAt: params.dueAt,
            expectedAt: params.expectedAt,
            originKind: 'fallback',
            stage: params.stage,
            status: 'pending',
            tripId: context.tripId,
            tripStopId: context.stopId,
          })
          .onConflictDoNothing()
          .returning({ id: driverStopReminders.id })
        return created
      })
    } catch (error) {
      const sqlState = readPostgresSqlState(error)
      if (sqlState === undefined) throw error
      this.logger?.warn('driver_stop_reminder_open_failed', {
        companyId: params.companyId,
        reason: error instanceof Error ? error.name : 'unknown',
        sqlState,
        stage: params.stage,
        tripStopId: context.stopId,
      })
      return undefined
    }
  }

  public async close(params: CloseStopReminderParams): Promise<void> {
    await this.executor
      .update(driverStopReminders)
      .set({
        closedAt: params.closedAt,
        closedReason: params.reason,
        status: resolveStopReminderClosedStatus(params.reason),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(driverStopReminders.companyId, params.companyId),
          eq(driverStopReminders.id, params.reminderId),
          eq(driverStopReminders.status, 'pending'),
        ),
      )
  }

  private async resolveStopIds(params: {
    readonly companyId: string
    readonly stopIds?: readonly string[]
    readonly documentIds?: readonly string[]
  }): Promise<readonly string[]> {
    if (params.stopIds !== undefined) return params.stopIds
    if (params.documentIds === undefined || params.documentIds.length === 0) return []
    const rows = await this.executor
      .select({ stopId: tripDocuments.stopId })
      .from(tripDocuments)
      .where(
        and(
          eq(tripDocuments.companyId, params.companyId),
          inArray(tripDocuments.id, [...params.documentIds]),
        ),
      )
    return [...new Set(rows.flatMap((row) => (row.stopId === null ? [] : [row.stopId])))]
  }
}
