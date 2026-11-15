/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  EXPENSE_CATEGORIES_PATH,
  EXPENSE_OCCURRENCES_PATH,
  EXPENSES_PATH,
  type AvailableExpenseTrips,
  type CreateExpenseInput,
  type Expense,
  type ExpenseCategory,
  type ExpenseCostGroup,
  type ExpenseOccurrence,
  type ExpenseOccurrenceFilters,
  type ExpenseOccurrencePage,
  type ExpenseOccurrenceTrips,
  type SettleOccurrenceInput,
  type UpdateExpenseInput,
} from './expenses.types'
import {
  EXPENSE_ALLOCATION_SETTINGS_PATH,
  EXPENSE_FORECAST_PATH,
  EXPENSE_OUT_OF_PATTERN_SETTINGS_PATH,
  EXPENSE_RESULT_EXPORT_PATH,
  EXPENSE_RESULT_PATH,
  EXPENSE_UNIT_COSTS_PATH,
  type ExpenseAllocationSettings,
  type ExpenseExportFile,
  type ExpenseExportFormat,
  type ExpenseForecast,
  type ExpenseResult,
  type ExpenseResultQuery,
  type ExpenseUnitCosts,
} from './expensesResult.types'
import {
  toExpenseAllocationSettings,
  toExpenseForecast,
  toExpenseResult,
  toExpenseUnitCosts,
  toOutOfPatternThreshold,
} from './expensesResult.validation'
import {
  toAvailableTrips,
  toCategories,
  toCategoryResponse,
  toExpenseResponse,
  toExpenses,
  toOccurrencePage,
  toOccurrenceResponse,
  toOccurrenceTrips,
} from './expensesResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ExpensesClient = Readonly<{
  availableTrips: (
    input: Readonly<{ from?: string; occurrenceId: string; to?: string }>,
  ) => Promise<AvailableExpenseTrips>
  cancelOccurrence: (input: Readonly<{ id: string; reason: string }>) => Promise<ExpenseOccurrence>
  createCategory: (name: string) => Promise<ExpenseCategory>
  createExpense: (input: CreateExpenseInput) => Promise<Expense>
  exportResult: (
    input: ExpenseResultQuery & Readonly<{ format: ExpenseExportFormat }>,
  ) => Promise<ExpenseExportFile>
  getAllocationSettings: () => Promise<ExpenseAllocationSettings>
  getForecast: (month: string) => Promise<ExpenseForecast>
  getOutOfPatternThreshold: () => Promise<number>
  getResult: (input: ExpenseResultQuery) => Promise<ExpenseResult>
  getUnitCosts: (input: ExpenseResultQuery) => Promise<ExpenseUnitCosts>
  includeTrip: (
    input: Readonly<{ occurrenceId: string; tripId: string }>,
  ) => Promise<ExpenseOccurrenceTrips>
  listCategories: () => Promise<readonly ExpenseCategory[]>
  listExpenses: () => Promise<readonly Expense[]>
  listOccurrences: (filters: ExpenseOccurrenceFilters) => Promise<ExpenseOccurrencePage>
  listTrips: (occurrenceId: string) => Promise<ExpenseOccurrenceTrips>
  removeTrip: (
    input: Readonly<{ occurrenceId: string; tripId: string }>,
  ) => Promise<ExpenseOccurrenceTrips>
  setCategoryActive: (input: Readonly<{ active: boolean; id: string }>) => Promise<ExpenseCategory>
  setCategoryCostGroup: (
    input: Readonly<{ costGroup: ExpenseCostGroup; id: string }>,
  ) => Promise<ExpenseCategory>
  settleOccurrence: (input: SettleOccurrenceInput) => Promise<ExpenseOccurrence>
  updateAllocationSettings: (
    settings: Partial<ExpenseAllocationSettings>,
  ) => Promise<ExpenseAllocationSettings>
  updateExpense: (input: Readonly<{ changes: UpdateExpenseInput; id: string }>) => Promise<Expense>
  updateOutOfPatternThreshold: (thresholdPercent: number) => Promise<number>
}>

