/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.5: o resultado do período, calculado na leitura (ADR-0116 §4, §7). Um só cálculo serve a tela, a exportação
 * (T4.6) e o custo por km (RF17): lucro = faturamento − custo das viagens − contas, e a soma das margens por viagem, por
 * veículo e por cliente fecha com ele, centavo a centavo, com o não rateado sempre à vista.
 */
import { formatCents, parseMoneyToCents } from '../domain/expense-money.policy.js'
import {
  allocateExpenses,
  DEFAULT_ALLOCATION_SETTINGS,
  type AllocatableCostGroup,
  type AllocationCriterion,
  type AllocationExpense,
  type AllocationSettings,
  type AllocationTrip,
  type AllocationUnallocated,
} from '../domain/expense-allocation.policy.js'
import {
  expenseMatchesFilters,
  hasResultFilters,
  tripMatchesFilters,
  type ExpenseResultFilters,
} from '../domain/expense-result-filters.policy.js'
import type {
  ExpenseAllocationSettingsPorts,
  ExpenseResultPorts,
  ResultOccurrence,
} from './expense-result.port.js'

export type ExpenseResultInput = {
  readonly companyId: string
  /** `yyyy-mm-dd`. */
  /** Filtros do painel (RF18): escolhem o que aparece e soma, nunca o rateio (ADR-0116 §4). */
  readonly filters?: ExpenseResultFilters
  readonly from: string
  readonly to: string
}

export type ExpenseResultLine = {
  readonly cost: string
  /** Rateio das contas sem veículo (e o excedente do pagamento do motorista). */
  readonly generalShare: string
  readonly id: string
  readonly margin: string
  readonly revenue: string
  /** Rateio das contas ligadas ao veículo da viagem. */
  readonly vehicleShare: string
}

export type ExpenseResult = {
  readonly byCustomer: readonly ExpenseResultLine[]
  readonly byTrip: readonly ExpenseResultLine[]
  readonly byVehicle: readonly ExpenseResultLine[]
  /** Pagamento que passou das viagens incluídas, rateado como conta da empresa (ADR-0116 §5). */
  /** Os filtros aplicados, só quando houve algum. */
  readonly filters?: ExpenseResultFilters
  readonly excesses?: readonly {
    readonly amount: string
    readonly occurrenceId: string
    readonly payeeDriverId: string | null
  }[]
  /** Pagamento de motorista sem nenhuma viagem incluída: o operador inclui as viagens ou confirma que é conta da empresa. */
  readonly paymentsWithoutTrips?: readonly {
    readonly amount: string
    readonly occurrenceId: string
    readonly payeeDriverId: string | null
  }[]
  /** O critério usado em cada grupo, para a tela e a exportação explicarem o número (ADR-0116 §4). */
  readonly settings?: AllocationSettings
  /** Contas sem viagem elegível, sempre à vista (ADR-0116 §6). */
  readonly unallocatedItems?: readonly (AllocationUnallocated & { readonly name: string })[]
  readonly unallocatedTotal: string
  readonly totals: {
    readonly expensesTotal: string
    readonly profit: string
    readonly revenue: string
    readonly tripCost: string
  }
}

const ZERO = 0n

/** Pago vale o pago; o resto vale o previsto. Cancelada nunca entra (ADR-0116 §3). */
function considered(occurrence: ResultOccurrence): string {
  return occurrence.status === 'paid' && occurrence.paidAmount !== null
    ? occurrence.paidAmount
    : occurrence.expectedAmount
}

function cents(value: string): bigint {
  const parsed = parseMoneyToCents(value)
  if (parsed === null) throw new Error(`expense result: invalid money "${value}"`)
  return parsed
}

export type Totals = { cost: bigint; general: bigint; revenue: bigint; vehicle: bigint }

function emptyTotals(): Totals {
  return { cost: ZERO, general: ZERO, revenue: ZERO, vehicle: ZERO }
}

