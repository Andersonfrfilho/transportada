/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.2 (contratos da T6.1): previsão do próximo mês e alerta de fora do padrão (RF21 a RF23, ADR-0116 §7).
 * Funções puras e sem banco; dinheiro entra e sai em texto com duas casas e a conta é feita em centavos (`bigint`).
 * Sem IA e sem modelo: média simples por dia útil, explicável na tela ("Como é calculado").
 * Presas por `test/expenses/forecast.contract.ts` e `test/expenses/out-of-pattern.contract.ts`; as decisões de borda
 * (largura da faixa, mês sem viagem, média zero) estão em `specs/325-contas-fixas-e-variaveis/evidence.md` § T6.2.
 */
import { formatCents, parseMoneyToCents } from './expense-money.policy.js'

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

/** Meses fechados com dado que bastam para mostrar a previsão (RF22, CA12). */
export const FORECAST_MIN_MONTHS = 3

/** A partir de quantos meses com dado a previsão sai sem o aviso de poucos dados (RF22). */
export const FORECAST_FULL_MONTHS = 6

/**
 * Meia largura mínima da faixa, em % da parte estimada (faturamento e custo das viagens), por situação do histórico.
 * A faixa é a maior entre essa margem e a variação que os próprios meses mostraram (ver `estimate`). Com 3 a 5 meses
 * a margem dobra: pouca amostra não dá para fingir precisão (RF22, "usa a faixa mais larga"). Decisão da T6.2,
 * registrada em `specs/325-contas-fixas-e-variaveis/evidence.md` § T6.2.
 */
export const FORECAST_BAND_FLOOR_PERCENT = { limited: 30n, ok: 15n } as const

function parseAmount(value: string, field: string): bigint {
  const cents = parseMoneyToCents(value)
  if (cents === null) throw new RangeError(`${field} inválido: '${value}'`)
  return cents
}

/** Divisão de não negativos arredondada meio para cima (o arredondamento de dinheiro do módulo). */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator)
}

function minOf(values: readonly bigint[]): bigint {
  return values.reduce((a, b) => (b < a ? b : a))
}

function maxOf(values: readonly bigint[]): bigint {
  return values.reduce((a, b) => (b > a ? b : a))
}

type DataMonth = {
  readonly businessDays: bigint
  readonly revenue: bigint
  readonly tripCost: bigint
}

/**
 * Um mês fechado só é mês de dado se tem dia útil e teve movimento (faturamento ou custo de viagem). Mês sem viagem
 * fica na janela dos 6 mais recentes, mas não conta nem entra na média: ele quase sempre é a empresa ainda sem usar o
 * sistema ou um buraco de lançamento, e contá-lo mostraria a previsão antes da hora e puxaria a média para baixo.
 */
function isDataMonth(month: DataMonth): boolean {
  return month.businessDays > 0n && (month.revenue > 0n || month.tripCost > 0n)
}

type Estimate = { readonly expected: bigint; readonly max: bigint; readonly min: bigint }

/**
 * Valor previsto = média por dia útil do período (Σ valor ÷ Σ dias úteis) × dias úteis do mês previsto. A faixa vai do
 * menor ao maior mês projetado para os mesmos dias úteis, alargada até a margem mínima em volta do previsto.
 */
function estimate(
  months: readonly DataMonth[],
  pick: (month: DataMonth) => bigint,
  nextDays: bigint,
  floorPercent: bigint,
): Estimate {
  const totalDays = months.reduce((sum, m) => sum + m.businessDays, 0n)
  const total = months.reduce((sum, m) => sum + pick(m), 0n)
  const expected = divideHalfUp(total * nextDays, totalDays)
  const projected = months.map((m) => divideHalfUp(pick(m) * nextDays, m.businessDays))
  const floor = divideHalfUp(expected * floorPercent, 100n)
  const lowFloor = expected - floor
  const lowObserved = minOf(projected)
  const highFloor = expected + floor
  const highObserved = maxOf(projected)
  return {
    expected,
    max: highObserved > highFloor ? highObserved : highFloor,
    min: lowObserved < lowFloor ? lowObserved : lowFloor,
  }
}

function toRange(value: Estimate): ForecastRange {
  return {
    expected: formatCents(value.expected),
    max: formatCents(value.max),
    min: formatCents(value.min),
  }
}