export function createExpensesClient(dependencies: ClientDependencies): ExpensesClient {
  return {
    async availableTrips({ from, occurrenceId, to }) {
      const search = new URLSearchParams()
      if (from !== undefined) search.set('from', from)
      if (to !== undefined) search.set('to', to)
      const query = search.size === 0 ? '' : `?${search.toString()}`
      return toAvailableTrips(
        await request({
          dependencies,
          method: 'GET',
          path: `${EXPENSE_OCCURRENCES_PATH}/${occurrenceId}/available-trips${query}`,
        }),
      )
    },
    async cancelOccurrence({ id, reason }) {
      return toOccurrenceResponse(
        await request({
          body: JSON.stringify({ reason }),
          dependencies,
          method: 'POST',
          path: `${EXPENSE_OCCURRENCES_PATH}/${id}/cancellation`,
        }),
      )
    },
    async createCategory(name) {
      return toCategoryResponse(
        await request({
          body: JSON.stringify({ name }),
          dependencies,
          method: 'POST',
          path: EXPENSE_CATEGORIES_PATH,
        }),
      )
    },
    async createExpense(input) {
      return toExpenseResponse(
        await request({
          body: JSON.stringify(input),
          dependencies,
          method: 'POST',
          path: EXPENSES_PATH,
        }),
      )
    },
    async exportResult({ format, ...query }) {
      const response = await send({
        dependencies,
        method: 'GET',
        path: `${EXPENSE_RESULT_EXPORT_PATH}?${serializeResultQuery(query, { format })}`,
      })
      if (!response.ok) throw new Error(readErrorCode(await readJson(response)))
      return {
        blob: await response.blob(),
        fileName: readFileName(response.headers.get('content-disposition'), format),
      }
    },
    async getAllocationSettings() {
      return toExpenseAllocationSettings(
        await request({ dependencies, method: 'GET', path: EXPENSE_ALLOCATION_SETTINGS_PATH }),
      )
    },
    async getForecast(month) {
      return toExpenseForecast(
        await request({
          dependencies,
          method: 'GET',
          path: `${EXPENSE_FORECAST_PATH}?${new URLSearchParams({ month }).toString()}`,
        }),
      )
    },
    async getOutOfPatternThreshold() {
      return toOutOfPatternThreshold(
        await request({ dependencies, method: 'GET', path: EXPENSE_OUT_OF_PATTERN_SETTINGS_PATH }),
      )
    },
    async getResult(query) {
      return toExpenseResult(
        await request({
          dependencies,
          method: 'GET',
          path: `${EXPENSE_RESULT_PATH}?${serializeResultQuery(query)}`,
        }),
      )
    },
    async getUnitCosts({ from, to }) {
      return toExpenseUnitCosts(
        await request({
          dependencies,
          method: 'GET',
          path: `${EXPENSE_UNIT_COSTS_PATH}?${serializeResultQuery({ from, to })}`,
        }),
      )
    },
    async includeTrip({ occurrenceId, tripId }) {
      return toOccurrenceTrips(
        await request({
          body: JSON.stringify({ tripId }),
          dependencies,
          method: 'POST',
          path: `${EXPENSE_OCCURRENCES_PATH}/${occurrenceId}/trips`,
        }),
      )
    },
    async listCategories() {
      return toCategories(
        await request({ dependencies, method: 'GET', path: EXPENSE_CATEGORIES_PATH }),
      )
    },
    async listExpenses() {
      return toExpenses(await request({ dependencies, method: 'GET', path: EXPENSES_PATH }))
    },
    async listOccurrences(filters) {
      const query = serializeFilters(filters)
      return toOccurrencePage(
        await request({
          dependencies,
          method: 'GET',
          path: `${EXPENSE_OCCURRENCES_PATH}${query === '' ? '' : `?${query}`}`,
        }),
      )
    },
    async listTrips(occurrenceId) {
      return toOccurrenceTrips(
        await request({
          dependencies,
          method: 'GET',
          path: `${EXPENSE_OCCURRENCES_PATH}/${occurrenceId}/trips`,
        }),
      )
    },
    async removeTrip({ occurrenceId, tripId }) {
      return toOccurrenceTrips(
        await request({
          dependencies,
          method: 'DELETE',
          path: `${EXPENSE_OCCURRENCES_PATH}/${occurrenceId}/trips/${tripId}`,
        }),
      )
    },
    async setCategoryActive({ active, id }) {
      return toCategoryResponse(
        await request({
          body: JSON.stringify({ active }),
          dependencies,
          method: 'PATCH',
          path: `${EXPENSE_CATEGORIES_PATH}/${id}`,
        }),
      )
    },
    async setCategoryCostGroup({ costGroup, id }) {
      return toCategoryResponse(
        await request({
          body: JSON.stringify({ costGroup }),
          dependencies,
          method: 'PUT',
          path: `${EXPENSE_CATEGORIES_PATH}/${id}/cost-group`,
        }),
      )
    },
    async settleOccurrence({ id, ...body }) {
      return toOccurrenceResponse(
        await request({
          body: JSON.stringify(body),
          dependencies,
          method: 'POST',
          path: `${EXPENSE_OCCURRENCES_PATH}/${id}/settlement`,
        }),
      )
    },
    async updateAllocationSettings(settings) {
      return toExpenseAllocationSettings(
        await request({
          body: JSON.stringify({ settings }),
          dependencies,
          method: 'PUT',
          path: EXPENSE_ALLOCATION_SETTINGS_PATH,
        }),
      )
    },
    async updateOutOfPatternThreshold(thresholdPercent) {
      return toOutOfPatternThreshold(
        await request({
          body: JSON.stringify({ thresholdPercent }),
          dependencies,
          method: 'PUT',
          path: EXPENSE_OUT_OF_PATTERN_SETTINGS_PATH,
        }),
      )
    },
    async updateExpense({ changes, id }) {
      return toExpenseResponse(
        await request({
          body: JSON.stringify(changes),
          dependencies,
          method: 'PATCH',
          path: `${EXPENSES_PATH}/${id}`,
        }),
      )
    },
  }
}

