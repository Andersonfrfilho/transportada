/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq } from 'drizzle-orm'

import { tripStopSchedules } from '../../database/delivery-client.schema.js'
import { tripStops } from '../../database/trip.schema.js'
import type {
  TripStopSchedule,
  TripStopSchedulePort,
  TripStopScheduleWrite,
} from '../application/trip-stop-schedule.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type ScheduleRow = typeof tripStopSchedules.$inferSelect

export class DrizzleTripStopScheduleRepository implements TripStopSchedulePort {
  public constructor(private readonly database: Database) {}

  public async listByTrip(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripStopSchedule[]> {
    const rows = await this.database
      .select()
      .from(tripStopSchedules)
      .where(
        and(
          eq(tripStopSchedules.companyId, input.companyId),
          eq(tripStopSchedules.tripId, input.tripId),
        ),
      )
      .orderBy(asc(tripStopSchedules.createdAt))

    return rows.map(toSchedule)
  }

  public async save(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly stopId: string
    readonly tripId: string
    readonly values: TripStopScheduleWrite
  }): Promise<TripStopSchedule | null> {
    /**
     * A parada é conferida contra **a viagem e a empresa** antes de qualquer escrita: sem isso, o
     * id de uma parada de outra viagem gravaria um agendamento que ninguém veria de novo.
     */
    const [stop] = await this.database
      .select({ id: tripStops.id })
      .from(tripStops)
      .where(
        and(
          eq(tripStops.companyId, input.companyId),
          eq(tripStops.tripId, input.tripId),
          eq(tripStops.id, input.stopId),
        ),
      )
      .limit(1)
    if (stop === undefined) return null

    const decided = input.values.status === 'confirmed' || input.values.status === 'refused'
    const [saved] = await this.database
      .insert(tripStopSchedules)
      .values({
        companyId: input.companyId,
        ...(decided ? { decidedAt: new Date(), decidedByUserId: input.actorUserId } : {}),
        notes: input.values.notes,
        protocol: input.values.protocol,
        requestedByUserId: input.actorUserId,
        scheduledAt: input.values.scheduledAt === null ? null : new Date(input.values.scheduledAt),
        status: input.values.status,
        stopId: input.stopId,
        tripId: input.tripId,
      })
      .onConflictDoUpdate({
        set: {
          ...(decided ? { decidedAt: new Date(), decidedByUserId: input.actorUserId } : {}),
          /** Confirmar de novo limpa a divergência: é exatamente para isso que ela existe. */
          divergedAt: null,
          notes: input.values.notes,
          protocol: input.values.protocol,
          scheduledAt: input.values.scheduledAt === null ? null : new Date(input.values.scheduledAt),
          status: input.values.status,
          updatedAt: new Date(),
        },
        target: [tripStopSchedules.companyId, tripStopSchedules.stopId],
      })
      .returning()

    return saved === undefined ? null : toSchedule(saved)
  }
}

function toSchedule(row: ScheduleRow): TripStopSchedule {
  return {
    divergedAt: row.divergedAt?.toISOString() ?? null,
    id: row.id,
    notes: row.notes,
    protocol: row.protocol,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    status: row.status,
    stopId: row.stopId,
  }
}
