/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2 (esqueleto; a T4.4 implementa): o rateio das contas entre as viagens, função pura e sem banco
 * (ADR-0116). Dinheiro entra e sai em texto com duas casas; a conta fecha em centavos (piso + resto à viagem de maior
 * peso, ordem estável por conclusão e `id`).
 */
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
  void input
  throw new Error('not implemented (spec 325 T4.4)')
}
