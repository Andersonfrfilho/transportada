/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4b: portas em memória das viagens do pagamento, sobre as portas da T1.4 (`buildInMemoryExpenses`). A
 * transação da inclusão/remoção (ocorrência travada, previsto recalculado pela soma) é imitada aqui; a prova contra
 * Postgres é `test/integration/expense-occurrence-trips.integration.ts`.
 */
import type {
  ExpenseOccurrenceTrip,
  ExpenseOccurrenceTripPorts,
  ExpenseTripParcelKind,
  PayableTripParcel,
} from '../../src/expenses/application/expense.port.js'
import { formatCents, parseMoneyToCents } from '../../src/expenses/domain/expense-money.policy.js'
import { buildInMemoryExpenses, type InMemoryExpenses } from './expenses-in-memory.fixture.js'

export type InMemoryTrip = {
  readonly companyId: string
  readonly completedOn: string | null
  readonly crew: readonly { readonly driverId: string; readonly role: ExpenseTripParcelKind }[]
  readonly status: string
  readonly tripId: string
}

export type InMemoryExpenseTrips = ExpenseOccurrenceTripPorts & {
  readonly base: InMemoryExpenses
  /**
   * `${tripId}:${driverId}` → linha da pessoa na parcela `driver` da viagem; `${tripId}:${driverId}:helper` → na
   * parcela `helper` (T1.4c).
   */
  readonly parcels: Map<string, PayableTripParcel>
  /** Quantas vezes a valoração foi pedida (cada chamada = uma leitura em lote). */
  readonly parcelReads: string[][]
  readonly tripLinks: (ExpenseOccurrenceTrip & { readonly companyId: string })[]
  readonly trips: InMemoryTrip[]
}

export function buildInMemoryExpenseTrips(base = buildInMemoryExpenses()): InMemoryExpenseTrips {
  const trips: InMemoryTrip[] = []
  const parcels = new Map<string, PayableTripParcel>()
  const parcelReads: string[][] = []
  const tripLinks: (ExpenseOccurrenceTrip & { readonly companyId: string })[] = []

  function recompute(occurrenceId: string, fallback: string | null): string {
    const linked = tripLinks.filter((link) => link.occurrenceId === occurrenceId)
    if (linked.length === 0 && fallback !== null) return fallback
    return formatCents(
      linked.reduce((sum, link) => sum + (parseMoneyToCents(link.amount) ?? 0n), 0n),
    )
  }

  return {
    audit: base.audit,
    base,
    expenses: base.expenses,
    occurrences: base.occurrences,
    occurrenceTrips: {
      include: async ({ companyId, trip }) => {
        const occurrence = base.occurrenceRows.find(
          (row) => row.id === trip.occurrenceId && row.companyId === companyId,
        )
        if (occurrence?.status !== 'open') return { status: 'not_open' }
        const taken = tripLinks.some(
          (link) =>
            link.tripId === trip.tripId &&
            link.parcelKind === trip.parcelKind &&
            link.driverId === trip.driverId,
        )
        if (taken) return { status: 'taken' }
        tripLinks.push({ ...trip, companyId })
        Object.assign(occurrence, { expectedAmount: recompute(occurrence.id, null) })
        return { occurrence, status: 'included' }
      },
      list: async ({ companyId, occurrenceId }) =>
        tripLinks
          .filter((link) => link.companyId === companyId && link.occurrenceId === occurrenceId)
          .map(
            (link): ExpenseOccurrenceTrip => ({
              amount: link.amount,
              completedOn: link.completedOn,
              dailyAmount: link.dailyAmount,
              days: link.days,
              driverId: link.driverId,
              occurrenceId: link.occurrenceId,
              parcelKind: link.parcelKind,
              tripId: link.tripId,
            }),
          ),
      listHeld: async ({ companyId, driverId, parcelKind, tripIds }) =>
        new Map(
          tripLinks
            .filter(
              (link) =>
                link.companyId === companyId &&
                link.driverId === driverId &&
                link.parcelKind === parcelKind &&
                tripIds.includes(link.tripId),
            )
            .map((link) => [link.tripId, link.occurrenceId]),
        ),
      remove: async ({ companyId, fallbackExpectedAmount, occurrenceId, parcelKind, tripId }) => {
        const occurrence = base.occurrenceRows.find(
          (row) => row.id === occurrenceId && row.companyId === companyId,
        )
        if (occurrence === undefined) return { status: 'not_found' }
        if (occurrence.status !== 'open') return { status: 'not_open' }
        const index = tripLinks.findIndex(
          (link) =>
            link.companyId === companyId &&
            link.occurrenceId === occurrenceId &&
            link.tripId === tripId &&
            link.parcelKind === parcelKind,
        )
        if (index < 0) return { status: 'not_found' }
        tripLinks.splice(index, 1)
        Object.assign(occurrence, {
          expectedAmount: recompute(occurrenceId, fallbackExpectedAmount),
        })
        return { occurrence, status: 'removed' }
      },
    },
    parcelReads,
    parcels,
    payableTrips: {
      findFacts: async ({ companyId, tripId }) => {
        const trip = trips.find((row) => row.tripId === tripId && row.companyId === companyId)
        if (trip === undefined) return null
        return {
          completedOn: trip.status === 'completed' ? trip.completedOn : null,
          crew: trip.crew,
          status: trip.status,
          tripId: trip.tripId,
        }
      },
      listCompleted: async ({ companyId, driverId, from, to }) =>
        trips.flatMap((trip) => {
          const member = trip.crew.find((crew) => crew.driverId === driverId)
          if (trip.companyId !== companyId || trip.status !== 'completed' || member === undefined)
            return []
          const completedOn = trip.completedOn ?? ''
          if (completedOn < from || completedOn > to) return []
          return [{ completedOn, crewRole: member.role, tripId: trip.tripId }]
        }),
      readPersonParcels: async ({ companyId, driverId, parcelKind, tripIds }) => {
        parcelReads.push([...tripIds])
        const found = new Map<string, PayableTripParcel>()
        for (const tripId of tripIds) {
          const trip = trips.find((row) => row.tripId === tripId && row.companyId === companyId)
          if (trip === undefined) continue
          const key =
            parcelKind === 'helper' ? `${tripId}:${driverId}:helper` : `${tripId}:${driverId}`
          const parcel = parcels.get(key)
          if (parcel !== undefined) found.set(tripId, parcel)
        }
        return found
      },
    },
    tripLinks,
    trips,
  }
}
