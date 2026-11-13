/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  COMPANY_EXPENSE_KINDS,
  COMPANY_EXPENSE_OCCURRENCE_STATUSES,
  COMPANY_EXPENSE_RECURRENCES,
} from '../../database/company-expense.schema.js'
import { parseBody, invalidRequest, parseUuidFilter } from '../../http/request-parsing.service.js'
import type { CreateExpenseInput } from '../application/expense.use-case.js'
import type { ExpenseOccurrenceFilters } from '../application/expense.port.js'
import { validateExpenseTripPeriod, type ExpenseTripPeriod } from '../domain/expense-trip.policy.js'

const money = z.string().regex(/^\d+(\.\d{1,2})?$/)
const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const createExpenseSchema = z
  .object({
    categoryId: z.uuid(),
    dueDate: civilDate.optional(),
    dueDay: z.number().int().min(1).max(31).optional(),
    expectedAmount: money,
    kind: z.enum(COMPANY_EXPENSE_KINDS),
    name: z.string().trim().min(1).max(120),
    payeeDriverId: z.uuid().optional(),
    recurrence: z.enum(COMPANY_EXPENSE_RECURRENCES).optional(),
    vehicleId: z.uuid().optional(),
  })
  .strict()

const updateExpenseSchema = z
  .object({
    active: z.boolean().optional(),
    dueDay: z.number().int().min(1).max(31).optional(),
    expectedAmount: money.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    vehicleId: z.uuid().nullable().optional(),
  })
  .strict()

const settleSchema = z
  .object({
    paidAmount: z.string().min(1).max(20),
    paidAt: civilDate,
    settlementNote: z.string().trim().max(500).nullable().optional(),
  })
  .strict()

const includeTripSchema = z.object({ tripId: z.uuid() }).strict()

const cancelSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()
const createCategorySchema = z.object({ name: z.string().trim().min(1).max(80) }).strict()
const setCategoryActiveSchema = z.object({ active: z.boolean() }).strict()

export type CreateExpenseBody = Omit<CreateExpenseInput, 'companyId' | 'createdBy' | 'today'>

export function parseCreateExpenseRequest(request: Request): Promise<CreateExpenseBody> {
  return parseBody(createExpenseSchema, request).then((body) =>
    stripUndefined<CreateExpenseBody>(body),
  )
}

export function parseUpdateExpenseRequest(request: Request): Promise<{
  readonly active?: boolean
  readonly dueDay?: number
  readonly expectedAmount?: string
  readonly name?: string
  readonly vehicleId?: string | null
}> {
  return parseBody(updateExpenseSchema, request).then((body) =>
    stripUndefined<Awaited<ReturnType<typeof parseUpdateExpenseRequest>>>(body),
  )
}

export function parseSettleRequest(request: Request): Promise<{
  readonly paidAmount: string
  readonly paidAt: string
  readonly settlementNote: string | null
}> {
  return parseBody(settleSchema, request).then((body) => ({
    paidAmount: body.paidAmount,
    paidAt: body.paidAt,
    settlementNote:
      body.settlementNote === undefined || body.settlementNote === '' ? null : body.settlementNote,
  }))
}

export function parseCancelRequest(request: Request): Promise<{ readonly reason: string }> {
  return parseBody(cancelSchema, request)
}

export function parseCreateCategoryRequest(request: Request): Promise<{ readonly name: string }> {
  return parseBody(createCategorySchema, request)
}

export function parseSetCategoryActiveRequest(
  request: Request,
): Promise<{ readonly active: boolean }> {
  return parseBody(setCategoryActiveSchema, request)
}

const OCCURRENCE_QUERY_KEYS = new Set(['categoryId', 'competence', 'driverId', 'kind', 'status'])

/** `?competence=yyyy-mm&kind=&status=&categoryId=&driverId=`; chave desconhecida é 400. */
export function parseOccurrenceFilters(url: URL): ExpenseOccurrenceFilters {
  for (const key of url.searchParams.keys()) {
    if (!OCCURRENCE_QUERY_KEYS.has(key)) throw invalidRequest()
  }
  const competence = url.searchParams.get('competence')
  if (competence !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) throw invalidRequest()
  const kind = url.searchParams.get('kind')
  const status = url.searchParams.get('status')
  const kindOption = COMPANY_EXPENSE_KINDS.find((value) => value === kind)
  const statusOption = COMPANY_EXPENSE_OCCURRENCE_STATUSES.find((value) => value === status)
  if (kind !== null && kindOption === undefined) throw invalidRequest()
  if (status !== null && statusOption === undefined) throw invalidRequest()
  const categoryId = parseUuidFilter(url.searchParams.get('categoryId'))
  const driverId = parseUuidFilter(url.searchParams.get('driverId'))
  return {
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(competence === null ? {} : { competence }),
    ...(driverId === undefined ? {} : { driverId }),
    ...(kindOption === undefined ? {} : { kind: kindOption }),
    ...(statusOption === undefined ? {} : { status: statusOption }),
  }
}

/** `exactOptionalPropertyTypes`: o zod devolve `undefined` explícito; o caso de uso não o aceita. */
function stripUndefined<TResult>(value: object): TResult {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as TResult
}

export function parseIncludeTripRequest(request: Request): Promise<{ readonly tripId: string }> {
  return parseBody(includeTripSchema, request)
}

const AVAILABLE_TRIPS_QUERY_KEYS = new Set(['from', 'to'])

/**
 * `?from=yyyy-mm-dd&to=yyyy-mm-dd` (os dois ou nenhum; até 93 dias). Sem eles vale o período da ocorrência. Chave
 * desconhecida, data inválida ou intervalo invertido é 400.
 */
export function parseAvailableTripsQuery(url: URL): { readonly period?: ExpenseTripPeriod } {
  for (const key of url.searchParams.keys()) {
    if (!AVAILABLE_TRIPS_QUERY_KEYS.has(key)) throw invalidRequest()
  }
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (from === null && to === null) return {}
  if (from === null || to === null) throw invalidRequest()
  const period = validateExpenseTripPeriod({ from, to })
  if (period === null) throw invalidRequest()
  return { period }
}
