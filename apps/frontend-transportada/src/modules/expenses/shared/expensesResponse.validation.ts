/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  EXPENSE_DRIVER_PAYMENT_MODELS,
  EXPENSE_PAYEE_PROFILES,
  EXPENSE_KINDS,
  EXPENSE_OCCURRENCE_STATUSES,
  EXPENSE_RECURRENCES,
  EXPENSE_TRIP_PARCEL_KINDS,
  type AvailableExpenseTrips,
  type Expense,
  type ExpenseCategory,
  type ExpenseDriverPaymentModel,
  type ExpensePayeeProfile,
  type ExpenseKind,
  type ExpenseOccurrence,
  type ExpenseOccurrenceListItem,
  type ExpenseOccurrencePage,
  type ExpenseOccurrenceStatus,
  type ExpenseOccurrenceTrip,
  type ExpenseTripRoute,
  type ExpenseOccurrenceTrips,
  type ExpenseOccurrenceTotals,
  type ExpenseRecurrence,
  type ExpenseTripParcelKind,
  type PendingExpenseTrip,
} from './expenses.types'

/** Resposta de API é entrada não confiável — e aqui ela vira dinheiro pago pela empresa. */
export class ExpenseResponseError extends Error {
  public constructor() {
    super('EXPENSE_RESPONSE_INVALID')
    this.name = 'ExpenseResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ExpenseResponseError()
  return value
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new ExpenseResponseError()
  return value
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return readString(value)
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ExpenseResponseError()
  return value
}

function readInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ExpenseResponseError()
  return value
}

function readNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return readInteger(value)
}

function readArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new ExpenseResponseError()
  return value as readonly unknown[]
}

/** Vocabulário fechado se **confere**, nunca se afirma (o `as` deixa passar qualquer texto). */
function readOneOf<TValue extends string>(value: unknown, allowed: readonly TValue[]): TValue {
  const text = readString(value)
  const match = allowed.find((candidate) => candidate === text)
  if (match === undefined) throw new ExpenseResponseError()
  return match
}

function readNullableOneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
): TValue | null {
  if (value === null || value === undefined) return null
  return readOneOf(value, allowed)
}

/** Dinheiro: texto decimal; recusa o que não for número com no máximo 4 casas (a API manda 2 ou 4). */
function readMoney(value: unknown): string {
  const text = readString(value)
  if (!/^-?\d+(\.\d{1,4})?$/.test(text)) throw new ExpenseResponseError()
  return text
}

function readNullableMoney(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return readMoney(value)
}

function readSlot(value: unknown): 1 | 2 {
  if (value === 1 || value === 2) return value
  throw new ExpenseResponseError()
}

function readData(payload: unknown): unknown {
  return readRecord(payload).data
}

function toExpense(value: unknown): Expense {
  const row = readRecord(value)
  return {
    active: readBoolean(row.active),
    categoryId: readString(row.categoryId),
    dueDay: readNullableInteger(row.dueDay),
    expectedAmount: readMoney(row.expectedAmount),
    id: readString(row.id),
    kind: readOneOf<ExpenseKind>(row.kind, EXPENSE_KINDS),
    name: readString(row.name),
    payeeDriverId: readNullableString(row.payeeDriverId),
    recurrence: readNullableOneOf<ExpenseRecurrence>(row.recurrence, EXPENSE_RECURRENCES),
    vehicleId: readNullableString(row.vehicleId),
  }
}

function toCategory(value: unknown): ExpenseCategory {
  const row = readRecord(value)
  return {
    active: readBoolean(row.active),
    id: readString(row.id),
    name: readString(row.name),
    requiresDriver: readBoolean(row.requiresDriver),
  }
}

function toOccurrence(value: unknown): ExpenseOccurrence {
  const row = readRecord(value)
  return {
    competence: readString(row.competence),
    dueDate: readString(row.dueDate),
    expectedAmount: readMoney(row.expectedAmount),
    expenseId: readString(row.expenseId),
    id: readString(row.id),
    paidAmount: readNullableMoney(row.paidAmount),
    paidAt: readNullableString(row.paidAt),
    paidBy: readNullableString(row.paidBy),
    settlementNote: readNullableString(row.settlementNote),
    slot: readSlot(row.slot),
    status: readOneOf<ExpenseOccurrenceStatus>(row.status, EXPENSE_OCCURRENCE_STATUSES),
  }
}

