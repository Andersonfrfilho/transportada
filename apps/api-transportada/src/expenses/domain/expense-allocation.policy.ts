/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.4 (contratos da T4.2): o rateio das contas entre as viagens, função pura e sem banco (ADR-0116).
 * Dinheiro entra e sai em texto com duas casas; a conta fecha em centavos (piso + resto à viagem de maior peso, pelo
 * mesmo `distributeByWeight` do rateio por nota da 232, com as viagens em ordem estável por conclusão e `id`).
 *
 * Três garantias, todas presas por `test/expenses/allocation.contract.ts`:
 * - para cada conta, Σ partes + não rateado = valor considerado, centavo a centavo (§6);
 * - o pagamento de motorista (`in_trip`) só entra pelo excedente sobre as viagens incluídas (§5): o custo do motorista
 *   mora uma vez, nas parcelas `driver`/`helper` da viagem;
 * - trocar o critério muda a divisão, nunca o total (§2, CA08).
 */
import { distributeByWeight } from '../../shared/proportional-split.policy.js'
import { formatCents, parseMoneyToCents } from './expense-money.policy.js'

export type ExpenseCostGroup = 'administrative' | 'in_trip' | 'per_km' | 'vehicle_fixed'
/** O grupo `in_trip` não é rateado: o custo já está na viagem (ADR-0116 §1, §5). */
export type AllocatableCostGroup = Exclude<ExpenseCostGroup, 'in_trip'>
export type AllocationCriterion = 'equal' | 'per_km' | 'per_revenue' | 'per_trip_day'
export type AllocationSettings = Readonly<Record<AllocatableCostGroup, AllocationCriterion>>

/** Padrão da empresa sem configuração (RF11): fixo por km, variável por km, administrativo pelo faturamento. */
export const DEFAULT_ALLOCATION_SETTINGS: AllocationSettings = {
  administrative: 'per_revenue',
  per_km: 'per_km',
  vehicle_fixed: 'per_km',
}

/** Viagem concluída no período, com o resultado vivo (ADR-0116 §2, §3). */
export type AllocationTrip = {
  /** O que a viagem já custa (parcelas `driver`/`helper` incluídas): o rateio nunca soma o motorista de novo. */
  readonly cost: string
  readonly customerId: string
  /** `yyyy-mm-dd`, a mesma conclusão do pagamento (T1.4b). */
  readonly completedOn: string
  readonly daysCount: number
  readonly distanceMeters: number
  readonly revenue: string
  readonly tripId: string
  readonly vehicleId: string
}

/** Conta do período com o valor já considerado (pago, senão previsto); cancelada nunca chega aqui. */
export type AllocationExpense = {
  readonly amount: string
  readonly costGroup: ExpenseCostGroup
  readonly expenseId: string
  /** Só no grupo `in_trip`: soma das viagens incluídas no pagamento (ADR-0116 §5). */
  readonly includedTripsAmount?: string
  readonly name: string
  readonly occurrenceId: string
  readonly payeeDriverId?: string | null
  readonly vehicleId: string | null
}

export type AllocationShare = {
  readonly amount: string
  /** `vehicle`: conta com `vehicle_id`; `general`: conta sem veículo e o excedente do pagamento. */
  readonly scope: 'general' | 'vehicle'
  readonly occurrenceId: string
  readonly tripId: string
}

export type UnallocatedReason = 'no_trip_weight' | 'vehicle_without_trips'

export type AllocationUnallocated = {
  readonly amount: string
  readonly occurrenceId: string
  readonly reason: UnallocatedReason
  readonly vehicleId: string | null
}

export type AllocationResult = {
  /** Pagamento que passou das viagens incluídas (bônus, adiantamento), no grupo administrativo. */
  readonly excesses: readonly { readonly amount: string; readonly occurrenceId: string }[]
  readonly shares: readonly AllocationShare[]
  readonly unallocated: readonly AllocationUnallocated[]
}

