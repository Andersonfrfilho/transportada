/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 326 — o que o financeiro digita vira valor, data e dia da conta. Funções puras.
 */
import { formatCents, isCivilDate } from '../../expenses/domain/expense-money.policy.js'

const MAX_CENTS = 99_999_999_999n

/** `R$ 1.500,50` / `1500` / `89,9` → `'1500.50'`; `undefined` quando não é valor positivo. */
export function parseExpenseAmount(text: string): string | undefined {
  const cleaned = text
    .replace(/r\$/giu, '')
    .replace(/\s+/gu, '')
    .replace(/\.(?=\d{3}(?:\D|$))/gu, '')
    .replace(',', '.')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(cleaned)
  if (match?.[1] === undefined) return undefined
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  if (cents <= 0n || cents > MAX_CENTS) return undefined
  return formatCents(cents)
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * `hoje`, `amanhã`, `dd/mm` (próxima ocorrência a partir de hoje) e `dd/mm/aaaa`. `today` é o dia civil
 * de São Paulo, injetado.
 */
export function parseExpenseDueDate(text: string, today: string): string | undefined {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  if (normalized === 'hoje') return today
  if (normalized === 'amanha') return addDays(today, 1)
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/u.exec(normalized)
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  if (match[3] !== undefined) {
    const full = `${match[3]}-${month}-${day}`
    return isCivilDate(full) ? full : undefined
  }
  const year = Number(today.slice(0, 4))
  const thisYear = `${year}-${month}-${day}`
  if (!isCivilDate(thisYear)) return undefined
  if (thisYear >= today) return thisYear
  const nextYear = `${year + 1}-${month}-${day}`
  return isCivilDate(nextYear) ? nextYear : undefined
}

/** `5` ou `dia 10` → 1..31. */
export function parseExpenseDueDay(text: string): number | undefined {
  const match = /^(?:dia\s*)?(\d{1,2})$/iu.exec(text.trim())
  if (match?.[1] === undefined) return undefined
  const day = Number(match[1])
  return day >= 1 && day <= 31 ? day : undefined
}
