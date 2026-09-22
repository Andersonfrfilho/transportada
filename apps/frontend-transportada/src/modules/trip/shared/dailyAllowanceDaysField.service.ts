/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripValuationCostParcel } from '@/modules/trip-financials/shared/tripValuation.service'

/** Dígitos e nada mais: `2,5`, `2.5` e `1e3` são engano de digitação, não meia diária. */
const DIGITS_ONLY = /^\d+$/u

/** O que a coluna `daily_allowance_days` (`integer`) guarda — acima disso o banco responde 500. */
const MAX_DAILY_ALLOWANCE_DAYS = 2_147_483_647

/**
 * Spec 143 D4: **ausente e inválido são estados diferentes.** Ausente é "a API sugere pela duração";
 * inválido é o operador que digitou algo que não é diária, e precisa ver a recusa em vez de ganhar a
 * estimativa calado no lugar do número dele.
 */
export type DailyAllowanceDaysReading =
  | Readonly<{ of: 'absent' }>
  | Readonly<{ days: number; of: 'informed' }>
  | Readonly<{ of: 'invalid' }>

export function readDailyAllowanceDaysInput(value: string): DailyAllowanceDaysReading {
  const trimmed = value.trim()
  if (trimmed === '') return { of: 'absent' }
  if (!DIGITS_ONLY.test(trimmed)) return { of: 'invalid' }

  const days = Number.parseInt(trimmed, 10)
  if (days < 1 || days > MAX_DAILY_ALLOWANCE_DAYS) return { of: 'invalid' }

  return { days, of: 'informed' }
}

/**
 * A sugestão só existe enquanto a API **estima**: depois que o operador informou, a resposta volta
 * `informed` com o número dele — reoferecê-lo como sugestão seria a tela sugerindo a si mesma.
 */
export function readSuggestedDailyAllowanceDays(
  valuation: null | Readonly<{ costParcels: readonly TripValuationCostParcel[] }>,
): number | undefined {
  if (valuation === null) return undefined

  for (const parcel of valuation.costParcels) {
    const { basis } = parcel
    if (basis === null || basis.of !== 'driver') continue
    if (basis.daysOrigin !== 'estimated' || basis.days < 1) continue
    return basis.days
  }

  return undefined
}

/**
 * Spec 143 D4: o campo abre **preenchido com a sugestão**, e editável. `undefined` é "ninguém digitou
 * ainda"; `''` é o operador que apagou de propósito — e apagado não volta a ser preenchido, ou a
 * tela desfaria o que ele acabou de fazer a cada resposta da prévia.
 */
export function displayDailyAllowanceDays(
  input: Readonly<{ suggestedDays: number | undefined; typed: string | undefined }>,
): string {
  if (input.typed !== undefined) return input.typed
  if (input.suggestedDays === undefined) return ''

  return String(input.suggestedDays)
}
