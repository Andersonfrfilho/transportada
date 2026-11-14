/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { EXPENSE_ALLOCATABLE_GROUPS } from './expensesResult.types'
import {
  EXPENSE_ALLOCATION_CRITERIA,
  EXPENSE_UNALLOCATED_REASONS,
  type ExpenseAllocationCriterion,
  type ExpenseAllocationSettings,
  type ExpenseResult,
  type ExpenseResultFilters,
  type ExpenseResultLine,
  type ExpenseResultTripInfo,
  type ExpenseResultTripLine,
  type ExpenseResultPayment,
  type ExpenseUnallocatedItem,
  type ExpenseUnallocatedReason,
  type ExpenseUnitCostLine,
  type ExpenseUnitCosts,
} from './expensesResult.types'
import { ExpenseResponseError } from './expensesResponse.validation'

/** Resposta de API é entrada não confiável — e aqui ela vira o número que o dono usa para decidir. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ExpenseResponseError()
  return value
}

function readArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new ExpenseResponseError()
  return value as readonly unknown[]
}

/** Lista que a API pode omitir (`excesses`, `paymentsWithoutTrips`, `unallocatedItems`). */
function readOptionalArray(value: unknown): readonly unknown[] {
  return value === undefined ? [] : readArray(value)
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new ExpenseResponseError()
  return value
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return readString(value)
}

/** Dinheiro: texto decimal com sinal e até 4 casas (o lucro e a margem podem ser negativos). */
function readMoney(value: unknown): string {
  const text = readString(value)
  if (!/^-?\d+(\.\d{1,4})?$/.test(text)) throw new ExpenseResponseError()
  return text
}

function readOneOf<TValue extends string>(value: unknown, allowed: readonly TValue[]): TValue {
  const text = readString(value)
  const match = allowed.find((candidate) => candidate === text)
  if (match === undefined) throw new ExpenseResponseError()
  return match
}

function toLine(value: unknown): ExpenseResultLine {
  const row = readRecord(value)
  return {
    cost: readMoney(row.cost),
    generalShare: readMoney(row.generalShare),
    id: readString(row.id),
    margin: readMoney(row.margin),
    revenue: readMoney(row.revenue),
    vehicleShare: readMoney(row.vehicleShare),
  }
}

function toRoute(value: unknown): ExpenseResultTripInfo['route'] {
  if (value === null || value === undefined) return null
  const row = readRecord(value)
  return { destination: readString(row.destination), origin: readNullableString(row.origin) }
}

/** `trip` é aditivo: API anterior não o manda, e a linha segue valendo só pelos valores. */
function toTripLine(value: unknown): ExpenseResultTripLine {
  const line = toLine(value)
  const trip = readRecord(value).trip
  if (trip === undefined || trip === null) return line
  const row = readRecord(trip)
  if (typeof row.distanceMeters !== 'number' || !Number.isFinite(row.distanceMeters)) {
    throw new ExpenseResponseError()
  }
  return {
    ...line,
    trip: {
      customerId: readString(row.customerId),
      distanceMeters: row.distanceMeters,
      route: toRoute(row.route),
      vehicleId: readString(row.vehicleId),
    },
  }
}

function toPayment(value: unknown): ExpenseResultPayment {
  const row = readRecord(value)
  return {
    amount: readMoney(row.amount),
    occurrenceId: readString(row.occurrenceId),
    payeeDriverId: readNullableString(row.payeeDriverId),
  }
}

function toUnallocated(value: unknown): ExpenseUnallocatedItem {
  const row = readRecord(value)
  return {
    amount: readMoney(row.amount),
    name: readString(row.name),
    occurrenceId: readString(row.occurrenceId),
    reason: readOneOf<ExpenseUnallocatedReason>(row.reason, EXPENSE_UNALLOCATED_REASONS),
    vehicleId: readNullableString(row.vehicleId),
  }
}

function toSettingsRecord(value: unknown): ExpenseAllocationSettings {
  const row = readRecord(value)
  const read = (group: (typeof EXPENSE_ALLOCATABLE_GROUPS)[number]): ExpenseAllocationCriterion =>
    readOneOf<ExpenseAllocationCriterion>(row[group], EXPENSE_ALLOCATION_CRITERIA)
  return {
    administrative: read('administrative'),
    per_km: read('per_km'),
    vehicle_fixed: read('vehicle_fixed'),
  }
}

function toFilters(value: unknown): ExpenseResultFilters {
  if (value === undefined) return {}
  const row = readRecord(value)
  const filters: { -readonly [K in keyof ExpenseResultFilters]: ExpenseResultFilters[K] } = {}
  if (row.categoryId !== undefined) filters.categoryId = readString(row.categoryId)
  if (row.customerId !== undefined) filters.customerId = readString(row.customerId)
  if (row.payeeDriverId !== undefined) filters.payeeDriverId = readString(row.payeeDriverId)
  if (row.vehicleId !== undefined) filters.vehicleId = readString(row.vehicleId)
  return filters
}

function toCalculatedAt(body: Record<string, unknown>): string | null {
  return readNullableString(body.calculatedAt)
}

export function toExpenseResult(payload: unknown): ExpenseResult {
  const body = readRecord(payload)
  const data = readRecord(body.data)
  const totals = readRecord(data.totals)
  return {
    byCustomer: readArray(data.byCustomer).map(toLine),
    byTrip: readArray(data.byTrip).map(toTripLine),
    byVehicle: readArray(data.byVehicle).map(toLine),
    calculatedAt: toCalculatedAt(body),
    excesses: readOptionalArray(data.excesses).map(toPayment),
    filters: toFilters(data.filters),
    paymentsWithoutTrips: readOptionalArray(data.paymentsWithoutTrips).map(toPayment),
    settings: data.settings === undefined ? null : toSettingsRecord(data.settings),
    totals: {
      expensesTotal: readMoney(totals.expensesTotal),
      profit: readMoney(totals.profit),
      revenue: readMoney(totals.revenue),
      tripCost: readMoney(totals.tripCost),
    },
    unallocatedItems: readOptionalArray(data.unallocatedItems).map(toUnallocated),
    unallocatedTotal: readMoney(data.unallocatedTotal),
  }
}

function toUnitLine(value: unknown): ExpenseUnitCostLine {
  const row = readRecord(value)
  return {
    costPerKm: row.costPerKm === null ? null : readMoney(row.costPerKm),
    expensesShare: readMoney(row.expensesShare),
    kilometers: readMoney(row.kilometers),
    totalCost: readMoney(row.totalCost),
    tripCost: readMoney(row.tripCost),
    vehicleId: readNullableString(row.vehicleId),
  }
}

export function toExpenseUnitCosts(payload: unknown): ExpenseUnitCosts {
  const body = readRecord(payload)
  const data = readRecord(body.data)
  return {
    calculatedAt: toCalculatedAt(body),
    general: toUnitLine(data.general),
    perVehicle: readArray(data.perVehicle).map(toUnitLine),
  }
}

/** `data.thresholdPercent` é número (a API grava `numeric(6,2)` e devolve número JSON). */
export function toOutOfPatternThreshold(payload: unknown): number {
  const value = readRecord(readRecord(payload).data).thresholdPercent
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ExpenseResponseError()
  return value
}

export function toExpenseAllocationSettings(payload: unknown): ExpenseAllocationSettings {
  return toSettingsRecord(readRecord(payload).data)
}
