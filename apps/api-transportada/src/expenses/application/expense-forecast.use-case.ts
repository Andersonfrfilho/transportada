/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.3 (RF21 a RF23, ADR-0116 §7): a previsão do próximo mês e a lista de fora do padrão, calculadas na leitura
 * sobre o **mesmo** resultado dos meses fechados (`computeExpenseResult`), sem gravar nada. As regras de conta são
 * das funções puras da T6.2 (`forecastNextMonth`, `detectOutOfPattern`); aqui só se monta a entrada.
 *
 * Mês consultado = o mês corrente: o previsto é o seguinte; o histórico são os 6 meses fechados antes dele; o padrão de
 * cada item são os 3 fechados mais recentes. O pagamento de motorista (`in_trip`) nunca entra nas contas nem no alerta:
 * ele já está no custo das viagens (RF13).
 */
import { formatCents, parseMoneyToCents } from '../domain/expense-money.policy.js'
import {
  detectOutOfPattern,
  forecastNextMonth,
  FORECAST_FULL_MONTHS,
  OUT_OF_PATTERN_MONTHS,
  type ClosedMonthResult,
  type ForecastResult,
  type OutOfPatternAlert,
  type OutOfPatternItem,
} from '../domain/expense-forecast.policy.js'
import type {
  ExpenseForecastPorts,
  ExpenseOutOfPatternSettingsPorts,
} from './expense-forecast.port.js'
import type { ResultOccurrence } from './expense-result.port.js'
import {
  buildExpenseUnitCosts,
  computeExpenseResult,
  considered,
  type ComputedExpenseResult,
} from './expense-result.use-case.js'

export type ExpenseForecastInput = {
  readonly companyId: string
  /** Mês corrente, `yyyy-mm`. */
  readonly month: string
}

export type ExpenseForecastOutput = {
  readonly forecast: ForecastResult
  readonly month: string
  readonly nextMonth: string
  readonly nextMonthBusinessDays: number
  readonly outOfPattern: readonly OutOfPatternAlert[]
  /** Contas já cadastradas para o mês previsto, fora o pagamento de motorista. */
  readonly recurringExpenses: string
  readonly thresholdPercent: number
}

const ZERO = 0n

