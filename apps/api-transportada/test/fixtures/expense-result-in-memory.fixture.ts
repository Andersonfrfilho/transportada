/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2: portas em memória do resultado e do rateio, filtradas por empresa como o Drizzle da T4.5 filtra. Quem
 * lê a conclusão da viagem é a porta (a expressão SQL é a do pagamento, T1.4b), então a fixture já guarda `completedOn`.
 */
import type {
  ExpenseResultPorts,
  ResultOccurrence,
} from '../../src/expenses/application/expense-result.port.js'
import type {
  AllocatableCostGroup,
  AllocationCriterion,
  AllocationTrip,
} from '../../src/expenses/domain/expense-allocation.policy.js'

export const RESULT_COMPANY_A = '00000000-0000-4000-8000-0000000000a1'
export const RESULT_COMPANY_B = '00000000-0000-4000-8000-0000000000b1'
export const VEHICLE_1 = '00000000-0000-4000-8000-00000000e001'
export const VEHICLE_2 = '00000000-0000-4000-8000-00000000e002'
export const CUSTOMER_1 = '00000000-0000-4000-8000-00000000f001'
export const CUSTOMER_2 = '00000000-0000-4000-8000-00000000f002'

export type ResultTripRow = AllocationTrip & { readonly companyId: string }
export type ResultOccurrenceRow = ResultOccurrence & { readonly companyId: string }

export type InMemoryExpenseResult = ExpenseResultPorts & {
  readonly occurrenceRows: ResultOccurrenceRow[]
  readonly settingsRows: Map<string, Partial<Record<AllocatableCostGroup, AllocationCriterion>>>
  readonly tripRows: ResultTripRow[]
  /** Cada leitura de viagens/ocorrências que o caso de uso pediu, para provar o escopo da empresa. */
  readonly reads: { readonly companyId: string; readonly what: string }[]
}

export function buildInMemoryExpenseResult(): InMemoryExpenseResult {
  const occurrenceRows: ResultOccurrenceRow[] = []
  const tripRows: ResultTripRow[] = []
  const settingsRows = new Map<string, Partial<Record<AllocatableCostGroup, AllocationCriterion>>>()
  const reads: { companyId: string; what: string }[] = []
  return {
    allocationSettings: {
      get: ({ companyId }) => {
        reads.push({ companyId, what: 'settings' })
        return Promise.resolve(settingsRows.get(companyId) ?? {})
      },
    },
    occurrenceRows,
    occurrences: {
      listForPeriod: ({ companyId }) => {
        reads.push({ companyId, what: 'occurrences' })
        return Promise.resolve(occurrenceRows.filter((row) => row.companyId === companyId))
      },
    },
    reads,
    settingsRows,
    tripRows,
    trips: {
      listCompleted: ({ companyId, from, to }) => {
        reads.push({ companyId, what: 'trips' })
        return Promise.resolve(
          tripRows.filter(
            (row) =>
              row.companyId === companyId && row.completedOn >= from && row.completedOn <= to,
          ),
        )
      },
    },
  }
}

export function aTrip(
  overrides: Partial<ResultTripRow> & { readonly tripId: string },
): ResultTripRow {
  return {
    companyId: RESULT_COMPANY_A,
    completedOn: '2026-10-10',
    cost: '0.00',
    customerId: CUSTOMER_1,
    daysCount: 1,
    distanceMeters: 100_000,
    revenue: '1000.00',
    vehicleId: VEHICLE_1,
    ...overrides,
  }
}

export function anOccurrence(
  overrides: Partial<ResultOccurrenceRow> & { readonly occurrenceId: string },
): ResultOccurrenceRow {
  return {
    categoryId: 'category-default',
    companyId: RESULT_COMPANY_A,
    costGroup: 'administrative',
    expectedAmount: '100.00',
    expenseId: `expense-${overrides.occurrenceId}`,
    includedTripsAmount: '0.00',
    name: 'Conta',
    paidAmount: null,
    payeeDriverId: null,
    status: 'open',
    vehicleId: null,
    ...overrides,
  }
}
