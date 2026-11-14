/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4: leitura exige `expenses.read`, escrita exige `expenses.manage` (uma não implica a outra — T1.3).
 * `companyId` e o autor vêm só do contexto autenticado; conta ou ocorrência de outra empresa é 404.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import {
  API_EXPENSE_CATEGORIES_PATH,
  API_EXPENSE_OCCURRENCES_PATH,
  API_EXPENSES_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { formatFiscalDay } from '../../shared/fiscal-day.service.js'
import type {
  CompanyExpense,
  CompanyExpenseCategory,
  CompanyExpenseOccurrence,
  ExpenseOccurrenceFilters,
  ExpenseOccurrenceListItem,
} from '../application/expense.port.js'
import type {
  CancelExpenseOccurrenceInput,
  ListExpenseOccurrencesResult,
  SettleExpenseOccurrenceInput,
} from '../application/expense-occurrence.use-case.js'
import type { CreateExpenseInput, UpdateExpenseInput } from '../application/expense.use-case.js'
import type {
  AvailableExpenseTripsResult,
  ExpenseOccurrenceTripsResult,
  IncludeExpenseOccurrenceTripInput,
  RemoveExpenseOccurrenceTripInput,
} from '../application/expense-occurrence-trip.use-case.js'
import type { ExpenseTripPeriod } from '../domain/expense-trip.policy.js'
import {
  parseAvailableTripsQuery,
  parseCancelRequest,
  parseIncludeTripRequest,
  type CreateExpenseBody,
  parseCreateCategoryRequest,
  parseCreateExpenseRequest,
  parseOccurrenceFilters,
  parseSetCategoryActiveRequest,
  parseSetCategoryCostGroupRequest,
  parseSettleRequest,
  parseUpdateExpenseRequest,
} from './expense.schema.js'

const READ_POLICY = { permission: 'expenses.read', scope: 'company' } as const
const MANAGE_POLICY = { permission: 'expenses.manage', scope: 'company' } as const
const EXPENSE_PATH = `${API_EXPENSES_PATH}/:id`
const CATEGORY_PATH = `${API_EXPENSE_CATEGORIES_PATH}/:id`
const CATEGORY_COST_GROUP_PATH = `${API_EXPENSE_CATEGORIES_PATH}/:id/cost-group`
const SETTLEMENT_PATH = `${API_EXPENSE_OCCURRENCES_PATH}/:id/settlement`
const CANCELLATION_PATH = `${API_EXPENSE_OCCURRENCES_PATH}/:id/cancellation`
const OCCURRENCE_TRIPS_PATH = `${API_EXPENSE_OCCURRENCES_PATH}/:id/trips`
const OCCURRENCE_TRIP_PATH = `${API_EXPENSE_OCCURRENCES_PATH}/:id/trips/:tripId`
const AVAILABLE_TRIPS_PATH = `${API_EXPENSE_OCCURRENCES_PATH}/:id/available-trips`
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = {
  readonly cancelOccurrence: {
    execute(input: CancelExpenseOccurrenceInput): Promise<CompanyExpenseOccurrence>
  }
  readonly createCategory: {
    execute(input: {
      readonly companyId: string
      readonly correlationId: string
      readonly createdBy: string
      readonly name: string
    }): Promise<CompanyExpenseCategory>
  }
  readonly createExpense: { execute(input: CreateExpenseInput): Promise<CompanyExpense> }
  /** T1.4b: viagens do pagamento de motorista/agregado. */
  readonly includeOccurrenceTrip: {
    execute(input: IncludeExpenseOccurrenceTripInput): Promise<ExpenseOccurrenceTripsResult>
  }
  readonly listAvailableTrips: {
    execute(input: {
      readonly companyId: string
      readonly occurrenceId: string
      readonly period?: ExpenseTripPeriod
    }): Promise<AvailableExpenseTripsResult>
  }
  readonly listOccurrenceTrips: {
    execute(input: {
      readonly companyId: string
      readonly occurrenceId: string
    }): Promise<ExpenseOccurrenceTripsResult>
  }
  readonly removeOccurrenceTrip: {
    execute(input: RemoveExpenseOccurrenceTripInput): Promise<ExpenseOccurrenceTripsResult>
  }
  readonly listCategories: {
    execute(input: { readonly companyId: string }): Promise<readonly CompanyExpenseCategory[]>
  }
  readonly listExpenses: {
    execute(input: { readonly companyId: string }): Promise<readonly CompanyExpense[]>
  }
  readonly listOccurrences: {
    execute(input: {
      readonly companyId: string
      readonly filters: ExpenseOccurrenceFilters
    }): Promise<ListExpenseOccurrencesResult>
  }
  readonly now: () => Date
  readonly setCategoryActive: {
    execute(input: {
      readonly active: boolean
      readonly categoryId: string
      readonly companyId: string
      readonly correlationId: string
      readonly updatedBy: string
    }): Promise<CompanyExpenseCategory>
  }
  readonly setCategoryCostGroup: {
    execute(input: {
      readonly categoryId: string
      readonly companyId: string
      readonly correlationId: string
      readonly costGroup: 'administrative' | 'in_trip' | 'per_km' | 'vehicle_fixed'
      readonly updatedBy: string
    }): Promise<CompanyExpenseCategory>
  }
  readonly settleOccurrence: {
    execute(input: SettleExpenseOccurrenceInput): Promise<CompanyExpenseOccurrence>
  }
  readonly updateExpense: { execute(input: UpdateExpenseInput): Promise<CompanyExpense> }
}

type WithCorrelation<T> = T & { readonly correlationId: string }
type WithId<T> = T & { readonly id: string }

export function createExpenseRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const expenses = await dependencies.listExpenses.execute({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: expenses.map(serializeExpense) })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_EXPENSES_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<WithCorrelation<CreateExpenseBody>>({
      async handle({ context, input }): Promise<Response> {
        const { correlationId, ...body } = input
        const created = await dependencies.createExpense.execute({
          ...body,
          companyId: context.scope.companyId,
          correlationId,
          createdBy: context.scope.userId,
          today: formatFiscalDay(dependencies.now()),
        })
        return jsonResponse({ data: serializeExpense(created) }, 201)
      },
      method: 'POST',
      parse: async ({ correlationId, request }) => ({
        ...(await parseCreateExpenseRequest(request)),
        correlationId,
      }),
      pathname: API_EXPENSES_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<
      WithId<WithCorrelation<Omit<UpdateExpenseInput, 'companyId' | 'expenseId' | 'updatedBy'>>>
    >({
      async handle({ context, input }): Promise<Response> {
        const { id, ...changes } = input
        const updated = await dependencies.updateExpense.execute({
          ...changes,
          companyId: context.scope.companyId,
          expenseId: id,
          updatedBy: context.scope.userId,
        })
        return jsonResponse({ data: serializeExpense(updated) })
      },
      method: 'PATCH',
      parse: async ({ correlationId, pathParameters, request }) => ({
        ...(await parseUpdateExpenseRequest(request)),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: EXPENSE_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<ExpenseOccurrenceFilters>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.listOccurrences.execute({
          companyId: context.scope.companyId,
          filters: input,
        })
        return jsonResponse({
          data: result.items.map(serializeOccurrence),
          totals: result.totals,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseOccurrenceFilters(new URL(request.url)),
      pathname: API_EXPENSE_OCCURRENCES_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<
      WithId<
        WithCorrelation<{
          readonly paidAmount: string
          readonly paidAt: string
          readonly settlementNote: string | null
        }>
      >
    >({
      async handle({ context, input }): Promise<Response> {
        const { id, ...body } = input
        const paid = await dependencies.settleOccurrence.execute({
          ...body,
          companyId: context.scope.companyId,
          occurrenceId: id,
          settledBy: context.scope.userId,
        })
        return jsonResponse({ data: serializeBareOccurrence(paid) })
      },
      method: 'POST',
      parse: async ({ correlationId, pathParameters, request }) => ({
        ...(await parseSettleRequest(request)),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: SETTLEMENT_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<WithId<WithCorrelation<{ readonly reason: string }>>>({
      async handle({ context, input }): Promise<Response> {
        const canceled = await dependencies.cancelOccurrence.execute({
          canceledBy: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          occurrenceId: input.id,
          reason: input.reason,
        })
        return jsonResponse({ data: serializeBareOccurrence(canceled) })
      },
      method: 'POST',
      parse: async ({ correlationId, pathParameters, request }) => ({
        ...(await parseCancelRequest(request)),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: CANCELLATION_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.listOccurrenceTrips.execute({
          companyId: context.scope.companyId,
          occurrenceId: input.id,
        })
        return jsonResponse({ data: serializeOccurrenceTrips(result) })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ id: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: OCCURRENCE_TRIPS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{ readonly id: string; readonly period?: ExpenseTripPeriod }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.listAvailableTrips.execute({
          companyId: context.scope.companyId,
          occurrenceId: input.id,
          ...(input.period === undefined ? {} : { period: input.period }),
        })
        return jsonResponse({ data: result })
      },
      method: 'GET',
      parse: ({ pathParameters, request }) => ({
        ...parseAvailableTripsQuery(new URL(request.url)),
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: AVAILABLE_TRIPS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<WithId<WithCorrelation<{ readonly tripId: string }>>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.includeOccurrenceTrip.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          includedBy: context.scope.userId,
          occurrenceId: input.id,
          tripId: input.tripId,
        })
        return jsonResponse({ data: serializeOccurrenceTrips(result) }, 201)
      },
      method: 'POST',
      parse: async ({ correlationId, pathParameters, request }) => ({
        ...(await parseIncludeTripRequest(request)),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: OCCURRENCE_TRIPS_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<WithId<WithCorrelation<{ readonly tripId: string }>>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.removeOccurrenceTrip.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          occurrenceId: input.id,
          removedBy: context.scope.userId,
          tripId: input.tripId,
        })
        return jsonResponse({ data: serializeOccurrenceTrips(result) })
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.tripId ?? ''),
      }),
      pathname: OCCURRENCE_TRIP_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const categories = await dependencies.listCategories.execute({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: categories.map(serializeCategory) })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_EXPENSE_CATEGORIES_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<WithCorrelation<{ readonly name: string }>>({
      async handle({ context, input }): Promise<Response> {
        const created = await dependencies.createCategory.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          createdBy: context.scope.userId,
          name: input.name,
        })
        return jsonResponse({ data: serializeCategory(created) }, 201)
      },
      method: 'POST',
      parse: async ({ correlationId, request }) => ({
        ...(await parseCreateCategoryRequest(request)),
        correlationId,
      }),
      pathname: API_EXPENSE_CATEGORIES_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<WithId<WithCorrelation<{ readonly active: boolean }>>>({
      async handle({ context, input }): Promise<Response> {
        const updated = await dependencies.setCategoryActive.execute({
          active: input.active,
          categoryId: input.id,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          updatedBy: context.scope.userId,
        })
        return jsonResponse({ data: serializeCategory(updated) })
      },
      method: 'PATCH',
      parse: async ({ correlationId, pathParameters, request }) => ({
        ...(await parseSetCategoryActiveRequest(request)),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: CATEGORY_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<
      WithId<
        WithCorrelation<{
          readonly costGroup: 'administrative' | 'in_trip' | 'per_km' | 'vehicle_fixed'
        }>
      >
    >({
      async handle({ context, input }): Promise<Response> {
        const updated = await dependencies.setCategoryCostGroup.execute({
          categoryId: input.id,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          costGroup: input.costGroup,
          updatedBy: context.scope.userId,
        })
        return jsonResponse({ data: serializeCategory(updated) })
      },
      method: 'PUT',
      parse: async ({ correlationId, pathParameters, request }) => ({
        ...(await parseSetCategoryCostGroupRequest(request)),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: CATEGORY_COST_GROUP_PATH,
      policy: MANAGE_POLICY,
    }),
  ]
}

function serializeExpense(expense: CompanyExpense): Record<string, unknown> {
  return {
    active: expense.active,
    categoryId: expense.categoryId,
    dueDay: expense.dueDay,
    expectedAmount: expense.expectedAmount,
    id: expense.id,
    kind: expense.kind,
    name: expense.name,
    payeeDriverId: expense.payeeDriverId,
    recurrence: expense.recurrence,
    vehicleId: expense.vehicleId ?? null,
  }
}

function serializeCategory(category: CompanyExpenseCategory): Record<string, unknown> {
  return {
    active: category.active,
    ...(category.costGroup === undefined ? {} : { costGroup: category.costGroup }),
    id: category.id,
    name: category.name,
    requiresDriver: category.requiresDriver,
  }
}

function serializeBareOccurrence(occurrence: CompanyExpenseOccurrence): Record<string, unknown> {
  return {
    competence: occurrence.competence,
    dueDate: occurrence.dueDate,
    expectedAmount: occurrence.expectedAmount,
    expenseId: occurrence.expenseId,
    id: occurrence.id,
    paidAmount: occurrence.paidAmount,
    paidAt: occurrence.paidAt,
    paidBy: occurrence.paidBy,
    settlementNote: occurrence.settlementNote,
    slot: occurrence.slot ?? 1,
    status: occurrence.status,
  }
}

function serializeOccurrence(item: ExpenseOccurrenceListItem): Record<string, unknown> {
  return {
    ...serializeBareOccurrence(item),
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    expenseKind: item.expenseKind,
    expenseName: item.expenseName,
    payeeDriverId: item.payeeDriverId,
    payeeDriverName: item.payeeDriverName,
    payeeDriverPaymentModel: item.payeeDriverPaymentModel,
    payeeProfile: item.payeeProfile,
  }
}

/** A ocorrência (o previsto já recalculado), as viagens incluídas e a soma delas: a diferença para a baixa é da tela. */
function serializeOccurrenceTrips(result: ExpenseOccurrenceTripsResult): Record<string, unknown> {
  return {
    items: result.items.map((item) => ({
      amount: item.amount,
      completedOn: item.completedOn,
      dailyAmount: item.dailyAmount,
      days: item.days,
      parcelKind: item.parcelKind,
      route: item.route,
      tripId: item.tripId,
    })),
    occurrence: serializeBareOccurrence(result.occurrence),
    tripsTotal: result.tripsTotal,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status })
}
