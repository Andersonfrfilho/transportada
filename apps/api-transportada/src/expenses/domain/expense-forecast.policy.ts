/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.1 (esqueleto; a T6.2 implementa): previsão do próximo mês e alerta de fora do padrão (RF21 a RF23, ADR-0116 §7).
 * Funções puras e sem banco; dinheiro entra e sai em texto com duas casas. Tudo aqui lança "not implemented" até a T6.2.
 */

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

export type ForecastRange = {
  readonly expected: string
  readonly max: string
  readonly min: string
}

export type ForecastInput = {
  /** Meses fechados, qualquer ordem; só os 6 mais recentes entram. */
  readonly history: readonly ClosedMonthResult[]
  /** Dias úteis do mês previsto. */
  readonly nextMonthBusinessDays: number
  /** Contas recorrentes já cadastradas para o mês previsto. */
  readonly recurringExpenses: string
}

export type ForecastResult =
  | {
      readonly forecast: null
      readonly monthsOfData: number
      readonly status: 'unavailable'
      readonly warning: 'few_data'
    }
  | {
      readonly forecast: {
        readonly cost: ForecastRange
        readonly profit: ForecastRange
        readonly revenue: ForecastRange
      }
      readonly monthsOfData: number
      readonly status: 'limited' | 'ok'
      /** `few_data` só entre 3 e 5 meses (CA12). */
      readonly warning: 'few_data' | null
    }

export function forecastNextMonth(input: ForecastInput): ForecastResult {
  void input
  throw new Error('not implemented: forecastNextMonth (spec 325 T6.2)')
}

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

export type OutOfPatternAlert = {
  readonly average: string
  readonly current: string
  readonly difference: string
  readonly direction: 'above' | 'below'
  readonly key: string
  readonly kind: OutOfPatternKind
  readonly label: string
}

export const DEFAULT_OUT_OF_PATTERN_THRESHOLD_PERCENT = 10

export function detectOutOfPattern(input: {
  readonly items: readonly OutOfPatternItem[]
  readonly thresholdPercent: number
}): readonly OutOfPatternAlert[] {
  void input
  throw new Error('not implemented: detectOutOfPattern (spec 325 T6.2)')
}
