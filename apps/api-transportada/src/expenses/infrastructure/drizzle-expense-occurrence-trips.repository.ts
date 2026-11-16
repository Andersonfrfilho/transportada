/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4b: as viagens do pagamento sobre Drizzle. Toda consulta carrega `company_id`. Incluir e remover
 * correm numa transação com a ocorrência travada (`FOR UPDATE`) e só enquanto ela está `open`: a baixa
 * (`UPDATE … WHERE status = 'open'`) e a inclusão nunca se cruzam, e o previsto é recalculado pelo banco, como a soma
 * das viagens que ficaram.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import {
  companyExpenseOccurrenceTrips,
  companyExpenseOccurrences,
} from '../../database/company-expense.schema.js'
import { formatFiscalDay } from '../../shared/fiscal-day.service.js'
import type {
  CompanyExpenseOccurrence,
  ExpenseOccurrenceTrip,
  ExpenseOccurrenceTripPorts,
} from '../application/expense.port.js'
import { createDrizzleExpensesPorts } from './drizzle-expenses.repository.js'
import { createPayableTripQueries } from './payable-trip.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type TripRow = typeof companyExpenseOccurrenceTrips.$inferSelect
type OccurrenceRow = typeof companyExpenseOccurrences.$inferSelect

const UNIQUE_VIOLATION = '23505'

function toTrip(row: TripRow): ExpenseOccurrenceTrip {
  return {
    amount: row.amount,
    completedOn: row.completedOn,
    dailyAmount: row.dailyAmount,
    days: row.days,
    driverId: row.driverId,
    occurrenceId: row.occurrenceId,
    parcelKind: row.parcelKind,
    tripId: row.tripId,
  }
}

function toOccurrence(row: OccurrenceRow): CompanyExpenseOccurrence {
  return {
    companyId: row.companyId,
    competence: row.competence,
    dueDate: row.dueDate,
    expectedAmount: row.expectedAmount,
    expenseId: row.expenseId,
    id: row.id,
    paidAmount: row.paidAmount,
    paidAt: row.paidAt === null ? null : formatFiscalDay(row.paidAt),
    paidBy: row.paidByUserId,
    settlementNote: row.settlementNote,
    slot: row.slot === 2 ? 2 : 1,
    status: row.status,
  }
}

/** O Bun SQL expõe o SQLSTATE em `errno` (e o drizzle embrulha em `cause`); o pg, em `code`. */
function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current !== undefined && current !== null; ) {
    const candidate = current as { cause?: unknown; code?: unknown; errno?: unknown }
    if (candidate.code === UNIQUE_VIOLATION || candidate.errno === UNIQUE_VIOLATION) return true
    current = candidate.cause
  }
  return false
}

/** Recalcula o previsto como a soma das viagens que ficaram; sem nenhuma, volta ao `fallback` (valor da conta). */
function recomputeExpected(occurrenceId: string, companyId: string, fallback: null | string) {
  const total = sql`(select sum(${companyExpenseOccurrenceTrips.amount}) from ${companyExpenseOccurrenceTrips}
    where ${companyExpenseOccurrenceTrips.companyId} = ${companyId}
      and ${companyExpenseOccurrenceTrips.occurrenceId} = ${occurrenceId})`
  return fallback === null ? total : sql`coalesce(${total}, ${fallback}::numeric)`
}

