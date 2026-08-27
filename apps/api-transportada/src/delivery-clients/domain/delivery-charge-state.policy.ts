/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DeliveryChargeOrigin,
  DeliveryChargeStatus,
} from '../../database/delivery-client.schema.js'

/**
 * ADR-0048 §5: o ciclo do repasse é dinheiro entre duas empresas, e cada passo tem dono.
 *
 * ```
 * suggested → recorded → submitted → approved  → reimbursed
 *     ↓                      ↓
 * dismissed              rejected
 * ```
 *
 * Duas travas que a máquina existe para garantir, e que nenhum `if` espalhado garantiria:
 *
 * 1. **`submitted` é inalcançável sem passar por `recorded`.** Sugestão que virasse lote seria taxa
 *    cobrada de outra empresa sem ninguém conferir — e o erro só apareceria no fechamento.
 * 2. **`rejected` e `dismissed` não voltam.** A taxa recusada fica visível como perda; ressuscitá-la
 *    por uma transição faria a mesma cobrança ir duas vezes ao contratante.
 */
export const DELIVERY_CHARGE_ACTIONS = [
  'confirm',
  'dismiss',
  'submit',
  'approve',
  'reject',
  'reimburse',
] as const
export type DeliveryChargeAction = (typeof DELIVERY_CHARGE_ACTIONS)[number]

const TRANSITIONS: Readonly<Record<DeliveryChargeAction, {
  readonly from: readonly DeliveryChargeStatus[]
  readonly to: DeliveryChargeStatus
}>> = Object.freeze({
  approve: { from: ['submitted'], to: 'approved' },
  /** Confirmar é o toque de gente que transforma proposta em fato. Só o proposto pode ser confirmado. */
  confirm: { from: ['suggested'], to: 'recorded' },
  dismiss: { from: ['suggested'], to: 'dismissed' },
  reimburse: { from: ['approved'], to: 'reimbursed' },
  reject: { from: ['submitted'], to: 'rejected' },
  submit: { from: ['recorded'], to: 'submitted' },
})

export const DELIVERY_CHARGE_TRANSITION_REFUSALS = {
  /** O estado atual não permite a ação — e a mensagem diz de onde para onde ela iria. */
  notAllowed: 'DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED',
} as const

export type DeliveryChargeTransition =
  | { readonly kind: 'changed'; readonly to: DeliveryChargeStatus }
  /** Repetir a mesma ação converge em vez de estourar: a rede cai, o operador toca duas vezes. */
  | { readonly kind: 'unchanged'; readonly to: DeliveryChargeStatus }
  | { readonly code: string; readonly kind: 'refused' }

export function checkDeliveryChargeTransition(input: {
  readonly action: DeliveryChargeAction
  readonly status: DeliveryChargeStatus
}): DeliveryChargeTransition {
  const transition = TRANSITIONS[input.action]
  if (input.status === transition.to) return { kind: 'unchanged', to: transition.to }
  if (!transition.from.includes(input.status)) {
    return { code: DELIVERY_CHARGE_TRANSITION_REFUSALS.notAllowed, kind: 'refused' }
  }

  return { kind: 'changed', to: transition.to }
}

/**
 * ADR-0048 §5: **só o que nasceu automático nasce proposto.** Lançamento manual é feito por gente
 * olhando o comprovante, e obrigá-lo a passar por uma confirmação seria pedir que a mesma pessoa
 * confirmasse o que ela acabou de digitar.
 */
export function resolveInitialChargeStatus(origin: DeliveryChargeOrigin): DeliveryChargeStatus {
  return origin === 'manual' ? 'recorded' : 'suggested'
}

/**
 * O que entra num lote de repasse. `suggested` fica de fora **e não some**: ela continua na fila de
 * conferência, visível como pendência, e entra no lote do período seguinte se alguém confirmar.
 */
export function isChargeBatchable(status: DeliveryChargeStatus): boolean {
  return status === 'recorded'
}
