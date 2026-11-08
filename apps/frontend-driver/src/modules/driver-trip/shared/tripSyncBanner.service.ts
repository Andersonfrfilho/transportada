/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CANHOTO_ALREADY_ATTACHED_CODE } from './canhotoReplacePrompt.service'
import type { EventQueueItemView } from './eventQueueView.service'
import { OUT_OF_ORDER_CODE } from './outOfOrderPrompt.service'
import { resolveRejectionCauseCode } from './rejectionCauseLabel.service'

/**
 * Pedido do usuário (15/10): a viagem diz "Sincronizando eventos" enquanto houver evento na fila e
 * "Sincronizado" quando ela esvazia. Entram todos os kinds da fila (chegada, saída, entrega, devolução,
 * ocorrência, foto/assinatura do canhoto, despacho). O recusado fica à parte — nunca vira "Sincronizado" —
 * e o `unverified` espera a confirmação do dono (tem aviso próprio), então não conta como envio em curso.
 */
export type TripSyncBannerState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'rejected'; rejected: number; syncing: number }>
  | Readonly<{ kind: 'synced' }>
  | Readonly<{ kind: 'syncing'; syncing: number }>

export function countSyncingEvents(queueView: readonly EventQueueItemView[]): number {
  return queueView.filter(
    (item) => item.status.state === 'queued' || item.status.state === 'failed',
  ).length
}

/** Spec 294 RF26/RF27: o 409 que só pede a confirmação do motorista — tem diálogo próprio, não é recusa. */
const CONFIRMATION_CAUSE_CODES: ReadonlySet<string> = new Set([
  CANHOTO_ALREADY_ATTACHED_CODE,
  OUT_OF_ORDER_CODE,
])

export function isAwaitingDriverConfirmation(item: EventQueueItemView): boolean {
  return (
    item.status.state === 'rejected' &&
    CONFIRMATION_CAUSE_CODES.has(resolveRejectionCauseCode(item.status.cause))
  )
}

export function countRejectedEvents(queueView: readonly EventQueueItemView[]): number {
  return queueView.filter(
    (item) => item.status.state === 'rejected' && !isAwaitingDriverConfirmation(item),
  ).length
}

export function resolveTripSyncBanner(input: {
  /** A fila já teve evento em curso nesta sessão e acabou de esvaziar (a tela segura isto por alguns segundos). */
  readonly justSynced: boolean
  readonly queueView: readonly EventQueueItemView[]
}): TripSyncBannerState {
  const syncing = countSyncingEvents(input.queueView)
  const rejected = countRejectedEvents(input.queueView)
  if (rejected > 0) return { kind: 'rejected', rejected, syncing }
  if (syncing > 0) return { kind: 'syncing', syncing }
  return input.justSynced ? { kind: 'synced' } : { kind: 'idle' }
}

/**
 * Pedido do usuário (16/10): a faixa ganha barra de progresso. Indeterminada enquanto a fila tem um
 * item só (não há o que contar); determinada quando a fila chegou a ter mais de um — o total é o
 * maior tamanho visto desde que o envio começou e o que já saiu é total menos o que resta. Quando
 * "Sincronizado" aparece a barra completa.
 */
export type TripSyncProgress =
  | Readonly<{ kind: 'determinate'; percent: number }>
  | Readonly<{ kind: 'indeterminate' }>

export function resolveTripSyncProgress(input: {
  /** O maior número de eventos em curso visto desde que o envio começou. */
  readonly peak: number
  readonly remaining: number
  readonly synced: boolean
}): TripSyncProgress {
  if (input.synced) return { kind: 'determinate', percent: 100 }
  if (input.peak <= 1) return { kind: 'indeterminate' }
  const done = Math.max(0, input.peak - Math.max(0, input.remaining))
  return { kind: 'determinate', percent: Math.min(100, Math.round((done / input.peak) * 100)) }
}
