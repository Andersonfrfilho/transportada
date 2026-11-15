/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RNF: dinheiro é `numeric` em string, nunca float. Soma em centavos (`bigint`).
 */
const MONEY_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/

/** `'1500.5'` → `150050n`; `null` quando não é valor não negativo com até 2 casas. */
export function parseMoneyToCents(value: string): bigint | null {
  const match = MONEY_PATTERN.exec(value.trim())
  if (match?.[1] === undefined) return null
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
}

export function formatCents(cents: bigint): string {
  const negative = cents < 0n
  const absolute = negative ? -cents : cents
  const whole = absolute / 100n
  const fraction = (absolute % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/** `yyyy-mm-dd` que existe no calendário. */
export function isCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.toISOString().slice(0, 10) === value
}
