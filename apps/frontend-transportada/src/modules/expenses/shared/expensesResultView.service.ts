/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  divideScaledAmounts,
  sumScaledAmounts,
  zeroAmount,
} from '@/modules/shared/decimalAmount.service'

import type { ExpenseResultLine } from './expensesResult.types'

const MONTHS_IN_TREND = 4
const PERCENT_SCALE = 4
const MONEY_SCALE = 2
const MS_PER_DAY = 86_400_000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toCivil(date: Date): string {
  return `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function parseCivil(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

/** Primeiro e último dia do mês `yyyy-mm`, em data civil (sem fuso). */
export function monthPeriod(competence: string): Readonly<{ from: string; to: string }> {
  const [year, month] = competence.split('-').map(Number)
  const first = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1))
  const last = new Date(Date.UTC(year ?? 1970, month ?? 1, 0))
  return { from: toCivil(first), to: toCivil(last) }
}

export function currentMonthPeriod(now: Date = new Date()): Readonly<{ from: string; to: string }> {
  return monthPeriod(`${String(now.getFullYear())}-${pad(now.getMonth() + 1)}`)
}

/** O período de mesmo tamanho imediatamente antes: é com ele que os indicadores se comparam. */
export function previousPeriod(period: Readonly<{ from: string; to: string }>): Readonly<{
  from: string
  to: string
}> {
  const from = parseCivil(period.from).getTime()
  const to = parseCivil(period.to).getTime()
  const days = Math.round((to - from) / MS_PER_DAY) + 1
  return {
    from: toCivil(new Date(from - days * MS_PER_DAY)),
    to: toCivil(new Date(from - MS_PER_DAY)),
  }
}

/** Os últimos meses até o do fim do período, do mais antigo ao mais novo (`yyyy-mm`). */
export function listTrendCompetences(to: string): readonly string[] {
  const [year, month] = to.split('-').map(Number)
  return Array.from({ length: MONTHS_IN_TREND }, (_, index) => {
    const date = new Date(
      Date.UTC(year ?? 1970, (month ?? 1) - 1 - (MONTHS_IN_TREND - 1 - index), 1),
    )
    return `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}`
  })
}

function negate(value: string): string {
  return value.startsWith('-') ? value.slice(1) : `-${value}`
}

export function subtractAmounts(left: string, right: string): string {
  return sumScaledAmounts([left, negate(right)])
}

/** Texto `-0.1234` → décimos de ponto percentual arredondados (meio para cima, afastando de zero). */
function formatRatioAsPercent(ratio: string): string {
  const negative = ratio.startsWith('-')
  const digits = ratio.replace('-', '').replace('.', '')
  const tenths = (BigInt(digits) + 5n) / 10n
  const whole = tenths / 10n
  const tenth = tenths % 10n
  const sign = negative && tenths !== 0n ? '-' : ''
  return `${sign}${String(whole)},${String(tenth)}%`
}

/** Margem em % do faturamento; faturamento zero não tem margem. */
export function formatMarginPercent(margin: string, revenue: string): null | string {
  const ratio = divideScaledAmounts({ dividend: margin, divisor: revenue, scale: PERCENT_SCALE })
  return ratio === null ? null : formatRatioAsPercent(ratio)
}

/** Variação sobre o período comparado, com sinal (`+7,8%`); comparado zerado não tem variação. */
export function formatVariationPercent(current: string, previous: string): null | string {
  const base = previous.startsWith('-') ? negate(previous) : previous
  const ratio = divideScaledAmounts({
    dividend: subtractAmounts(current, previous),
    divisor: base,
    scale: PERCENT_SCALE,
  })
  if (ratio === null) return null
  const text = formatRatioAsPercent(ratio)
  return text.startsWith('-') ? text : `+${text}`
}

/** Reais por quilômetro com duas casas; sem quilômetro, `null`. */
export function amountPerKm(amount: string, kilometers: string): null | string {
  return divideScaledAmounts({ dividend: amount, divisor: kilometers, scale: MONEY_SCALE })
}

/** Margem da linha (frete − custo − rateios já vem pronta da API) e seu percentual. */
export function lineMarginPercent(line: ExpenseResultLine): null | string {
  return formatMarginPercent(line.margin, line.revenue)
}

export function isNegativeAmount(value: string): boolean {
  return value.startsWith('-') && value !== zeroAmount(4)
}

/** Metros da rota em quilômetros inteiros (`620000` → `620`); a tela mostra o que a estrada mede, sem casa decimal. */
export function formatKilometers(distanceMeters: number): string {
  return String(Math.round(distanceMeters / 1000))
}
