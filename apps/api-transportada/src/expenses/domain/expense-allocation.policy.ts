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
 *
 * A regra mora no SDK (`@adatechnology/expense-contracts`, vocabulário genérico: unidade e bem). Aqui fica o adaptador
 * fino: viagem → unidade e veículo → bem na entrada, e os nomes da transportada de volta na saída. O banco continua
 * gravando `per_km`, `per_trip_day`, `in_trip` e `vehicle_fixed`; a tradução é só desta borda.
 */
import {
  type AllocationCriterion as SdkCriterion,
  type AllocationExpense as SdkExpense,
  type AllocationSettings as SdkSettings,
  type AllocationUnit,
  allocateExpenses as sdkAllocateExpenses,
  type ExpenseCostGroup as SdkCostGroup,
  type UnallocatedReason as SdkReason,
} from '@adatechnology/expense-contracts'

import type { ExpenseTripRoute } from './expense-trip-route.policy.js'

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
  /** Primeira e última parada, só para a tela mostrar o trajeto (a T5.2 do painel); não entra no rateio. */
  readonly route?: ExpenseTripRoute | null
  readonly tripId: string
  readonly vehicleId: string
  /** Dono do veículo (`own`, `aggregate`, `third_party`); só informa a origem do custo, nunca entra no rateio. */
  readonly vehicleOwnership?: string | null
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

const COST_GROUP_TO_SDK: Readonly<Record<ExpenseCostGroup, SdkCostGroup>> = {
  administrative: 'administrative',
  in_trip: 'in_unit',
  per_km: 'per_distance',
  vehicle_fixed: 'asset_fixed',
}

const CRITERION_TO_SDK: Readonly<Record<AllocationCriterion, SdkCriterion>> = {
  equal: 'equal',
  per_km: 'per_distance',
  per_revenue: 'per_revenue',
  per_trip_day: 'per_unit_day',
}

const CRITERION_FROM_SDK: Readonly<Record<SdkCriterion, AllocationCriterion>> = {
  equal: 'equal',
  per_distance: 'per_km',
  per_revenue: 'per_revenue',
  per_unit_day: 'per_trip_day',
}

const REASON_FROM_SDK: Readonly<Record<SdkReason, UnallocatedReason>> = {
  asset_without_units: 'vehicle_without_trips',
  no_unit_weight: 'no_trip_weight',
}

export const ALLOCATION_TRANSLATION = {
  costGroupToSdk: COST_GROUP_TO_SDK,
  criterionFromSdk: CRITERION_FROM_SDK,
  criterionToSdk: CRITERION_TO_SDK,
  reasonFromSdk: REASON_FROM_SDK,
} as const

export function allocateExpenses(input: {
  readonly expenses: readonly AllocationExpense[]
  readonly settings: AllocationSettings
  readonly trips: readonly AllocationTrip[]
}): AllocationResult {
  const settings: SdkSettings = {
    administrative: CRITERION_TO_SDK[input.settings.administrative],
    asset_fixed: CRITERION_TO_SDK[input.settings.vehicle_fixed],
    per_distance: CRITERION_TO_SDK[input.settings.per_km],
  }
  const units: AllocationUnit[] = input.trips.map((trip) => ({
    assetId: trip.vehicleId,
    completedOn: trip.completedOn,
    daysCount: trip.daysCount,
    distanceMeters: trip.distanceMeters,
    revenue: trip.revenue,
    unitId: trip.tripId,
  }))
  const expenses: SdkExpense[] = input.expenses.map((expense) => ({
    amount: expense.amount,
    assetId: expense.vehicleId,
    costGroup: COST_GROUP_TO_SDK[expense.costGroup],
    expenseId: expense.expenseId,
    ...(expense.includedTripsAmount === undefined
      ? {}
      : { includedUnitsAmount: expense.includedTripsAmount }),
    occurrenceId: expense.occurrenceId,
  }))
  const result = sdkAllocateExpenses({ expenses, settings, units })
  return {
    excesses: result.excesses,
    shares: result.shares.map((share) => ({
      amount: share.amount,
      occurrenceId: share.occurrenceId,
      scope: share.scope === 'asset' ? 'vehicle' : 'general',
      tripId: share.unitId,
    })),
    unallocated: result.unallocated.map((item) => ({
      amount: item.amount,
      occurrenceId: item.occurrenceId,
      reason: REASON_FROM_SDK[item.reason],
      vehicleId: item.assetId,
    })),
  }
}
