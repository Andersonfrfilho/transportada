/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4b: o que o pagamento lê da viagem — status, conclusão e tripulação — em consultas de colunas
 * explícitas. Fica separado do repositório das viagens do pagamento porque lê `trip_status_events`, uma das tabelas
 * com posição do evento (196 RF12): aqui só sai `occurred_at`, nunca a linha inteira.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, sql } from 'drizzle-orm'

import { tripDrivers, trips, tripStatusEvents } from '../../database/trip.schema.js'
import type {
  ExpenseOccurrenceTripPorts,
  ExpenseTripParcelKind,
} from '../application/expense.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const SAO_PAULO = 'America/Sao_Paulo'

/**
 * Quando a viagem foi concluída: a última transição para `completed` (`trip_status_events`, spec 158); viagem anterior
 * ao histórico cai no encerramento manual e, por fim, na última atualização da linha.
 */
const completedAtSql = sql<Date>`coalesce(
  (select max(${tripStatusEvents.occurredAt}) from ${tripStatusEvents}
    where ${tripStatusEvents.companyId} = ${trips.companyId}
      and ${tripStatusEvents.tripId} = ${trips.id}
      and ${tripStatusEvents.toStatus} = 'completed'),
  ${trips.closedAt},
  ${trips.updatedAt})`
const completedOnSql = sql<string>`to_char((${completedAtSql} at time zone ${SAO_PAULO})::date, 'YYYY-MM-DD')`

function toRole(role: string): ExpenseTripParcelKind {
  return role === 'helper' ? 'helper' : 'driver'
}

export function createPayableTripQueries(
  database: Database,
): Pick<ExpenseOccurrenceTripPorts['payableTrips'], 'findFacts' | 'listCompleted'> {
  return {
    findFacts: async ({ companyId, tripId }) => {
      const [trip] = await database
        .select({ completedOn: completedOnSql, status: trips.status, tripId: trips.id })
        .from(trips)
        .where(and(eq(trips.companyId, companyId), eq(trips.id, tripId)))
        .limit(1)
      if (trip === undefined) return null
      const crew = await database
        .select({ driverId: tripDrivers.driverId, role: tripDrivers.role })
        .from(tripDrivers)
        .where(and(eq(tripDrivers.companyId, companyId), eq(tripDrivers.tripId, tripId)))
      return {
        completedOn: trip.status === 'completed' ? trip.completedOn : null,
        crew: crew.map((member) => ({ driverId: member.driverId, role: toRole(member.role) })),
        status: trip.status,
        tripId: trip.tripId,
      }
    },
    listCompleted: async ({ companyId, driverId, from, to }) => {
      const rows = await database
        .select({ completedOn: completedOnSql, crewRole: tripDrivers.role, tripId: trips.id })
        .from(trips)
        .innerJoin(
          tripDrivers,
          and(
            eq(tripDrivers.companyId, trips.companyId),
            eq(tripDrivers.tripId, trips.id),
            eq(tripDrivers.driverId, driverId),
          ),
        )
        .where(
          and(
            eq(trips.companyId, companyId),
            eq(trips.status, 'completed'),
            sql`(${completedAtSql} at time zone ${SAO_PAULO})::date between ${from}::date and ${to}::date`,
          ),
        )
        .orderBy(asc(trips.id))
      return rows.map((row) => ({
        completedOn: row.completedOn,
        crewRole: toRole(row.crewRole),
        tripId: row.tripId,
      }))
    },
  }
}
