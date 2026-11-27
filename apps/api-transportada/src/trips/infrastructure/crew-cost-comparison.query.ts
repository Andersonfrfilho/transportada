/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import { tripDrivers, trips } from '../../database/trip.schema.js'
import {
  CREW_COST_COMPARISON_MAX_TRIPS,
  type CrewCostComparisonTrip,
} from '../application/read-crew-cost-comparison.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** O dia civil da empresa (São Paulo) — a mesma régua das telas de período. */
const COMPANY_TIME_ZONE = 'America/Sao_Paulo'

/**
 * Spec 327: as viagens do período em que alguém tem valor pago informado. Só isto — o custo calculado
 * sai do leitor em lote da lista de viagens (259), nunca de uma segunda conta.
 */
export class DrizzleCrewCostComparisonQuery {
  public constructor(private readonly database: Database) {}

  public async listTripsWithPaidAmount(input: {
    readonly companyId: string
    readonly from: string
    readonly to: string
  }): Promise<readonly CrewCostComparisonTrip[]> {
    const createdDay = sql`(${trips.createdAt} at time zone ${COMPANY_TIME_ZONE})::date`
    const tripRows = await this.database
      .selectDistinct({ createdAt: trips.createdAt, status: trips.status, tripId: trips.id })
      .from(trips)
      .innerJoin(
        tripDrivers,
        and(eq(tripDrivers.companyId, trips.companyId), eq(tripDrivers.tripId, trips.id)),
      )
      .where(
        and(
          eq(trips.companyId, input.companyId),
          isNotNull(tripDrivers.paidAmount),
          sql`${createdDay} >= ${input.from}::date`,
          sql`${createdDay} <= ${input.to}::date`,
        ),
      )
      .orderBy(desc(trips.createdAt))
      .limit(CREW_COST_COMPARISON_MAX_TRIPS + 1)
    if (tripRows.length === 0) return []

    const people = await this.database
      .select({ driverName: tripDrivers.driverName, tripId: tripDrivers.tripId })
      .from(tripDrivers)
      .where(
        and(
          eq(tripDrivers.companyId, input.companyId),
          inArray(
            tripDrivers.tripId,
            tripRows.map((row) => row.tripId),
          ),
        ),
      )
      .orderBy(asc(tripDrivers.position))

    return tripRows.map((row) => ({
      createdAt: row.createdAt.toISOString(),
      crewNames: people.filter((person) => person.tripId === row.tripId).map((p) => p.driverName),
      status: row.status,
      tripId: row.tripId,
    }))
  }
}
