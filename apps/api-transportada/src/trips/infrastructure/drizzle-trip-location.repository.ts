/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'

import { tripLocationPings } from '../../database/client-portal.schema.js'
import { fleetDrivers } from '../../database/fleet.schema.js'
import { tripDispatchSnapshots, tripDrivers, trips } from '../../database/trip.schema.js'
import type {
  DriverTrackingState,
  TripLocationPing,
  TripLocationRepositoryPort,
} from '../application/trip-location.port.js'
import { TRIP_ON_ROAD_STATUSES } from '../domain/trip-state.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * As duas fases em que a carga está na rua. `dispatched` conta porque o caminhão sai da doca antes
 * de alguém marcar a primeira chegada, e o cliente que abre o portal nesse intervalo veria o mapa
 * vazio sem motivo.
 */
/** O rastro corre enquanto a viagem está na rua — e é em rota que ele mais importa. */
const TRACKED_STATUSES = TRIP_ON_ROAD_STATUSES

export class DrizzleTripLocationRepository implements TripLocationRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async purgeByTrip(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<void> {
    await this.database
      .delete(tripLocationPings)
      .where(
        and(
          eq(tripLocationPings.companyId, input.companyId),
          eq(tripLocationPings.tripId, input.tripId),
        ),
      )
  }

  /**
   * ADR-0056 §2: apaga o ping velho tenha a viagem fechado ou não. Em lotes, porque a tabela é
   * escrita o dia inteiro pelo campo — e devolve quantos caíram, nunca quais nem de quem.
   */
  public async purgeStalePings(input: {
    readonly before: Date
    readonly limit: number
  }): Promise<number> {
    const stale = this.database
      .select({ id: tripLocationPings.id })
      .from(tripLocationPings)
      .where(lt(tripLocationPings.recordedAt, input.before))
      .limit(input.limit)

    const removed = await this.database
      .delete(tripLocationPings)
      .where(inArray(tripLocationPings.id, stale))
      .returning({ id: tripLocationPings.id })

    return removed.length
  }

  public async readCurrentTracking(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<DriverTrackingState | null> {
    const [row] = await this.database
      .select({
        consentAt: fleetDrivers.locationSharingConsentAt,
        /* Append-only, escrito no despacho: é a hora em que a viagem saiu, não a do último toque. */
        dispatchedAt: tripDispatchSnapshots.dispatchedAt,
        tripId: trips.id,
      })
      .from(tripDrivers)
      .innerJoin(
        trips,
        and(
          eq(trips.companyId, tripDrivers.companyId),
          eq(trips.id, tripDrivers.tripId),
          inArray(trips.status, [...TRACKED_STATUSES]),
        ),
      )
      .innerJoin(
        fleetDrivers,
        and(
          eq(fleetDrivers.companyId, tripDrivers.companyId),
          eq(fleetDrivers.id, tripDrivers.driverId),
        ),
      )
      /**
       * `left`: o instantâneo é a **única** origem de `dispatchedAt` — `trips` não tem a coluna —, e
       * viagem despachada sem ele existe. Por isso a ausência não fecha a janela: quem a lê devolve
       * `open`, e o prazo da ADR-0056 §2 fica com o expurgo por idade.
       */
      .leftJoin(
        tripDispatchSnapshots,
        and(
          eq(tripDispatchSnapshots.companyId, trips.companyId),
          eq(tripDispatchSnapshots.tripId, trips.id),
        ),
      )
      .where(
        and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.driverId, input.driverId)),
      )
      .orderBy(desc(trips.updatedAt))
      .limit(1)

    if (row === undefined) return null

    return {
      dispatchedAt: row.dispatchedAt,
      hasConsent: row.consentAt !== null,
      tripId: row.tripId,
    }
  }

  public async readLastPing(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripLocationPing | null> {
    const [row] = await this.database
      .select({
        latitude: tripLocationPings.latitude,
        longitude: tripLocationPings.longitude,
        recordedAt: tripLocationPings.recordedAt,
      })
      .from(tripLocationPings)
      .where(
        and(
          eq(tripLocationPings.companyId, input.companyId),
          eq(tripLocationPings.tripId, input.tripId),
        ),
      )
      .orderBy(desc(tripLocationPings.recordedAt))
      .limit(1)

    if (row === undefined) return null

    return {
      latitude: row.latitude,
      longitude: row.longitude,
      recordedAt: row.recordedAt.toISOString(),
    }
  }

  public async recordPing(input: {
    readonly companyId: string
    readonly driverId: string
    readonly latitude: string
    readonly longitude: string
    readonly tripId: string
  }): Promise<void> {
    await this.database.insert(tripLocationPings).values({
      companyId: input.companyId,
      driverId: input.driverId,
      latitude: input.latitude,
      longitude: input.longitude,
      tripId: input.tripId,
    })
  }

  public async setConsent(input: {
    readonly accepted: boolean
    readonly companyId: string
    readonly driverId: string
  }): Promise<{ readonly acceptedAt: string | null }> {
    return this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(fleetDrivers)
        .set({
          locationSharingConsentAt: input.accepted ? sql`now()` : null,
          updatedAt: sql`now()`,
        })
        .where(
          and(eq(fleetDrivers.companyId, input.companyId), eq(fleetDrivers.id, input.driverId)),
        )
        .returning({ acceptedAt: fleetDrivers.locationSharingConsentAt })

      /**
       * Retirar o consentimento **apaga o rastro vivo** na mesma transação. Deixá-lo para o
       * fechamento da viagem manteria no banco, por horas, a posição de quem acabou de dizer que não
       * queria ser seguido — e é exatamente esse o dado que a LGPD trata como sensível.
       */
      if (!input.accepted) {
        await transaction
          .delete(tripLocationPings)
          .where(
            and(
              eq(tripLocationPings.companyId, input.companyId),
              eq(tripLocationPings.driverId, input.driverId),
            ),
          )
      }

      return { acceptedAt: updated?.acceptedAt?.toISOString() ?? null }
    })
  }
}