function toLine(id: string, totals: Totals): ExpenseResultLine {
  return {
    cost: formatCents(totals.cost),
    generalShare: formatCents(totals.general),
    id,
    margin: formatCents(totals.revenue - totals.cost - totals.vehicle - totals.general),
    revenue: formatCents(totals.revenue),
    vehicleShare: formatCents(totals.vehicle),
  }
}

/** O cálculo inteiro, devolvendo também o que o custo por km precisa (metros por viagem). */
export type ComputedExpenseResult = {
  readonly result: ExpenseResult
  readonly trips: readonly AllocationTrip[]
  readonly vehicleTotals: ReadonlyMap<string, Totals>
  readonly expensesTotal: bigint
}

export async function computeExpenseResult(
  ports: ExpenseResultPorts,
  input: ExpenseResultInput,
): Promise<ComputedExpenseResult> {
  const query = { companyId: input.companyId, from: input.from, to: input.to }
  const [allTrips, occurrences, configured] = await Promise.all([
    ports.trips.listCompleted(query),
    ports.occurrences.listForPeriod(query),
    ports.allocationSettings.get({ companyId: input.companyId }),
  ])
  const settings: AllocationSettings = { ...DEFAULT_ALLOCATION_SETTINGS, ...configured }

  const active = occurrences.filter((occurrence) => occurrence.status !== 'canceled')
  const expenses: AllocationExpense[] = active.map((occurrence) => ({
    amount: considered(occurrence),
    costGroup: occurrence.costGroup,
    expenseId: occurrence.expenseId,
    includedTripsAmount: occurrence.includedTripsAmount,
    name: occurrence.name,
    occurrenceId: occurrence.occurrenceId,
    payeeDriverId: occurrence.payeeDriverId,
    vehicleId: occurrence.vehicleId,
  }))
  // O rateio é sempre sobre o período inteiro; o filtro (RF18, ADR-0116 §4) só escolhe o que aparece e soma.
  const allocation = allocateExpenses({ expenses, settings, trips: allTrips })

  const filters: ExpenseResultFilters = input.filters ?? {}
  const filtered = hasResultFilters(input.filters)
  const tripLevelFilter = filters.vehicleId !== undefined || filters.customerId !== undefined
  const trips = allTrips.filter((trip) => tripMatchesFilters(trip, filters))
  const keptTripIds = new Set(trips.map((trip) => trip.tripId))
  const keptOccurrenceIds = new Set(
    active
      .filter((occurrence) => expenseMatchesFilters(occurrence, filters))
      .map((occurrence) => occurrence.occurrenceId),
  )
  const keptShares = allocation.shares.filter(
    (share) => keptTripIds.has(share.tripId) && keptOccurrenceIds.has(share.occurrenceId),
  )
  // Conta sem viagem elegível não pertence a nenhuma viagem: com filtro de cliente some, com o de veículo só fica a ligada a ele.
  const keptUnallocated = allocation.unallocated.filter((item) => {
    if (!keptOccurrenceIds.has(item.occurrenceId)) return false
    if (filters.customerId !== undefined) return false
    if (filters.vehicleId !== undefined) return item.vehicleId === filters.vehicleId
    return true
  })
  // Pagamento acima das viagens e sem viagem: contas da empresa, sem veículo nem cliente.
  const keptExcesses = tripLevelFilter
    ? []
    : allocation.excesses.filter((excess) => keptOccurrenceIds.has(excess.occurrenceId))

  const byTrip = new Map<string, Totals>()
  for (const trip of trips) {
    byTrip.set(trip.tripId, {
      ...emptyTotals(),
      cost: cents(trip.cost),
      revenue: cents(trip.revenue),
    })
  }
  for (const share of keptShares) {
    const totals = byTrip.get(share.tripId)
    if (totals === undefined) continue
    if (share.scope === 'vehicle') totals.vehicle += cents(share.amount)
    else totals.general += cents(share.amount)
  }

  const group = (key: (trip: AllocationTrip) => string): Map<string, Totals> => {
    const grouped = new Map<string, Totals>()
    for (const trip of trips) {
      const source = byTrip.get(trip.tripId)
      if (source === undefined) continue
      const target = grouped.get(key(trip)) ?? emptyTotals()
      target.cost += source.cost
      target.general += source.general
      target.revenue += source.revenue
      target.vehicle += source.vehicle
      grouped.set(key(trip), target)
    }
    return grouped
  }
  const byVehicle = group((trip) => trip.vehicleId)
  const byCustomer = group((trip) => trip.customerId)

  // Contas (§3): o que foi rateado às viagens à vista mais o não rateado; a parte do pagamento coberta pelas viagens já está no custo.
  let expensesTotal = ZERO
  for (const share of keptShares) expensesTotal += cents(share.amount)
  let unallocated = ZERO
  for (const item of keptUnallocated) unallocated += cents(item.amount)
  expensesTotal += unallocated

  let revenue = ZERO
  let tripCost = ZERO
  for (const totals of byTrip.values()) {
    revenue += totals.revenue
    tripCost += totals.cost
  }

  const lines = (grouped: ReadonlyMap<string, Totals>): ExpenseResultLine[] =>
    [...grouped.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, totals]) => toLine(id, totals))

  const payeeByOccurrence = new Map(active.map((o) => [o.occurrenceId, o.payeeDriverId]))
  const nameByOccurrence = new Map(active.map((o) => [o.occurrenceId, o.name]))
  const result: ExpenseResult = {
    byCustomer: lines(byCustomer),
    byTrip: lines(byTrip),
    byVehicle: lines(byVehicle),
    excesses: keptExcesses.map((excess) => ({
      amount: excess.amount,
      occurrenceId: excess.occurrenceId,
      payeeDriverId: payeeByOccurrence.get(excess.occurrenceId) ?? null,
    })),
    ...(filtered ? { filters } : {}),
    paymentsWithoutTrips: tripLevelFilter
      ? []
      : active
          .filter(
            (o) =>
              keptOccurrenceIds.has(o.occurrenceId) &&
              o.costGroup === 'in_trip' &&
              cents(o.includedTripsAmount) === ZERO,
          )
          .map((o) => ({
            amount: considered(o),
            occurrenceId: o.occurrenceId,
            payeeDriverId: o.payeeDriverId,
          })),
    settings,
    totals: {
      expensesTotal: formatCents(expensesTotal),
      profit: formatCents(revenue - tripCost - expensesTotal),
      revenue: formatCents(revenue),
      tripCost: formatCents(tripCost),
    },
    unallocatedItems: keptUnallocated.map((item) => ({
      ...item,
      name: nameByOccurrence.get(item.occurrenceId) ?? '',
    })),
    unallocatedTotal: formatCents(unallocated),
  }
  return { expensesTotal, result, trips, vehicleTotals: byVehicle }
}