export function forecastNextMonth(input: ForecastInput): ForecastResult {
  if (!Number.isInteger(input.nextMonthBusinessDays) || input.nextMonthBusinessDays < 0)
    throw new RangeError(`dias úteis do mês previsto inválidos: ${input.nextMonthBusinessDays}`)
  const recurring = parseAmount(input.recurringExpenses, 'recurringExpenses')

  const window = [...input.history]
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0))
    .slice(0, FORECAST_FULL_MONTHS)
  const months = window
    .map((m): DataMonth => {
      if (!Number.isInteger(m.businessDays) || m.businessDays < 0)
        throw new RangeError(`dias úteis inválidos em ${m.month}: ${m.businessDays}`)
      return {
        businessDays: BigInt(m.businessDays),
        revenue: parseAmount(m.revenue, `revenue de ${m.month}`),
        tripCost: parseAmount(m.tripCost, `tripCost de ${m.month}`),
      }
    })
    .filter(isDataMonth)
  const monthsOfData = months.length

  if (monthsOfData < FORECAST_MIN_MONTHS)
    return { forecast: null, monthsOfData, status: 'unavailable', warning: 'few_data' }

  const limited = monthsOfData < FORECAST_FULL_MONTHS
  const floorPercent = limited
    ? FORECAST_BAND_FLOOR_PERCENT.limited
    : FORECAST_BAND_FLOOR_PERCENT.ok
  const nextDays = BigInt(input.nextMonthBusinessDays)
  const revenue = estimate(months, (m) => m.revenue, nextDays, floorPercent)
  const tripCost = estimate(months, (m) => m.tripCost, nextDays, floorPercent)
  // As recorrentes já estão cadastradas para o mês: entram inteiras, sem incerteza, nos três pontos da faixa.
  const cost: Estimate = {
    expected: tripCost.expected + recurring,
    max: tripCost.max + recurring,
    min: tripCost.min + recurring,
  }
  // Lucro pelo pior e pelo melhor par: mínimo = menor faturamento − maior custo. Faixa honesta, nunca otimista.
  const profit: Estimate = {
    expected: revenue.expected - cost.expected,
    max: revenue.max - cost.min,
    min: revenue.min - cost.max,
  }

  return {
    forecast: { cost: toRange(cost), profit: toRange(profit), revenue: toRange(revenue) },
    monthsOfData,
    status: limited ? 'limited' : 'ok',
    warning: limited ? 'few_data' : null,
  }
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

/** Meses fechados anteriores que formam o padrão do item (RF23). */
export const OUT_OF_PATTERN_MONTHS = 3

/** Limite em centésimos de ponto percentual (`12.5` → `1250n`); aceita até duas casas, de 0 a 1000%. */
function thresholdInHundredths(thresholdPercent: number): bigint {
  const hundredths = Math.round(thresholdPercent * 100)
  if (
    !Number.isFinite(thresholdPercent) ||
    thresholdPercent < 0 ||
    thresholdPercent > 1000 ||
    Math.abs(thresholdPercent * 100 - hundredths) > 1e-6
  )
    throw new RangeError(`limite de fora do padrão inválido: ${thresholdPercent}`)
  return BigInt(hundredths)
}

/**
 * Compara o mês corrente com a média dos 3 meses fechados mais recentes, arredondada ao centavo (a mesma que a tela
 * mostra, para os números exibidos nunca contradizerem a regra). Alerta só quando |corrente − média| passa
 * **estritamente** do limite sobre a média: exatamente no limite não alerta (CA13).
 *
 * A conta é feita por multiplicação cruzada, sem divisão. Por isso média zero tem resposta natural: corrente também
 * zero não alerta; qualquer valor diferente de zero alerta, porque passa de qualquer porcentagem de zero (um gasto
 * que não existia e apareceu é exatamente o que a lista deve mostrar).
 *
 * Item com menos de 3 meses de histórico (veículo novo, conta nova) não alerta: não há padrão. Quem monta
 * `previousMonths` deixa de fora o mês em que o item não existiu (custo por km de veículo sem viagem não é zero, é
 * ausência), para esse mês não virar um zero que dispara o alerta. A saída segue a ordem da entrada.
 */
export function detectOutOfPattern(input: {
  readonly items: readonly OutOfPatternItem[]
  readonly thresholdPercent: number
}): readonly OutOfPatternAlert[] {
  const threshold = thresholdInHundredths(input.thresholdPercent)
  const alerts: OutOfPatternAlert[] = []
  for (const item of input.items) {
    const current = parseAmount(item.current, `current de ${item.key}`)
    const previous = item.previousMonths
      .slice(0, OUT_OF_PATTERN_MONTHS)
      .map((value) => parseAmount(value, `previousMonths de ${item.key}`))
    if (previous.length < OUT_OF_PATTERN_MONTHS) continue
    const average = divideHalfUp(
      previous.reduce((sum, value) => sum + value, 0n),
      BigInt(previous.length),
    )
    const difference = current - average
    const distance = difference < 0n ? -difference : difference
    if (distance * 10_000n <= average * threshold) continue
    alerts.push({
      average: formatCents(average),
      current: formatCents(current),
      difference: formatCents(difference),
      direction: difference > 0n ? 'above' : 'below',
      key: item.key,
      kind: item.kind,
      label: item.label,
    })
  }
  return alerts
}
