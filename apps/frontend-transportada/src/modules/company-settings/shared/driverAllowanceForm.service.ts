/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  AMOUNT_DISPLAY_SCALE,
  AMOUNT_MAX_SCALE,
  maskTypedAmount,
  parseTypedAmount,
  toTypedAmount,
} from '@/modules/shared/decimalAmount.service'

import type { DriverAllowanceSettings } from './driverAllowance.validation'

/** Zero não é diária: o `CHECK` do banco exige `> 0`, e recusado lá vira 400 sem frase na tela. */
const NON_ZERO_DIGIT = /[1-9]/u

/** O gravado abre o campo já na máscara — reabrir a aba não pode reescrever o que está lá. */
export function startDriverAllowanceDraft(stored: DriverAllowanceSettings | undefined): string {
  if (stored === undefined) return ''

  return maskTypedAmount({
    scale: AMOUNT_DISPLAY_SCALE,
    value: toTypedAmount({ scale: AMOUNT_DISPLAY_SCALE, value: stored.amount }),
  })
}

/**
 * A máscara é a única escrita do campo. Sem ela o passo normal da digitação — `200,`, `R$ 200,00`,
 * a vírgula sozinha — chega cru ao parse, que **lança** no meio do `onChange` e apaga a tela.
 */
export function typeDriverAllowanceAmount(text: string): string {
  return maskTypedAmount({ scale: AMOUNT_DISPLAY_SCALE, value: text })
}

/** `null` enquanto o campo não forma uma diária: vazio, zero, ou texto que a API recusaria. */
export function buildDriverAllowanceSubmission(typed: string): null | string {
  let amount: string
  try {
    amount = parseTypedAmount({ scale: AMOUNT_MAX_SCALE, value: typed })
  } catch {
    return null
  }

  return NON_ZERO_DIGIT.test(amount) ? amount : null
}
