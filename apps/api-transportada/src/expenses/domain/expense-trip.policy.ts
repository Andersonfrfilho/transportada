/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1d (T1.4b): regras puras das viagens do pagamento — o período que a ocorrência cobre e o arredondamento
 * da linha da pessoa na parcela da viagem. Sem I/O.
 */
import type { ExpenseRecurrence } from '../application/expense.port.js'
import { formatCents } from './expense-money.policy.js'
import { isCivilDate } from './expense-money.policy.js'
import { resolveExpenseDueDate } from './expense-schedule.policy.js'

/** Teto do período pedido à mão na lista de viagens disponíveis: três meses cobrem a viagem que ficou para trás. */
export const EXPENSE_TRIP_PERIOD_MAX_DAYS = 93

export type ExpenseTripPeriod = {
  /** `yyyy-mm-dd`, inclusivo. */
  readonly from: string
  /** `yyyy-mm-dd`, inclusivo. */
  readonly to: string
}

/**
 * O período da ocorrência: o mês da competência; na quinzenal, a quinzena do `slot` (1 = dia 1 a 15, 2 = dia 16 ao
 * último). A viagem entra pela data de conclusão (civil, São Paulo).
 */
export function resolveOccurrenceTripPeriod(params: {
  readonly competence: string
  readonly recurrence: ExpenseRecurrence | null
  readonly slot: 1 | 2
}): ExpenseTripPeriod {
  const first = `${params.competence}-01`
  const last = resolveExpenseDueDate({ competence: params.competence, dueDay: 31 })
  if (params.recurrence !== 'fortnightly') return { from: first, to: last }
  return params.slot === 1
    ? { from: first, to: `${params.competence}-15` }
    : { from: `${params.competence}-16`, to: last }
}

/** `null` quando as datas não existem, estão invertidas ou passam do teto. */
export function validateExpenseTripPeriod(period: ExpenseTripPeriod): ExpenseTripPeriod | null {
  if (!isCivilDate(period.from) || !isCivilDate(period.to)) return null
  const days =
    (Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000
  if (days < 0 || days + 1 > EXPENSE_TRIP_PERIOD_MAX_DAYS) return null
  return period
}

const PARCEL_AMOUNT_PATTERN = /^(\d+)(?:\.(\d{1,4}))?$/

/**
 * A linha da pessoa na parcela (`numeric(19,4)`) em centavos, meio para cima — o mesmo arredondamento por linha da
 * 247: soma-se as linhas já arredondadas, nunca o contrário.
 */
export function roundParcelAmountToCents(amount: string): bigint {
  const match = PARCEL_AMOUNT_PATTERN.exec(amount.trim())
  if (match?.[1] === undefined)
    throw new Error(`parcel amount must be a non-negative decimal: ${amount}`)
  const tenThousandths = BigInt(match[1]) * 10_000n + BigInt((match[2] ?? '').padEnd(4, '0'))
  return (tenThousandths + 50n) / 100n
}

export function formatParcelAmount(amount: string): string {
  return formatCents(roundParcelAmountToCents(amount))
}
