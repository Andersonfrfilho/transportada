/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.3: portas em memória da previsão e do fora do padrão, filtradas por empresa como o Drizzle filtra.
 */
import type {
  ExpenseForecastPorts,
  ExpenseOutOfPatternSettingsPorts,
} from '../../src/expenses/application/expense-forecast.port.js'
import {
  buildInMemoryExpenseResult,
  RESULT_COMPANY_A,
  type InMemoryExpenseResult,
  type ResultOccurrenceRow,
} from './expense-result-in-memory.fixture.js'

export type ForecastOccurrenceRow = ResultOccurrenceRow & { readonly competence: string }

export type InMemoryExpenseForecast = ExpenseForecastPorts &
  ExpenseOutOfPatternSettingsPorts & {
    readonly base: InMemoryExpenseResult
    readonly businessDays: Map<string, number>
    readonly categoryNames: Map<string, string>
    readonly forecastOccurrences: ForecastOccurrenceRow[]
    readonly plates: Map<string, string>
    readonly reads: { readonly companyId: string; readonly what: string }[]
    readonly thresholds: Map<string, number>
  }

export function buildInMemoryExpenseForecast(): InMemoryExpenseForecast {
  const base = buildInMemoryExpenseResult()
  const forecastOccurrences: ForecastOccurrenceRow[] = []
  const businessDays = new Map<string, number>()
  const categoryNames = new Map<string, string>()
  const plates = new Map<string, string>()
  const thresholds = new Map<string, number>()
  const reads: { companyId: string; what: string }[] = []
  const inPeriod = (row: ForecastOccurrenceRow, companyId: string, from: string, to: string) =>
    row.companyId === companyId &&
    row.competence >= from.slice(0, 7) &&
    row.competence <= to.slice(0, 7)
  return {
    allocationSettings: base.allocationSettings,
    base,
    businessDays,
    calendar: {
      businessDaysByMonth: ({ companyId, months }) => {
        reads.push({ companyId, what: 'calendar' })
        return Promise.resolve(
          new Map(months.map((month) => [month, businessDays.get(month) ?? 20])),
        )
      },
    },
    categoryNames,
    forecastOccurrences,
    labels: {
      categoryNames: ({ companyId }) => {
        reads.push({ companyId, what: 'categories' })
        return Promise.resolve(categoryNames)
      },
      vehiclePlates: ({ companyId }) => {
        reads.push({ companyId, what: 'plates' })
        return Promise.resolve(plates)
      },
    },
    occurrences: {
      listForPeriod: ({ companyId, from, to }) => {
        reads.push({ companyId, what: 'occurrences' })
        return Promise.resolve(
          forecastOccurrences.filter((row) => inPeriod(row, companyId, from, to)),
        )
      },
    },
    outOfPatternSettings: {
      get: ({ companyId }) => Promise.resolve(thresholds.get(companyId) ?? 10),
      save: ({ companyId, thresholdPercent }) => {
        thresholds.set(companyId, thresholdPercent)
        return Promise.resolve(thresholdPercent)
      },
    },
    plates,
    reads,
    thresholds,
    trips: base.trips,
  }
}

export { RESULT_COMPANY_A }
