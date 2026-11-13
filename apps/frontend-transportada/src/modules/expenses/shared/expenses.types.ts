/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do vocabulário da API (spec 325) — o bundle não carrega código de lá. */
export const EXPENSE_KINDS = ['fixed', 'variable'] as const
export type ExpenseKind = (typeof EXPENSE_KINDS)[number]

export const EXPENSE_RECURRENCES = [
  'monthly',
  'bimonthly',
  'quarterly',
  'yearly',
  'fortnightly',
] as const
export type ExpenseRecurrence = (typeof EXPENSE_RECURRENCES)[number]

export const EXPENSE_OCCURRENCE_STATUSES = ['open', 'paid', 'canceled'] as const
export type ExpenseOccurrenceStatus = (typeof EXPENSE_OCCURRENCE_STATUSES)[number]

export const EXPENSE_DRIVER_PAYMENT_MODELS = ['route_table', 'fixed'] as const
export type ExpenseDriverPaymentModel = (typeof EXPENSE_DRIVER_PAYMENT_MODELS)[number]

export const EXPENSE_TRIP_PARCEL_KINDS = ['driver', 'helper'] as const
export type ExpenseTripParcelKind = (typeof EXPENSE_TRIP_PARCEL_KINDS)[number]

export const EXPENSES_READ_PERMISSION = 'expenses.read'
export const EXPENSES_MANAGE_PERMISSION = 'expenses.manage'

export const EXPENSES_PATH = '/expenses'
export const EXPENSE_CATEGORIES_PATH = '/expense-categories'
export const EXPENSE_OCCURRENCES_PATH = '/expense-occurrences'

/** Dinheiro é **texto** do começo ao fim (`"1234.50"`): converter para número perderia centavo. */
export type Expense = Readonly<{
  active: boolean
  categoryId: string
  dueDay: number | null
  expectedAmount: string
  id: string
  kind: ExpenseKind
  name: string
  payeeDriverId: string | null
  recurrence: ExpenseRecurrence | null
  vehicleId: string | null
}>

export type ExpenseCategory = Readonly<{
  active: boolean
  id: string
  name: string
  requiresDriver: boolean
}>

export type ExpenseOccurrence = Readonly<{
  competence: string
  dueDate: string
  expectedAmount: string
  expenseId: string
  id: string
  paidAmount: string | null
  paidAt: string | null
  paidBy: string | null
  settlementNote: string | null
  slot: 1 | 2
  status: ExpenseOccurrenceStatus
}>

export const EXPENSE_PAYEE_PROFILES = ['aggregate', 'driver', 'helper'] as const
export type ExpensePayeeProfile = (typeof EXPENSE_PAYEE_PROFILES)[number]

export type ExpenseOccurrenceListItem = ExpenseOccurrence &
  Readonly<{
    categoryId: string
    categoryName: string
    expenseKind: ExpenseKind
    expenseName: string
    payeeDriverId: string | null
    payeeDriverName: string | null
    payeeDriverPaymentModel: ExpenseDriverPaymentModel | null
    /** Perfil do favorecido (T1.4c); ausente em API anterior à T1.4c. */
    payeeProfile?: ExpensePayeeProfile | null
  }>

export type ExpenseOccurrenceTotals = Readonly<{
  count: number
  expectedAmount: string
  paidAmount: string
  paidByDriver: readonly Readonly<{
    driverId: string
    driverName: string | null
    paidAmount: string
  }>[]
}>

export type ExpenseOccurrencePage = Readonly<{
  items: readonly ExpenseOccurrenceListItem[]
  totals: ExpenseOccurrenceTotals
}>

export type ExpenseOccurrenceFilters = Readonly<{
  categoryId?: string
  competence?: string
  driverId?: string
  kind?: ExpenseKind
  status?: ExpenseOccurrenceStatus
}>

export type CreateExpenseInput = Readonly<{
  categoryId: string
  dueDate?: string
  dueDay?: number
  expectedAmount: string
  kind: ExpenseKind
  name: string
  payeeDriverId?: string
  recurrence?: ExpenseRecurrence
  vehicleId?: string
}>

export type UpdateExpenseInput = Readonly<{
  active?: boolean
  dueDay?: number
  expectedAmount?: string
  name?: string
  vehicleId?: string | null
}>

export type SettleOccurrenceInput = Readonly<{
  id: string
  paidAmount: string
  paidAt: string
  settlementNote?: string | null
}>

/** RF1d: a linha da pessoa na parcela da viagem, copiada na inclusão (`diária × dias`). */
export type ExpenseOccurrenceTrip = Readonly<{
  amount: string
  completedOn: string
  dailyAmount: string
  days: number
  parcelKind: ExpenseTripParcelKind
  tripId: string
}>

export type ExpenseOccurrenceTrips = Readonly<{
  items: readonly ExpenseOccurrenceTrip[]
  occurrence: ExpenseOccurrence
  tripsTotal: string
}>

export type PendingExpenseTrip = Readonly<{
  completedOn: string
  gap: string
  parcelKind: ExpenseTripParcelKind
  tripId: string
}>

export type AvailableExpenseTrips = Readonly<{
  available: readonly ExpenseOccurrenceTrip[]
  pending: readonly PendingExpenseTrip[]
  period: Readonly<{ from: string; to: string }>
}>
