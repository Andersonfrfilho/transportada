/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { EventQueueItemView } from './eventQueueView.service'

/** Um dia: com o app aberto a drenagem tenta a cada 30 s, então parado há mais que isso é anormal. */
export const STALE_PENDING_AFTER_MS = 24 * 60 * 60 * 1000

export type StalePending = Readonly<{ count: number; oldestQueuedAt: string }>

/**
 * Spec 229. O app só envia com ele aberto (sem Background Sync, ADR-0075 §8) e, desde a 227, nada sai
 * da fila por idade. Quem fecha o app sem sinal não tem como saber que o trabalho não chegou ao
 * escritório — este é o dado da faixa que avisa. Recusado e não verificado ficam de fora: já têm
 * aviso e decisão próprios.
 */
export function resolveStalePending(input: {
  readonly items: readonly EventQueueItemView[]
  readonly nowMs: number
}): StalePending | undefined {
  const stale = input.items.flatMap((item) => {
    if (item.status.state === 'rejected' || item.status.state === 'unverified') return []
    const queuedAtMs = Date.parse(item.queuedAt)
    if (!Number.isFinite(queuedAtMs)) return []
    if (input.nowMs - queuedAtMs <= STALE_PENDING_AFTER_MS) return []
    return [{ queuedAt: item.queuedAt, queuedAtMs }]
  })
  const [oldest] = [...stale].sort((first, second) => first.queuedAtMs - second.queuedAtMs)
  if (oldest === undefined) return undefined

  return { count: stale.length, oldestQueuedAt: oldest.queuedAt }
}

/**
 * A hora sozinha engana num item de dois dias atrás ("03:34 PM" soa como hoje): item de outro dia
 * leva a data.
 */
export function formatQueuedAt(input: {
  readonly nowMs: number
  readonly queuedAt: string
}): string {
  const queuedAt = new Date(input.queuedAt)
  const time = queuedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const isSameDay = queuedAt.toDateString() === new Date(input.nowMs).toDateString()
  if (isSameDay) return time

  return `${queuedAt.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${time}`
}
