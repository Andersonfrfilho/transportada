/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeliveryCharge } from './extraCharges.types'

export type ChargeDraft = Readonly<{ amount: string; isSelected: boolean }>

export type ChargeQueueDraft = Readonly<Record<string, ChargeDraft>>

/**
 * Spec 060 D4b: a fila é "12 taxas sugeridas hoje" — conferir e confirmar **em lote**, com o valor
 * editável na hora. O rascunho vive fora da resposta da API porque o operador corrige o valor antes
 * de confirmar, e recarregar a lista no meio disso apagaria o que ele digitou.
 */
export function buildQueueDraft(charges: readonly DeliveryCharge[]): ChargeQueueDraft {
  return Object.fromEntries(
    charges.map((charge) => [charge.id, { amount: charge.amount, isSelected: false }]),
  )
}

export function toggleCharge(draft: ChargeQueueDraft, id: string): ChargeQueueDraft {
  const current = draft[id]
  if (current === undefined) return draft
  return { ...draft, [id]: { ...current, isSelected: !current.isSelected } }
}

export function changeChargeAmount(
  draft: ChargeQueueDraft,
  input: Readonly<{ amount: string; id: string }>,
): ChargeQueueDraft {
  const current = draft[input.id]
  if (current === undefined) return draft
  return { ...draft, [input.id]: { ...current, amount: input.amount } }
}

/**
 * Só vai o que foi marcado, e o valor **só viaja quando mudou**: mandar o mesmo valor de volta faria
 * a trilha registrar uma edição que ninguém fez.
 */
export function selectedConfirmations(
  charges: readonly DeliveryCharge[],
  draft: ChargeQueueDraft,
): readonly Readonly<{ amount?: string; id: string }>[] {
  return charges
    .filter((charge) => draft[charge.id]?.isSelected === true)
    .map((charge) => {
      const amount = draft[charge.id]?.amount ?? charge.amount
      return amount === charge.amount ? { id: charge.id } : { amount, id: charge.id }
    })
}

/** Sugestão nascida de ocorrência chega **sem valor**, e confirmar assim seria cobrar zero real. */
export function findMissingAmount(
  charges: readonly DeliveryCharge[],
  draft: ChargeQueueDraft,
): DeliveryCharge | undefined {
  return charges.find(
    (charge) =>
      draft[charge.id]?.isSelected === true && isZeroAmount(draft[charge.id]?.amount ?? '0'),
  )
}

function isZeroAmount(amount: string): boolean {
  return /^0*(\.0*)?$/u.test(amount.trim())
}
