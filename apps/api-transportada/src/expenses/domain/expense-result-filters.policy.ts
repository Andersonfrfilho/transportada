/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.6 (RF18, ADR-0116 §4): os filtros do resultado **não** mudam o rateio. Ele é feito sobre todas as viagens
 * e contas do período; o filtro só escolhe quais linhas aparecem e somam. Veículo e cliente restringem as viagens (e,
 * com o veículo, as contas ligadas a ele); categoria e motorista/agregado/ajudante restringem as contas.
 *
 * A regra mora no SDK (`@adatechnology/expense-contracts`). Aqui fica o adaptador fino: viagem → unidade, veículo →
 * bem e favorecido → `payeeRef`; os nomes e os valores que a API e o painel já usam (`sem-veiculo`) não mudam.
 */
import {
  type ExpenseResultFilters as SdkResultFilters,
  expenseMatchesFilters as sdkExpenseMatchesFilters,
  unitMatchesFilters,
} from '@adatechnology/expense-contracts'

export { NO_CUSTOMER_ID } from '@adatechnology/expense-contracts'

/** Viagem sem veículo não some do resultado: vira uma linha com este identificador (valor gravado, não renomear). */
export const NO_VEHICLE_ID = 'sem-veiculo'

export type ExpenseResultFilters = {
  readonly categoryId?: string
  /** Contratante, ou `sem-cliente`. */
  readonly customerId?: string
  /** `'true'` tira do cálculo a fatura do cartão de crédito (o valor volta em `excluded.category`); sem ele ela conta. */
  readonly excludeCardInvoice?: 'true'
  /** `'true'` tira do cálculo as contas ligadas aos veículos da frota (o valor volta em `excluded.vehicles`). */
  readonly excludeVehicleExpenses?: 'true'
  /** Motorista, agregado ou ajudante favorecido da conta. */
  readonly payeeDriverId?: string
  /** Veículo, ou `sem-veiculo`. */
  readonly vehicleId?: string
}

export const EXPENSE_RESULT_FILTER_KEYS = [
  'categoryId',
  'customerId',
  'excludeVehicleExpenses',
  'excludeCardInvoice',
  'payeeDriverId',
  'vehicleId',
] as const

/** Os interruptores de custo não são filtro de linha: ligá-los não faz o resultado ecoar `filters`. */
const COST_SWITCH_KEYS: readonly string[] = ['excludeVehicleExpenses', 'excludeCardInvoice']

export function hasResultFilters(filters: ExpenseResultFilters | undefined): boolean {
  return (
    filters !== undefined &&
    EXPENSE_RESULT_FILTER_KEYS.some(
      (key) => !COST_SWITCH_KEYS.includes(key) && filters[key] !== undefined,
    )
  )
}

function toSdkFilters(filters: ExpenseResultFilters): SdkResultFilters {
  return {
    ...(filters.categoryId === undefined ? {} : { categoryId: filters.categoryId }),
    ...(filters.customerId === undefined ? {} : { customerId: filters.customerId }),
    ...(filters.payeeDriverId === undefined ? {} : { payeeRef: filters.payeeDriverId }),
    ...(filters.vehicleId === undefined ? {} : { assetId: filters.vehicleId }),
  }
}

export function tripMatchesFilters(
  trip: { readonly customerId: string; readonly vehicleId: string },
  filters: ExpenseResultFilters,
): boolean {
  return unitMatchesFilters(
    { assetId: trip.vehicleId, customerId: trip.customerId },
    toSdkFilters(filters),
  )
}

export function expenseMatchesFilters(
  expense: {
    readonly categoryId: string
    readonly payeeDriverId: null | string | undefined
  },
  filters: ExpenseResultFilters,
): boolean {
  return sdkExpenseMatchesFilters(
    { categoryId: expense.categoryId, payeeRef: expense.payeeDriverId },
    toSdkFilters(filters),
  )
}