export function createDrizzleExpenseOccurrenceTripPorts(
  database: Database,
  dependencies: {
    readonly readPersonParcels: ExpenseOccurrenceTripPorts['payableTrips']['readPersonParcels']
  },
): ExpenseOccurrenceTripPorts {
  const base = createDrizzleExpensesPorts(database)

  return {
    audit: base.audit,
    expenses: base.expenses,
    occurrences: base.occurrences,
    occurrenceTrips: {
      include: async ({ companyId, createdBy, trip }) => {
        try {
          return await database.transaction(async (transaction) => {
            const [locked] = await transaction
              .select({ status: companyExpenseOccurrences.status })
              .from(companyExpenseOccurrences)
              .where(
                and(
                  eq(companyExpenseOccurrences.companyId, companyId),
                  eq(companyExpenseOccurrences.id, trip.occurrenceId),
                ),
              )
              .for('update')
            if (locked?.status !== 'open') return { status: 'not_open' as const }

            const inserted = await transaction
              .insert(companyExpenseOccurrenceTrips)
              .values({
                amount: trip.amount,
                companyId,
                completedOn: trip.completedOn,
                createdByUserId: createdBy,
                dailyAmount: trip.dailyAmount,
                days: trip.days,
                driverId: trip.driverId,
                occurrenceId: trip.occurrenceId,
                parcelKind: trip.parcelKind,
                tripId: trip.tripId,
              })
              .onConflictDoNothing({
                target: [
                  companyExpenseOccurrenceTrips.tripId,
                  companyExpenseOccurrenceTrips.parcelKind,
                  companyExpenseOccurrenceTrips.driverId,
                ],
              })
              .returning({ id: companyExpenseOccurrenceTrips.id })
            if (inserted.length === 0) return { status: 'taken' as const }

            const [updated] = await transaction
              .update(companyExpenseOccurrences)
              .set({
                expectedAmount: recomputeExpected(trip.occurrenceId, companyId, null),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(companyExpenseOccurrences.companyId, companyId),
                  eq(companyExpenseOccurrences.id, trip.occurrenceId),
                ),
              )
              .returning()
            if (updated === undefined)
              throw new Error('company_expense_occurrences update returned no row')
            return { occurrence: toOccurrence(updated), status: 'included' as const }
          })
        } catch (error) {
          if (isUniqueViolation(error)) return { status: 'taken' }
          throw error
        }
      },
      list: async ({ companyId, occurrenceId }) => {
        const rows = await database
          .select()
          .from(companyExpenseOccurrenceTrips)
          .where(
            and(
              eq(companyExpenseOccurrenceTrips.companyId, companyId),
              eq(companyExpenseOccurrenceTrips.occurrenceId, occurrenceId),
            ),
          )
          .orderBy(
            asc(companyExpenseOccurrenceTrips.completedOn),
            asc(companyExpenseOccurrenceTrips.createdAt),
          )
        return rows.map(toTrip)
      },
      listHeld: async ({ companyId, driverId, parcelKind, tripIds }) => {
        const held = new Map<string, string>()
        if (tripIds.length === 0) return held
        const rows = await database
          .select({
            occurrenceId: companyExpenseOccurrenceTrips.occurrenceId,
            tripId: companyExpenseOccurrenceTrips.tripId,
          })
          .from(companyExpenseOccurrenceTrips)
          .where(
            and(
              eq(companyExpenseOccurrenceTrips.companyId, companyId),
              eq(companyExpenseOccurrenceTrips.driverId, driverId),
              eq(companyExpenseOccurrenceTrips.parcelKind, parcelKind),
              inArray(companyExpenseOccurrenceTrips.tripId, [...tripIds]),
            ),
          )
        for (const row of rows) held.set(row.tripId, row.occurrenceId)
        return held
      },
      remove: async ({ companyId, fallbackExpectedAmount, occurrenceId, parcelKind, tripId }) =>
        database.transaction(async (transaction) => {
          const [locked] = await transaction
            .select({ status: companyExpenseOccurrences.status })
            .from(companyExpenseOccurrences)
            .where(
              and(
                eq(companyExpenseOccurrences.companyId, companyId),
                eq(companyExpenseOccurrences.id, occurrenceId),
              ),
            )
            .for('update')
          if (locked === undefined) return { status: 'not_found' as const }
          if (locked.status !== 'open') return { status: 'not_open' as const }

          const deleted = await transaction
            .delete(companyExpenseOccurrenceTrips)
            .where(
              and(
                eq(companyExpenseOccurrenceTrips.companyId, companyId),
                eq(companyExpenseOccurrenceTrips.occurrenceId, occurrenceId),
                eq(companyExpenseOccurrenceTrips.tripId, tripId),
                eq(companyExpenseOccurrenceTrips.parcelKind, parcelKind),
              ),
            )
            .returning({ id: companyExpenseOccurrenceTrips.id })
          if (deleted.length === 0) return { status: 'not_found' as const }

          const [updated] = await transaction
            .update(companyExpenseOccurrences)
            .set({
              expectedAmount: recomputeExpected(occurrenceId, companyId, fallbackExpectedAmount),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(companyExpenseOccurrences.companyId, companyId),
                eq(companyExpenseOccurrences.id, occurrenceId),
              ),
            )
            .returning()
          if (updated === undefined)
            throw new Error('company_expense_occurrences update returned no row')
          return { occurrence: toOccurrence(updated), status: 'removed' as const }
        }),
    },
    payableTrips: {
      ...createPayableTripQueries(database),
      readPersonParcels: dependencies.readPersonParcels,
    },
  }
}
