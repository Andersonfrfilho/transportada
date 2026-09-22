/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DAILY_ALLOWANCE_DAY_SECONDS,
  DEFAULT_DAILY_ALLOWANCE_AMOUNT,
  MINIMUM_ALLOWANCE_DAYS,
} from './daily-allowance.constant.js'

/**
 * Spec 143 D3: de onde veio o valor da diária — decide a frase que a tela mostra ao lado do número
 * ("valor do motorista" / "valor geral" / "valor padrão").
 */
export const DAILY_ALLOWANCE_RATE_ORIGIN = {
  company: 'company',
  default: 'default',
  driver: 'driver',
} as const

export type DailyAllowanceRateOrigin =
  (typeof DAILY_ALLOWANCE_RATE_ORIGIN)[keyof typeof DAILY_ALLOWANCE_RATE_ORIGIN]

/**
 * Spec 143 D4: os dias vieram da operação (`informed`) ou da duração estimada do roteiro
 * (`estimated`) — é o que decide se a parcela do motorista é medida ou prevista.
 */
export const DAILY_ALLOWANCE_DAYS_ORIGIN = {
  estimated: 'estimated',
  informed: 'informed',
} as const

export type DailyAllowanceDaysOrigin =
  (typeof DAILY_ALLOWANCE_DAYS_ORIGIN)[keyof typeof DAILY_ALLOWANCE_DAYS_ORIGIN]

export type ResolveDailyAllowanceParams = {
  readonly companyAmount: null | string
  readonly driverAmount: null | string
}

export type ResolvedDailyAllowance = {
  readonly amount: string
  readonly rateOrigin: DailyAllowanceRateOrigin
}

/**
 * Spec 143 D3: o valor do motorista **substitui** o da empresa, nunca soma — e sem nenhum dos dois
 * vale o padrão do sistema. Os valores já chegam como `numeric` (string), então não há aritmética
 * aqui: só a escolha de qual string usar.
 */
export function resolveDailyAllowance({
  companyAmount,
  driverAmount,
}: ResolveDailyAllowanceParams): ResolvedDailyAllowance {
  if (driverAmount !== null) {
    return { amount: driverAmount, rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.driver }
  }
  if (companyAmount !== null) {
    return { amount: companyAmount, rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.company }
  }
  return { amount: DEFAULT_DAILY_ALLOWANCE_AMOUNT, rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.default }
}

/**
 * Spec 143 D4: a sugestão de dias vem da duração estimada da viagem — qualquer fração de dia conta
 * como um dia inteiro, e nenhuma viagem sugere menos de um.
 */
export function suggestAllowanceDays(durationSeconds: number): number {
  const suggestedDays = Math.ceil(durationSeconds / DAILY_ALLOWANCE_DAY_SECONDS)
  return Math.max(MINIMUM_ALLOWANCE_DAYS, suggestedDays)
}
