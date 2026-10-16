/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { EventQueueItemView } from './eventQueueView.service'

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

export function resolveTripSyncBanner(input: {
  /** A fila já teve evento em curso nesta sessão e acabou de esvaziar (a tela segura isto por alguns segundos). */
  readonly justSynced: boolean
  readonly queueView: readonly EventQueueItemView[]
}): TripSyncBannerState {
  const syncing = countSyncingEvents(input.queueView)
  const rejected = input.queueView.filter((item) => item.status.state === 'rejected').length
  if (rejected > 0) return { kind: 'rejected', rejected, syncing }
  if (syncing > 0) return { kind: 'syncing', syncing }
  return input.justSynced ? { kind: 'synced' } : { kind: 'idle' }
}