export function allocateExpenses(input: {
  readonly expenses: readonly AllocationExpense[]
  readonly settings: AllocationSettings
  readonly trips: readonly AllocationTrip[]
}): AllocationResult {
  const trips = [...input.trips].sort(compareTrips)
  const excesses: { amount: string; occurrenceId: string }[] = []
  const shares: AllocationShare[] = []
  const unallocated: AllocationUnallocated[] = []

  for (const expense of input.expenses) {
    const considered = requireCents(expense.amount, `amount of ${expense.occurrenceId}`)
    let amount = considered
    let group: AllocatableCostGroup
    let vehicleId = expense.vehicleId

    if (expense.costGroup === 'in_trip') {
      // §5: a parte coberta pelas viagens incluídas já está no custo delas; abaixo delas não há crédito.
      const included = requireCents(
        expense.includedTripsAmount ?? '0',
        `includedTripsAmount of ${expense.occurrenceId}`,
      )
      amount = considered > included ? considered - included : 0n
      if (amount === 0n) continue
      excesses.push({ amount: formatCents(amount), occurrenceId: expense.occurrenceId })
      // O excedente é conta da empresa, no grupo administrativo, entre as viagens de todos os veículos.
      group = 'administrative'
      vehicleId = null
    } else {
      group = expense.costGroup
    }

    if (amount === 0n) continue

    const eligible = vehicleId === null ? trips : trips.filter((t) => t.vehicleId === vehicleId)
    if (vehicleId !== null && eligible.length === 0) {
      unallocated.push({
        amount: formatCents(amount),
        occurrenceId: expense.occurrenceId,
        reason: 'vehicle_without_trips',
        vehicleId,
      })
      continue
    }

    const criterion = input.settings[group]
    const weights = eligible.map((trip) => weightOf(trip, criterion))
    if (weights.every((weight) => weight === 0n)) {
      unallocated.push({
        amount: formatCents(amount),
        occurrenceId: expense.occurrenceId,
        reason: 'no_trip_weight',
        vehicleId,
      })
      continue
    }

    const scope = vehicleId === null ? 'general' : 'vehicle'
    distributeByWeight(amount, weights).forEach((part, index) => {
      const trip = eligible[index]
      if (part === 0n || trip === undefined) return
      shares.push({
        amount: formatCents(part),
        occurrenceId: expense.occurrenceId,
        scope,
        tripId: trip.tripId,
      })
    })
  }

  return { excesses, shares, unallocated }
}

/** Ordem estável (§6): data de conclusão, depois `id`; o empate do resto cai sempre na mesma viagem. */
function compareTrips(left: AllocationTrip, right: AllocationTrip): number {
  if (left.completedOn !== right.completedOn) return left.completedOn < right.completedOn ? -1 : 1
  if (left.tripId === right.tripId) return 0
  return left.tripId < right.tripId ? -1 : 1
}

/** Peso da viagem pelo critério (§2). Sem o dado (zero, negativo ou ilegível), peso zero: as outras absorvem. */
function weightOf(trip: AllocationTrip, criterion: AllocationCriterion): bigint {
  switch (criterion) {
    case 'equal':
      return 1n
    case 'per_km':
      return positiveWhole(trip.distanceMeters)
    case 'per_trip_day':
      return positiveWhole(trip.daysCount)
    case 'per_revenue':
      return revenueWeight(trip.revenue)
  }
}

function positiveWhole(value: number): bigint {
  return Number.isFinite(value) && value > 0 ? BigInt(Math.round(value)) : 0n
}

/**
 * A receita é só peso, então aceita as quatro casas de `numeric(19,4)` como vêm do banco, sem arredondar: o peso de
 * `'1000.0000'` e de `'1000.00'` é o mesmo. Negativa ou ilegível pesa zero (a viagem sem CT-e não puxa conta).
 */
function revenueWeight(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value.trim())
  if (match?.[1] === undefined) return 0n
  return BigInt(match[1]) * 10_000n + BigInt((match[2] ?? '').padEnd(4, '0'))
}

/**
 * Valor de conta em centavos. Aceita as quatro casas do banco só quando as duas últimas são zero (`'10.5000'`): a conta
 * da empresa é digitada com duas casas, e arredondar aqui faria a soma deixar de bater com Contas. Ilegível é defeito de
 * quem montou a entrada, nunca zero silencioso.
 */
function requireCents(value: string, label: string): bigint {
  const cents = parseMoneyToCents(value.trim().replace(/^(\d+\.\d{2})0{1,2}$/, '$1'))
  if (cents === null) throw new Error(`expense allocation: invalid money in ${label}`)
  return cents
}
