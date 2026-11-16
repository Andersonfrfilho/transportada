/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.6 (RF18, ADR-0116 §4): os filtros do resultado **não** mudam o rateio. Ele é feito sobre todas as viagens
 * e contas do período; o filtro só escolhe quais linhas aparecem e somam. Veículo e cliente restringem as viagens (e,
 * com o veículo, as contas ligadas a ele); categoria e motorista/agregado/ajudante restringem as contas.
 */

/** Viagem sem veículo (ou cliente sem cadastro) não some do resultado: vira uma linha com este identificador. */
export const NO_VEHICLE_ID = 'sem-veiculo'
export const NO_CUSTOMER_ID = 'sem-cliente'

export type ExpenseResultFilters = {
  readonly categoryId?: string
  /** Contratante, ou `sem-cliente`. */
  readonly customerId?: string
  /** Motorista, agregado ou ajudante favorecido da conta. */
  readonly payeeDriverId?: string
  /** Veículo, ou `sem-veiculo`. */
  readonly vehicleId?: string
}

export const EXPENSE_RESULT_FILTER_KEYS = [
  'categoryId',
  'customerId',
  'payeeDriverId',
  'vehicleId',
] as const

export function hasResultFilters(filters: ExpenseResultFilters | undefined): boolean {
  return (
    filters !== undefined && EXPENSE_RESULT_FILTER_KEYS.some((key) => filters[key] !== undefined)
  )
}

export function tripMatchesFilters(
  trip: { readonly customerId: string; readonly vehicleId: string },
  filters: ExpenseResultFilters,
): boolean {
  if (filters.vehicleId !== undefined && trip.vehicleId !== filters.vehicleId) return false
  if (filters.customerId !== undefined && trip.customerId !== filters.customerId) return false
  return true
}

export function expenseMatchesFilters(
  expense: {
    readonly categoryId: string
    readonly payeeDriverId: null | string | undefined
  },
  filters: ExpenseResultFilters,
): boolean {
  if (filters.categoryId !== undefined && expense.categoryId !== filters.categoryId) return false
  if (filters.payeeDriverId !== undefined && expense.payeeDriverId !== filters.payeeDriverId) {
    return false
  }
  return true
}