function toListItem(value: unknown): ExpenseOccurrenceListItem {
  const row = readRecord(value)
  return {
    ...toOccurrence(row),
    categoryId: readString(row.categoryId),
    categoryName: readString(row.categoryName),
    expenseKind: readOneOf<ExpenseKind>(row.expenseKind, EXPENSE_KINDS),
    expenseName: readString(row.expenseName),
    payeeDriverId: readNullableString(row.payeeDriverId),
    payeeDriverName: readNullableString(row.payeeDriverName),
    payeeDriverPaymentModel: readNullableOneOf<ExpenseDriverPaymentModel>(
      row.payeeDriverPaymentModel,
      EXPENSE_DRIVER_PAYMENT_MODELS,
    ),
    ...(row.payeeProfile === undefined
      ? {}
      : {
          payeeProfile: readNullableOneOf<ExpensePayeeProfile>(
            row.payeeProfile,
            EXPENSE_PAYEE_PROFILES,
          ),
        }),
  }
}

function toTotals(value: unknown): ExpenseOccurrenceTotals {
  const row = readRecord(value)
  return {
    count: readInteger(row.count),
    expectedAmount: readMoney(row.expectedAmount),
    paidAmount: readMoney(row.paidAmount),
    paidByDriver: readArray(row.paidByDriver).map((entry) => {
      const driver = readRecord(entry)
      return {
        driverId: readString(driver.driverId),
        driverName: readNullableString(driver.driverName),
        paidAmount: readMoney(driver.paidAmount),
      }
    }),
  }
}

function toRoute(value: unknown): ExpenseTripRoute | null {
  if (value === null) return null
  const row = readRecord(value)
  return {
    destination: readString(row.destination),
    origin: readNullableString(row.origin),
  }
}

function readOptionalRoute(row: Record<string, unknown>): { route?: ExpenseTripRoute | null } {
  return row.route === undefined ? {} : { route: toRoute(row.route) }
}

function toTrip(value: unknown): ExpenseOccurrenceTrip {
  const row = readRecord(value)
  return {
    amount: readMoney(row.amount),
    completedOn: readString(row.completedOn),
    dailyAmount: readMoney(row.dailyAmount),
    days: readInteger(row.days),
    parcelKind: readOneOf<ExpenseTripParcelKind>(row.parcelKind, EXPENSE_TRIP_PARCEL_KINDS),
    ...readOptionalRoute(row),
    tripId: readString(row.tripId),
  }
}

function toPendingTrip(value: unknown): PendingExpenseTrip {
  const row = readRecord(value)
  return {
    completedOn: readString(row.completedOn),
    gap: readString(row.gap),
    parcelKind: readOneOf<ExpenseTripParcelKind>(row.parcelKind, EXPENSE_TRIP_PARCEL_KINDS),
    ...readOptionalRoute(row),
    tripId: readString(row.tripId),
  }
}

export function toExpenses(payload: unknown): readonly Expense[] {
  return readArray(readData(payload)).map(toExpense)
}

export function toExpenseResponse(payload: unknown): Expense {
  return toExpense(readData(payload))
}

export function toCategories(payload: unknown): readonly ExpenseCategory[] {
  return readArray(readData(payload)).map(toCategory)
}

export function toCategoryResponse(payload: unknown): ExpenseCategory {
  return toCategory(readData(payload))
}

export function toOccurrencePage(payload: unknown): ExpenseOccurrencePage {
  const body = readRecord(payload)
  return {
    items: readArray(body.data).map(toListItem),
    totals: toTotals(body.totals),
  }
}

export function toOccurrenceResponse(payload: unknown): ExpenseOccurrence {
  return toOccurrence(readData(payload))
}

export function toOccurrenceTrips(payload: unknown): ExpenseOccurrenceTrips {
  const row = readRecord(readData(payload))
  return {
    items: readArray(row.items).map(toTrip),
    occurrence: toOccurrence(row.occurrence),
    tripsTotal: readMoney(row.tripsTotal),
  }
}

export function toAvailableTrips(payload: unknown): AvailableExpenseTrips {
  const row = readRecord(readData(payload))
  const period = readRecord(row.period)
  return {
    available: readArray(row.available).map(toTrip),
    pending: readArray(row.pending).map(toPendingTrip),
    period: { from: readString(period.from), to: readString(period.to) },
  }
}
