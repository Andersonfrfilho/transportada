/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.2 (contratos da T6.1): previsão do próximo mês e alerta de fora do padrão (RF21 a RF23, ADR-0116 §7).
 * Funções puras e sem banco; dinheiro entra e sai em texto com duas casas e a conta é feita em centavos (`bigint`).
 * Sem IA e sem modelo: média simples por dia útil, explicável na tela ("Como é calculado").
 *
 * A regra mora no SDK (`@adatechnology/expense-contracts`). Aqui fica o adaptador fino: o custo das viagens
 * (`tripCost`) entra como custo direto (`directCost`) da unidade e o tipo `vehicle_cost_per_km` continua sendo da
 * transportada. Presas por `test/expenses/forecast.contract.ts` e `test/expenses/out-of-pattern.contract.ts`.
 */
import {
  type ForecastInput as SdkForecastInput,
  forecastNextMonth as sdkForecastNextMonth,
} from '@adatechnology/expense-contracts'

export {
  DEFAULT_OUT_OF_PATTERN_THRESHOLD_PERCENT,
  detectOutOfPattern,
  FORECAST_BAND_FLOOR_PERCENT,
  FORECAST_FULL_MONTHS,
  FORECAST_MIN_MONTHS,
  OUT_OF_PATTERN_MONTHS,
} from '@adatechnology/expense-contracts'
export type {
  ForecastRange,
  ForecastResult,
  OutOfPatternAlert,
} from '@adatechnology/expense-contracts'

/** Mês fechado já calculado pelo mesmo caminho do resultado (ADR-0116 §7). */
export type ClosedMonthResult = {
  /** Dias úteis do mês, pelo calendário da empresa. */
  readonly businessDays: number
  /** Custo das viagens do mês. */
  readonly tripCost: string
  /** `yyyy-mm`. */
  readonly month: string
  readonly revenue: string
}

export type ForecastInput = {
  /** Meses fechados, qualquer ordem; só os 6 mais recentes entram. */
  readonly history: readonly ClosedMonthResult[]
  /** Dias úteis do mês previsto. */
  readonly nextMonthBusinessDays: number
  /** Contas recorrentes já cadastradas para o mês previsto. */
  readonly recurringExpenses: string
}

export function forecastNextMonth(input: ForecastInput): ReturnType<typeof sdkForecastNextMonth> {
  const sdkInput: SdkForecastInput = {
    history: input.history.map((month) => ({
      businessDays: month.businessDays,
      directCost: month.tripCost,
      month: month.month,
      revenue: month.revenue,
    })),
    nextMonthBusinessDays: input.nextMonthBusinessDays,
    recurringExpenses: input.recurringExpenses,
  }
  return sdkForecastNextMonth(sdkInput)
}

/** O que se compara; `vehicle_cost_per_km` é da transportada (o SDK aceita qualquer texto). */
export type OutOfPatternKind = 'category' | 'expense' | 'vehicle_cost_per_km'

export type OutOfPatternItem = {
  /** Valor do mês corrente. */
  readonly current: string
  readonly key: string
  readonly kind: OutOfPatternKind
  readonly label: string
  /** Valores dos meses fechados anteriores, mais recente primeiro; só os 3 mais recentes entram na média. */
  readonly previousMonths: readonly string[]
}