export function createGetExpenseResultUseCase(ports: ExpenseResultPorts): {
  execute(input: ExpenseResultInput): Promise<ExpenseResult>
} {
  return { execute: async (input) => (await computeExpenseResult(ports, input)).result }
}

export type ExpenseUnitCostLine = {
  /** Custo das viagens + contas rateadas a elas, em reais por quilômetro com quatro casas; `null` sem quilômetro. */
  readonly costPerKm: string | null
  readonly expensesShare: string
  readonly kilometers: string
  readonly totalCost: string
  readonly tripCost: string
  readonly vehicleId: string | null
}

export type ExpenseUnitCosts = {
  readonly general: ExpenseUnitCostLine
  readonly perVehicle: readonly ExpenseUnitCostLine[]
}

/** `centavos / km` com quatro casas, meio para cima: `centavos × 100 × 1000 / metros` em décimos de milésimo. */
function costPerKm(totalCents: bigint, meters: bigint): string | null {
  if (meters <= ZERO) return null
  const scaled = (totalCents * 100_000n * 2n + meters) / (meters * 2n)
  const negative = scaled < ZERO
  const absolute = negative ? -scaled : scaled
  return `${negative ? '-' : ''}${absolute / 10_000n}.${(absolute % 10_000n).toString().padStart(4, '0')}`
}

