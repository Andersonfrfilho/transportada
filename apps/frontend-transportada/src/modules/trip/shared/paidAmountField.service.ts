/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  maskTypedAmount,
  parseTypedAmount,
  TYPED_MONEY_SCALE,
} from '@/modules/shared/decimalAmount.service'

/**
 * Spec 327: o valor combinado com cada pessoa da viagem, digitado em pt-BR (`1.250,00`). Vazio é
 * "não informado" — a viagem segue com a diária estimada de sempre, nunca com zero.
 */
const PAID_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

export type PaidAmountInputs = Readonly<Record<string, string>>

export function maskPaidAmount(value: string): string {
  return maskTypedAmount({ scale: TYPED_MONEY_SCALE, value })
}

/** O texto decimal da API (`"1250.00"`), ou `undefined` quando o campo está vazio ou inválido. */
export function parsePaidAmount(typed: string): string | undefined {
  if (typed === '') return undefined
  const parsed = parseTypedAmount({ scale: TYPED_MONEY_SCALE, value: typed })
  return PAID_AMOUNT_PATTERN.test(parsed) ? parsed : undefined
}

/**
 * Só quem está na tripulação leva valor: tirar a pessoa da viagem descarta o que se digitou para
 * ela, em vez de mandar uma chave que o servidor não reconheceria.
 */
export function buildPaidAmounts(input: {
  readonly crewIds: readonly string[]
  readonly inputs: PaidAmountInputs
}): Readonly<Record<string, string>> {
  const entries = input.crewIds.flatMap((driverId) => {
    const amount = parsePaidAmount(input.inputs[driverId] ?? '')
    return amount === undefined ? [] : [[driverId, amount] as const]
  })

  return Object.fromEntries(entries)
}
