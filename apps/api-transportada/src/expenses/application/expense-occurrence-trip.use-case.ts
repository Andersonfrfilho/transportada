/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1d (T1.4b) e RF1e (T1.4c): as viagens do pagamento de motorista, agregado ou ajudante. A ocorrência de uma conta com favorecido
 * recebe as viagens concluídas dele; cada uma entra com a linha da pessoa na parcela já calculada na viagem (diária ×
 * dias, 143), copiada, e o previsto da ocorrência vira a soma delas. Nada aqui recalcula ou soma o custo da viagem de
 * novo: a conta é a da valoração, e a viagem continua dona do custo (ADR-0115).
 */
import { formatCents, parseMoneyToCents } from '../domain/expense-money.policy.js'
import {
  formatParcelAmount,
  resolveOccurrenceTripPeriod,
  type ExpenseTripPeriod,
} from '../domain/expense-trip.policy.js'
import {
  ExpenseOccurrenceAlreadyPaidError,
  ExpenseOccurrenceCanceledError,
  ExpenseOccurrenceNotDriverPaymentError,
  ExpenseOccurrenceNotFoundError,
  ExpenseOccurrenceTripNotFoundError,
  ExpenseTripAlreadyIncludedError,
  ExpenseTripNotCompletedError,
  ExpenseTripNotFoundError,
  ExpenseTripNotPayeeError,
  ExpenseTripParcelMissingError,
} from '../domain/expense.error.js'
import type {
  CompanyExpense,
  CompanyExpenseOccurrence,
  ExpenseOccurrenceTrip,
  ExpenseOccurrenceTripPorts,
  ExpenseTripParcelKind,
  ExpenseTripRoute,
} from './expense.port.js'

/**
 * As parcelas que o pagamento cobra: a do condutor (143) e, desde a T1.4c (RF1e), a do ajudante (149 D7). Cada
 * viagem entra pelo papel que a pessoa teve nela; a chave `unique(trip_id, parcel_kind, driver_id)` segura a parte
 * dela numa parcela em um pagamento só.
 */
export const PAYABLE_TRIP_PARCEL_KINDS: readonly ExpenseTripParcelKind[] = ['driver', 'helper']

/** O trajeto lido das paradas; `null` quando a viagem não tem parada (nunca inventado). */
type WithRoute = { readonly route: ExpenseTripRoute | null }

export type ExpenseOccurrenceTripItem = ExpenseOccurrenceTrip & WithRoute

export type ExpenseOccurrenceTripsResult = {
  readonly items: readonly ExpenseOccurrenceTripItem[]
  readonly occurrence: CompanyExpenseOccurrence
  /** Soma das viagens incluídas; o previsto da ocorrência é igual a ela enquanto houver viagem. */
  readonly tripsTotal: string
}

export type AvailableExpenseTrip = WithRoute & {
  readonly amount: string
  readonly completedOn: string
  readonly dailyAmount: string
  readonly days: number
  readonly parcelKind: ExpenseTripParcelKind
  readonly tripId: string
}

export type PendingExpenseTrip = WithRoute & {
  readonly completedOn: string
  /** Código da lacuna da valoração (ex.: `NO_PLANNED_DURATION`). */
  readonly gap: string
  readonly parcelKind: ExpenseTripParcelKind
  readonly tripId: string
}

export type AvailableExpenseTripsResult = {
  readonly available: readonly AvailableExpenseTrip[]
  readonly pending: readonly PendingExpenseTrip[]
  readonly period: ExpenseTripPeriod
}

type OccurrenceContext = {
  readonly expense: CompanyExpense & { readonly payeeDriverId: string }
  readonly occurrence: CompanyExpenseOccurrence
}