function kilometersOf(meters: bigint): string {
  return `${meters / 1000n}.${(meters % 1000n).toString().padStart(3, '0')}`
}

function unitLine(
  vehicleId: string | null,
  totals: { expenses: bigint; meters: bigint; tripCost: bigint },
): ExpenseUnitCostLine {
  const total = totals.tripCost + totals.expenses
  return {
    costPerKm: costPerKm(total, totals.meters),
    expensesShare: formatCents(totals.expenses),
    kilometers: kilometersOf(totals.meters),
    totalCost: formatCents(total),
    tripCost: formatCents(totals.tripCost),
    vehicleId,
  }
}

/**
 * RF17: custo por km por veículo e geral, do **mesmo** cálculo do resultado (a futura cotação de frete o reaproveita).
 * Custo do veículo = custo das viagens + contas rateadas a elas; o geral soma também o não rateado, para que ele
 * represente todo o custo do período dividido por todos os quilômetros.
 */
export function createGetExpenseUnitCostsUseCase(ports: ExpenseResultPorts): {
  execute(input: ExpenseResultInput): Promise<ExpenseUnitCosts>
} {
  return {
    execute: async (input) => {
      const computed = await computeExpenseResult(ports, input)
      const metersByVehicle = new Map<string, bigint>()
      for (const trip of computed.trips) {
        const meters = BigInt(Math.max(0, Math.round(trip.distanceMeters)))
        metersByVehicle.set(trip.vehicleId, (metersByVehicle.get(trip.vehicleId) ?? ZERO) + meters)
      }
      const perVehicle = [...computed.vehicleTotals.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([vehicleId, totals]) =>
          unitLine(vehicleId, {
            expenses: totals.vehicle + totals.general,
            meters: metersByVehicle.get(vehicleId) ?? ZERO,
            tripCost: totals.cost,
          }),
        )
      let meters = ZERO
      for (const value of metersByVehicle.values()) meters += value
      return {
        general: unitLine(null, {
          expenses: computed.expensesTotal,
          meters,
          tripCost: cents(computed.result.totals.tripCost),
        }),
        perVehicle,
      }
    },
  }
}

export type GetExpenseAllocationSettingsInput = { readonly companyId: string }
export type UpdateExpenseAllocationSettingsInput = {
  readonly companyId: string
  readonly correlationId?: string
  readonly settings: Partial<Record<AllocatableCostGroup, AllocationCriterion>>
  readonly updatedBy: string
}

export function createGetExpenseAllocationSettingsUseCase(ports: ExpenseAllocationSettingsPorts): {
  execute(input: GetExpenseAllocationSettingsInput): Promise<AllocationSettings>
} {
  return {
    execute: async ({ companyId }) => ({
      ...DEFAULT_ALLOCATION_SETTINGS,
      ...(await ports.allocationSettings.get({ companyId })),
    }),
  }
}

export function createUpdateExpenseAllocationSettingsUseCase(
  ports: ExpenseAllocationSettingsPorts,
): { execute(input: UpdateExpenseAllocationSettingsInput): Promise<AllocationSettings> } {
  return {
    execute: async ({ companyId, correlationId, settings, updatedBy }) => {
      const saved = await ports.allocationSettings.save({
        companyId,
        correlationId: correlationId ?? crypto.randomUUID(),
        settings,
        updatedBy,
      })
      return { ...DEFAULT_ALLOCATION_SETTINGS, ...saved }
    },
  }
}
