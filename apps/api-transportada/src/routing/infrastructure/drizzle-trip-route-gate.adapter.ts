/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { trips } from '../../database/database.schema.js'
import { checkTripAcceptsLinkage } from '../../trips/domain/trip-state.policy.js'
import type { TripRouteGate } from '../application/route-suggestion.use-case.js'

export type TripRouteGateDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * A porta de não-retorno é a mesma da 056 (`checkTripAcceptsLinkage`), reaproveitada — não copiada.
 * Uma segunda cópia da regra ficaria para trás no dia em que um estado novo entrar na máquina, e o
 * roteirizador passaria a aceitar viagem que o resto do sistema já considera fechada.
 */
export function createDrizzleTripRouteGate(database: TripRouteGateDatabase): TripRouteGate {
  return {
    async readAcceptsRouting({ companyId, tripId }) {
      const [row] = await database
        .select({ status: trips.status })
        .from(trips)
        .where(and(eq(trips.companyId, companyId), eq(trips.id, tripId)))
        .limit(1)

      if (row === undefined) return { accepts: false, exists: false }

      return { accepts: checkTripAcceptsLinkage(row.status) === null, exists: true }
    },
  }
}