async function loadPaymentOccurrence(
  ports: ExpenseOccurrenceTripPorts,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<OccurrenceContext> {
  const occurrence = await ports.occurrences.findById(input)
  if (occurrence === null) throw new ExpenseOccurrenceNotFoundError()
  const expense = await ports.expenses.findById({
    companyId: input.companyId,
    expenseId: occurrence.expenseId,
  })
  if (expense === null) throw new ExpenseOccurrenceNotFoundError()
  if (expense.payeeDriverId === null) throw new ExpenseOccurrenceNotDriverPaymentError()
  return { expense: { ...expense, payeeDriverId: expense.payeeDriverId }, occurrence }
}

function assertOpen(occurrence: CompanyExpenseOccurrence): void {
  if (occurrence.status === 'paid') throw new ExpenseOccurrenceAlreadyPaidError()
  if (occurrence.status === 'canceled') throw new ExpenseOccurrenceCanceledError()
}

function sumTrips(items: readonly ExpenseOccurrenceTrip[]): string {
  return formatCents(
    items.reduce((total, item) => total + (parseMoneyToCents(item.amount) ?? 0n), 0n),
  )
}

async function readResult(
  ports: ExpenseOccurrenceTripPorts,
  input: { readonly companyId: string; readonly occurrence: CompanyExpenseOccurrence },
): Promise<ExpenseOccurrenceTripsResult> {
  const items = await ports.occurrenceTrips.list({
    companyId: input.companyId,
    occurrenceId: input.occurrence.id,
  })
  const routes = await ports.payableTrips.readRoutes({
    companyId: input.companyId,
    tripIds: items.map((item) => item.tripId),
  })
  return {
    items: items.map((item) => ({ ...item, route: routes.get(item.tripId) ?? null })),
    occurrence: input.occurrence,
    tripsTotal: sumTrips(items),
  }
}

export function createListExpenseOccurrenceTripsUseCase(ports: ExpenseOccurrenceTripPorts): {
  execute(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ExpenseOccurrenceTripsResult>
} {
  return {
    execute: async (input) => {
      const { occurrence } = await loadPaymentOccurrence(ports, input)
      return readResult(ports, { companyId: input.companyId, occurrence })
    },
  }
}

/**
 * As viagens que podem entrar: concluídas no período (o da ocorrência, ou o pedido), com o favorecido na tripulação
 * num papel que o pagamento cobre, e cuja parte dele ainda não está em pagamento nenhum. A viagem com lacuna na
 * parcela vai para `pending`, nunca com valor inventado.
 */
export function createListAvailableExpenseTripsUseCase(ports: ExpenseOccurrenceTripPorts): {
  execute(input: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly period?: ExpenseTripPeriod
  }): Promise<AvailableExpenseTripsResult>
} {
  return {
    execute: async (input) => {
      const { expense, occurrence } = await loadPaymentOccurrence(ports, input)
      const period =
        input.period ??
        resolveOccurrenceTripPeriod({
          competence: occurrence.competence,
          recurrence: expense.recurrence,
          slot: occurrence.slot ?? 1,
        })
      const candidates = (
        await ports.payableTrips.listCompleted({
          companyId: input.companyId,
          driverId: expense.payeeDriverId,
          from: period.from,
          to: period.to,
        })
      ).filter((candidate) => PAYABLE_TRIP_PARCEL_KINDS.includes(candidate.crewRole))

      const routes = await ports.payableTrips.readRoutes({
        companyId: input.companyId,
        tripIds: candidates.map((candidate) => candidate.tripId),
      })
      const available: AvailableExpenseTrip[] = []
      const pending: PendingExpenseTrip[] = []
      for (const parcelKind of PAYABLE_TRIP_PARCEL_KINDS) {
        const ofKind = candidates.filter((candidate) => candidate.crewRole === parcelKind)
        if (ofKind.length === 0) continue
        const lookup = {
          companyId: input.companyId,
          driverId: expense.payeeDriverId,
          parcelKind,
          tripIds: ofKind.map((candidate) => candidate.tripId),
        }
        const held = await ports.occurrenceTrips.listHeld(lookup)
        const free = ofKind.filter((candidate) => !held.has(candidate.tripId))
        if (free.length === 0) continue
        const parcels = await ports.payableTrips.readPersonParcels({
          ...lookup,
          tripIds: free.map((candidate) => candidate.tripId),
        })
        for (const candidate of free) {
          const parcel = parcels.get(candidate.tripId)
          if (parcel === undefined) continue
          const base = {
            completedOn: candidate.completedOn,
            parcelKind,
            route: routes.get(candidate.tripId) ?? null,
            tripId: candidate.tripId,
          }
          if (parcel.status === 'missing') {
            pending.push({ ...base, gap: parcel.gap })
            continue
          }
          available.push({
            ...base,
            amount: formatParcelAmount(parcel.amount),
            dailyAmount: parcel.dailyAmount,
            days: parcel.days,
          })
        }
      }
      const byDate = (left: { completedOn: string }, right: { completedOn: string }) =>
        left.completedOn.localeCompare(right.completedOn)
      return { available: available.sort(byDate), pending: pending.sort(byDate), period }
    },
  }
}

export type IncludeExpenseOccurrenceTripInput = {
  readonly companyId: string
  readonly correlationId?: string
  readonly includedBy: string
  readonly occurrenceId: string
  readonly tripId: string
}

/** CA05c: viagem de outro motorista, não concluída, sem parcela ou já paga noutra ocorrência → 409. */
export function createIncludeExpenseOccurrenceTripUseCase(ports: ExpenseOccurrenceTripPorts): {
  execute(input: IncludeExpenseOccurrenceTripInput): Promise<ExpenseOccurrenceTripsResult>
} {
  return {
    execute: async (input) => {
      const { expense, occurrence } = await loadPaymentOccurrence(ports, input)
      assertOpen(occurrence)
      const payeeDriverId = expense.payeeDriverId

      const facts = await ports.payableTrips.findFacts({
        companyId: input.companyId,
        tripId: input.tripId,
      })
      if (facts === null) throw new ExpenseTripNotFoundError()
      if (facts.status !== 'completed' || facts.completedOn === null) {
        throw new ExpenseTripNotCompletedError()
      }
      const member = facts.crew.find((crew) => crew.driverId === payeeDriverId)
      if (member === undefined || !PAYABLE_TRIP_PARCEL_KINDS.includes(member.role)) {
        throw new ExpenseTripNotPayeeError()
      }
      const lookup = {
        companyId: input.companyId,
        driverId: payeeDriverId,
        parcelKind: member.role,
        tripIds: [input.tripId],
      }
      const holder = (await ports.occurrenceTrips.listHeld(lookup)).get(input.tripId)
      if (holder === occurrence.id)
        return readResult(ports, { companyId: input.companyId, occurrence })
      if (holder !== undefined) throw new ExpenseTripAlreadyIncludedError()

      const parcel = (await ports.payableTrips.readPersonParcels(lookup)).get(input.tripId)
      if (parcel === undefined) throw new ExpenseTripNotPayeeError()
      if (parcel.status === 'missing') throw new ExpenseTripParcelMissingError(parcel.gap)

      const trip: ExpenseOccurrenceTrip = {
        amount: formatParcelAmount(parcel.amount),
        completedOn: facts.completedOn,
        dailyAmount: parcel.dailyAmount,
        days: parcel.days,
        driverId: payeeDriverId,
        occurrenceId: occurrence.id,
        parcelKind: member.role,
        tripId: input.tripId,
      }
      const outcome = await ports.occurrenceTrips.include({
        companyId: input.companyId,
        createdBy: input.includedBy,
        trip,
      })
      if (outcome.status !== 'included') {
        if (outcome.status === 'taken') throw new ExpenseTripAlreadyIncludedError()
        const current = await ports.occurrences.findById(input)
        if (current === null) throw new ExpenseOccurrenceNotFoundError()
        assertOpen(current)
        throw new ExpenseOccurrenceAlreadyPaidError()
      }
      await ports.audit.append({
        action: 'expense.occurrence.trip.included',
        actorUserId: input.includedBy,
        companyId: input.companyId,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        entityId: occurrence.id,
        entityType: 'company_expense_occurrence',
        metadata: {
          amount: trip.amount,
          expectedAmount: outcome.occurrence.expectedAmount,
          parcelKind: trip.parcelKind,
          tripId: trip.tripId,
        },
      })
      return readResult(ports, { companyId: input.companyId, occurrence: outcome.occurrence })
    },
  }
}

export type RemoveExpenseOccurrenceTripInput = {
  readonly companyId: string
  readonly correlationId?: string
  readonly occurrenceId: string
  readonly removedBy: string
  readonly tripId: string
}

/** Tirar a viagem da ocorrência aberta a devolve às disponíveis; a ocorrência paga é imutável (409). */
export function createRemoveExpenseOccurrenceTripUseCase(ports: ExpenseOccurrenceTripPorts): {
  execute(input: RemoveExpenseOccurrenceTripInput): Promise<ExpenseOccurrenceTripsResult>
} {
  return {
    execute: async (input) => {
      const { expense, occurrence } = await loadPaymentOccurrence(ports, input)
      assertOpen(occurrence)
      const included = (
        await ports.occurrenceTrips.list({
          companyId: input.companyId,
          occurrenceId: occurrence.id,
        })
      ).find((trip) => trip.tripId === input.tripId)
      if (included === undefined) throw new ExpenseOccurrenceTripNotFoundError()

      const outcome = await ports.occurrenceTrips.remove({
        companyId: input.companyId,
        fallbackExpectedAmount: expense.expectedAmount,
        occurrenceId: occurrence.id,
        parcelKind: included.parcelKind,
        tripId: input.tripId,
      })
      if (outcome.status !== 'removed') {
        if (outcome.status === 'not_found') throw new ExpenseOccurrenceTripNotFoundError()
        const current = await ports.occurrences.findById(input)
        if (current === null) throw new ExpenseOccurrenceNotFoundError()
        assertOpen(current)
        throw new ExpenseOccurrenceAlreadyPaidError()
      }
      await ports.audit.append({
        action: 'expense.occurrence.trip.removed',
        actorUserId: input.removedBy,
        companyId: input.companyId,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        entityId: occurrence.id,
        entityType: 'company_expense_occurrence',
        metadata: {
          amount: included.amount,
          expectedAmount: outcome.occurrence.expectedAmount,
          parcelKind: included.parcelKind,
          tripId: included.tripId,
        },
      })
      return readResult(ports, { companyId: input.companyId, occurrence: outcome.occurrence })
    },
  }
}