/** A API recusa chave desconhecida (400): só vão as que têm valor. */
export function serializeFilters(filters: ExpenseOccurrenceFilters): string {
  const search = new URLSearchParams()
  if (filters.categoryId !== undefined) search.set('categoryId', filters.categoryId)
  if (filters.competence !== undefined) search.set('competence', filters.competence)
  if (filters.driverId !== undefined) search.set('driverId', filters.driverId)
  if (filters.kind !== undefined) search.set('kind', filters.kind)
  if (filters.status !== undefined) search.set('status', filters.status)
  return search.toString()
}

/** Período obrigatório; só vão os filtros preenchidos (a API recusa chave desconhecida e id mal formado). */
export function serializeResultQuery(
  query: ExpenseResultQuery,
  extra: Readonly<Record<string, string>> = {},
): string {
  const search = new URLSearchParams({ from: query.from, to: query.to })
  for (const [key, value] of Object.entries(query.filters ?? {})) {
    if (typeof value === 'string' && value !== '') search.set(key, value)
  }
  for (const [key, value] of Object.entries(extra)) search.set(key, value)
  return search.toString()
}

function readFileName(header: string | null, format: ExpenseExportFormat): string {
  const match = header === null ? null : /filename="([^"]+)"/.exec(header)
  return match?.[1] ?? `resultado-contas.${format}`
}

export function getExpensesClient(): ExpensesClient {
  return createExpensesClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

async function send(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
    path: string
  }>,
): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: input.body }),
        cache: 'no-store',
        headers,
        method: input.method,
      }),
    )
  } catch {
    throw new Error('REQUEST_FAILED')
  }
}

async function readJson(response: Response): Promise<unknown> {
  const rawBody = await response.text()
  try {
    return rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new Error('RESPONSE_INVALID')
  }
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
    path: string
  }>,
): Promise<unknown> {
  const response = await send(input)
  const payload = await readJson(response)
  /** O código sobe como veio: `EXPENSE_TRIP_ALREADY_INCLUDED` vira frase na tela. */
  if (!response.ok) throw new Error(readErrorCode(payload))

  return payload
}

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'REQUEST_FAILED'
  const error = (payload as { readonly error?: { readonly code?: unknown } }).error
  return typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED'
}