/** `yyyy-mm` deslocado em `delta` meses. */
export function shiftMonth(month: string, delta: number): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number)
  const index = year * 12 + (monthNumber - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

function monthBounds(month: string): { readonly from: string; readonly to: string } {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

function cents(value: string): bigint {
  const parsed = parseMoneyToCents(value)
  if (parsed === null) throw new Error(`expense forecast: invalid money "${value}"`)
  return parsed
}

/** Reais por km com 4 casas → centavos por km (meio para cima), a precisão que a regra de alerta e a tela usam. */
function perKmToMoney(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.')
  const padded = fraction.padEnd(4, '0')
  const hundredths = BigInt(whole) * 100n + BigInt(padded.slice(0, 2))
  const rounded = BigInt(padded.slice(2, 3)) >= 5n ? hundredths + 1n : hundredths
  return formatCents(rounded)
}

type MonthData = {
  readonly computed: ComputedExpenseResult
  readonly month: string
  readonly occurrences: readonly ResultOccurrence[]
}

/** Soma por chave das ocorrências vivas do mês; mês em que a chave não aparece fica de fora (ausência, não zero). */
function sumBy(
  occurrences: readonly ResultOccurrence[],
  key: (occurrence: ResultOccurrence) => string,
): Map<string, bigint> {
  const totals = new Map<string, bigint>()
  for (const occurrence of occurrences) {
    if (occurrence.status === 'canceled' || occurrence.costGroup === 'in_trip') continue
    const id = key(occurrence)
    totals.set(id, (totals.get(id) ?? ZERO) + cents(considered(occurrence)))
  }
  return totals
}

/** Valores dos meses fechados anteriores, mais recente primeiro, só dos meses em que o item existiu. */
function previousValues(
  previous: readonly (ReadonlyMap<string, string> | undefined)[],
  key: string,
): string[] {
  const values: string[] = []
  for (const month of previous) {
    const value = month?.get(key)
    if (value !== undefined) values.push(value)
  }
  return values
}

function moneyMap(totals: ReadonlyMap<string, bigint>): Map<string, string> {
  return new Map([...totals].map(([key, value]) => [key, formatCents(value)]))
}

export function createGetExpenseForecastUseCase(
  ports: ExpenseForecastPorts & ExpenseOutOfPatternSettingsPorts,
): { execute(input: ExpenseForecastInput): Promise<ExpenseForecastOutput> } {
  return {
    execute: async ({ companyId, month }) => {
      const nextMonth = shiftMonth(month, 1)
      const closedMonths = Array.from({ length: FORECAST_FULL_MONTHS }, (_, index) =>
        shiftMonth(month, -(index + 1)),
      )
      const patternMonths = closedMonths.slice(0, OUT_OF_PATTERN_MONTHS)

      const load = async (target: string): Promise<MonthData> => {
        const bounds = monthBounds(target)
        const [computed, occurrences] = await Promise.all([
          computeExpenseResult(ports, { companyId, ...bounds }),
          ports.occurrences.listForPeriod({ companyId, ...bounds }),
        ])
        return { computed, month: target, occurrences }
      }

      const [closed, current, nextOccurrences, businessDays, thresholdPercent, categoryNames] =
        await Promise.all([
          Promise.all(closedMonths.map(load)),
          load(month),
          ports.occurrences.listForPeriod({ companyId, ...monthBounds(nextMonth) }),
          ports.calendar.businessDaysByMonth({ companyId, months: [...closedMonths, nextMonth] }),
          ports.outOfPatternSettings.get({ companyId }),
          ports.labels.categoryNames({ companyId }),
        ])

      const history: ClosedMonthResult[] = closed.map((data) => ({
        businessDays: businessDays.get(data.month) ?? 0,
        month: data.month,
        revenue: data.computed.result.totals.revenue,
        tripCost: data.computed.result.totals.tripCost,
      }))
      const nextMonthBusinessDays = businessDays.get(nextMonth) ?? 0
      const recurring = [...sumBy(nextOccurrences, () => 'all').values()].reduce(
        (sum, value) => sum + value,
        ZERO,
      )
      const forecast = forecastNextMonth({
        history,
        nextMonthBusinessDays,
        recurringExpenses: formatCents(recurring),
      })

      // Padrão: os 3 fechados mais recentes (já em ordem do mais recente para o mais antigo).
      const past = closed.filter((data) => patternMonths.includes(data.month))
      const byExpensePast = past.map((data) =>
        moneyMap(sumBy(data.occurrences, (o) => o.expenseId)),
      )
      const byCategoryPast = past.map((data) =>
        moneyMap(sumBy(data.occurrences, (o) => o.categoryId)),
      )
      const unitCostsPast = past.map((data) => {
        const lines = new Map<string, string>()
        for (const line of buildExpenseUnitCosts(data.computed).perVehicle) {
          if (line.vehicleId !== null && line.costPerKm !== null) {
            lines.set(line.vehicleId, perKmToMoney(line.costPerKm))
          }
        }
        return lines
      })

      const items: OutOfPatternItem[] = []
      const currentLive = current.occurrences.filter(
        (occurrence) => occurrence.status !== 'canceled' && occurrence.costGroup !== 'in_trip',
      )
      const expenseNames = new Map<string, string>()
      for (const occurrence of currentLive) expenseNames.set(occurrence.expenseId, occurrence.name)
      for (const [key, total] of sumBy(current.occurrences, (o) => o.expenseId)) {
        items.push({
          current: formatCents(total),
          key,
          kind: 'expense',
          label: expenseNames.get(key) ?? key,
          previousMonths: previousValues(byExpensePast, key),
        })
      }
      for (const [key, total] of sumBy(current.occurrences, (o) => o.categoryId)) {
        items.push({
          current: formatCents(total),
          key,
          kind: 'category',
          label: categoryNames.get(key) ?? key,
          previousMonths: previousValues(byCategoryPast, key),
        })
      }
      const currentUnitCosts = buildExpenseUnitCosts(current.computed).perVehicle.filter(
        (line) => line.vehicleId !== null && line.costPerKm !== null,
      )
      const vehicleIds = currentUnitCosts.flatMap((line) =>
        line.vehicleId === null ? [] : [line.vehicleId],
      )
      const plates =
        vehicleIds.length === 0
          ? new Map<string, string>()
          : await ports.labels.vehiclePlates({ companyId, vehicleIds })
      for (const line of currentUnitCosts) {
        if (line.vehicleId === null || line.costPerKm === null) continue
        items.push({
          current: perKmToMoney(line.costPerKm),
          key: line.vehicleId,
          kind: 'vehicle_cost_per_km',
          label: plates.get(line.vehicleId) ?? line.vehicleId,
          previousMonths: previousValues(unitCostsPast, line.vehicleId),
        })
      }

      return {
        forecast,
        month,
        nextMonth,
        nextMonthBusinessDays,
        outOfPattern: detectOutOfPattern({ items, thresholdPercent }),
        recurringExpenses: formatCents(recurring),
        thresholdPercent,
      }
    },
  }
}

export function createGetOutOfPatternSettingsUseCase(ports: ExpenseOutOfPatternSettingsPorts): {
  execute(input: { companyId: string }): Promise<number>
} {
  return { execute: ({ companyId }) => ports.outOfPatternSettings.get({ companyId }) }
}

export function createUpdateOutOfPatternSettingsUseCase(ports: ExpenseOutOfPatternSettingsPorts): {
  execute(input: {
    companyId: string
    correlationId?: string
    thresholdPercent: number
    updatedBy: string
  }): Promise<number>
} {
  return {
    execute: ({ companyId, correlationId, thresholdPercent, updatedBy }) =>
      ports.outOfPatternSettings.save({
        companyId,
        correlationId: correlationId ?? crypto.randomUUID(),
        thresholdPercent,
        updatedBy,
      }),
  }
}
