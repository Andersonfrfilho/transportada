/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  AMOUNT_DISPLAY_SCALE,
  AMOUNT_MAX_SCALE,
  parseTypedAmount,
  toTypedAmountKeepingZero,
} from '@/modules/shared/decimalAmount.service'

/** A API grava a diária com quatro casas; o campo mostra duas, como a diária própria da ficha. */
export function toHelperDailyRateDraft(helperDailyRate: null | string): string {
  if (helperDailyRate === null) return ''

  return toTypedAmountKeepingZero({ scale: AMOUNT_DISPLAY_SCALE, value: helperDailyRate })
}

/** Campo vazio limpa a diária geral: `null` é a resposta da API para "sem valor padrão". */
export function toHelperDailyRateBody(draft: string): null | string {
  if (draft.trim() === '') return null

  return parseTypedAmount({ scale: AMOUNT_MAX_SCALE, value: draft })
}
