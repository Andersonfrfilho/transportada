/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { ExpenseTripRoute } from './expenses.types'

/** ⚠️ Cópia por valor do vocabulário da API (spec 325, T4.5/T4.6) — o bundle não carrega código de lá. */
export const EXPENSE_ALLOCATABLE_GROUPS = ['vehicle_fixed', 'per_km', 'administrative'] as const
export type ExpenseAllocatableGroup = (typeof EXPENSE_ALLOCATABLE_GROUPS)[number]

export const EXPENSE_ALLOCATION_CRITERIA = [
  'per_km',
  'per_trip_day',
  'per_revenue',
  'equal',
] as const
export type ExpenseAllocationCriterion = (typeof EXPENSE_ALLOCATION_CRITERIA)[number]

export const EXPENSE_UNALLOCATED_REASONS = ['no_trip_weight', 'vehicle_without_trips'] as const
export type ExpenseUnallocatedReason = (typeof EXPENSE_UNALLOCATED_REASONS)[number]

export const EXPENSE_EXPORT_FORMATS = ['csv', 'pdf'] as const
export type ExpenseExportFormat = (typeof EXPENSE_EXPORT_FORMATS)[number]

/** Identificadores que a API usa para a viagem sem veículo e para o cliente sem cadastro. */
export const EXPENSE_NO_VEHICLE_ID = 'sem-veiculo'
export const EXPENSE_NO_CUSTOMER_ID = 'sem-cliente'

export const EXPENSE_RESULT_PATH = '/expense-result'
export const EXPENSE_RESULT_EXPORT_PATH = '/expense-result/export'
export const EXPENSE_UNIT_COSTS_PATH = '/expense-unit-costs'
export const EXPENSE_ALLOCATION_SETTINGS_PATH = '/expense-allocation-settings'
export const EXPENSE_OUT_OF_PATTERN_SETTINGS_PATH = '/expense-out-of-pattern-settings'

/** Limite do "fora do padrão" (T6.3): pontos percentuais, de 0 a 1000, até duas casas. */
export const EXPENSE_OUT_OF_PATTERN_RANGE = { max: 1000, min: 0 } as const

/** Dinheiro é **texto** (`"1234.50"`): converter para número perderia centavo. */
export type ExpenseResultPeriod = Readonly<{ from: string; to: string }>

export type ExpenseResultFilters = Readonly<{
  categoryId?: string
  customerId?: string
  payeeDriverId?: string
  vehicleId?: string
}>

export type ExpenseResultQuery = ExpenseResultPeriod & Readonly<{ filters?: ExpenseResultFilters }>

export type ExpenseResultLine = Readonly<{
  cost: string
  generalShare: string
  id: string
  margin: string
  revenue: string
  vehicleShare: string
}>

/** Aditivo na API (T5.2 do painel): ausente em API anterior, e a tela cai no id. */
export type ExpenseResultTripInfo = Readonly<{
  customerId: string
  distanceMeters: number
  route: ExpenseTripRoute | null
  vehicleId: string
}>

export type ExpenseResultTripLine = ExpenseResultLine & Readonly<{ trip?: ExpenseResultTripInfo }>

export type ExpenseResultPayment = Readonly<{
  amount: string
  occurrenceId: string
  payeeDriverId: string | null
}>

export type ExpenseUnallocatedItem = Readonly<{
  amount: string
  name: string
  occurrenceId: string
  reason: ExpenseUnallocatedReason
  vehicleId: string | null
}>

export type ExpenseAllocationSettings = Readonly<
  Record<ExpenseAllocatableGroup, ExpenseAllocationCriterion>
>

export type ExpenseResult = Readonly<{
  byCustomer: readonly ExpenseResultLine[]
  byTrip: readonly ExpenseResultTripLine[]
  byVehicle: readonly ExpenseResultLine[]
  calculatedAt: string | null
  excesses: readonly ExpenseResultPayment[]
  filters: ExpenseResultFilters
  paymentsWithoutTrips: readonly ExpenseResultPayment[]
  settings: ExpenseAllocationSettings | null
  totals: Readonly<{ expensesTotal: string; profit: string; revenue: string; tripCost: string }>
  unallocatedItems: readonly ExpenseUnallocatedItem[]
  unallocatedTotal: string
}>

export type ExpenseUnitCostLine = Readonly<{
  /** Reais por quilômetro com quatro casas; `null` sem quilômetro. */
  costPerKm: string | null
  expensesShare: string
  kilometers: string
  totalCost: string
  tripCost: string
  vehicleId: string | null
}>

export type ExpenseUnitCosts = Readonly<{
  calculatedAt: string | null
  general: ExpenseUnitCostLine
  perVehicle: readonly ExpenseUnitCostLine[]
}>

export type ExpenseExportFile = Readonly<{ blob: Blob; fileName: string }>
