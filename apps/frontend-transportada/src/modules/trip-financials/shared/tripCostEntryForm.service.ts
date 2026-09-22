/* Copyright (c) 2026 Ada Technology. MIT License. */
import { AMOUNT_MAX_SCALE, parseTypedAmount } from '@/modules/shared/decimalAmount.service'

import type { TripCostEntryKind } from './tripFinancials.types'

/** O servidor corta a descrição em 200; o campo avisa antes de o envio virar 400. */
export const TRIP_COST_ENTRY_DESCRIPTION_MAX_LENGTH = 200

/**
 * ⚠️ Cópia por valor do `AMOUNT_PATTERN` da API — o bundle não carrega código de lá, e valor que
 * passasse aqui e falhasse lá viraria 400 sem explicação nenhuma na tela.
 */
const API_AMOUNT_PATTERN = /^[0-9]{1,13}(\.[0-9]{1,4})?$/u
/** Zero não é custo: o `CHECK ("amount" > 0)` do banco o recusa, e recusado tarde é 500. */
const NON_ZERO_DIGIT = /[1-9]/u

export type TripCostEntryFormFields = Readonly<{
  amount: string
  description: string
  kind: TripCostEntryKind
}>

export type TripCostEntryFormIssue = 'amountInvalid' | 'amountRequired' | 'descriptionTooLong'

export type TripCostEntryBody = Readonly<{
  amount: string
  description: string
  kind: TripCostEntryKind
}>

export const EMPTY_TRIP_COST_ENTRY_FORM: TripCostEntryFormFields = {
  amount: '',
  description: '',
  kind: 'toll',
}

/**
 * O que o operador digitou em pt-BR vira o decimal da API. ⚠️ `1.234,56` é mil duzentos e trinta e
 * quatro — trocar a vírgula por ponto à mão produziria `1.234.56`, que a API recusa.
 */
export function toTripCostEntryBody(fields: TripCostEntryFormFields): TripCostEntryBody {
  return {
    amount: parseTypedAmount({ scale: AMOUNT_MAX_SCALE, value: fields.amount }),
    description: fields.description.trim(),
    kind: fields.kind,
  }
}

export function validateTripCostEntryForm(
  fields: TripCostEntryFormFields,
): readonly TripCostEntryFormIssue[] {
  const issues: TripCostEntryFormIssue[] = []
  const amount = toApiAmount(fields.amount)

  if (amount === null) issues.push('amountInvalid')
  else if (!NON_ZERO_DIGIT.test(amount)) issues.push('amountRequired')

  if (fields.description.trim().length > TRIP_COST_ENTRY_DESCRIPTION_MAX_LENGTH) {
    issues.push('descriptionTooLong')
  }

  return issues
}

function toApiAmount(typed: string): null | string {
  let amount: string
  try {
    amount = parseTypedAmount({ scale: AMOUNT_MAX_SCALE, value: typed })
  } catch {
    return null
  }

  return API_AMOUNT_PATTERN.test(amount) ? amount : null
}
