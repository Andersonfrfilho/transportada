/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isAttachmentDiscardable, type AttachmentGroupEntries } from './offlineAttachments.service'
import type { QueuedReport } from './offlineQueue.service'

/**
 * A pendência da fila (plan D5): quanto falta enviar. `drainable` alimenta o temporizador da
 * drenagem — ele só existe enquanto há algo a mandar — e `total` é o que a tela mostra ao
 * motorista. `pendingQueue.service.ts` do painel é a mesma definição, cópia por valor no sentido
 * inverso (T5.2): o painel não tem `subHash`, então chama sem `ownerSubHash`.
 */
export type PendingCounts = Readonly<{ drainable: number; rejected: number; total: number }>

export function countPending(input: {
  readonly attachments: AttachmentGroupEntries
  readonly now: Date
  /** ADR-0075 §8: informado, item de outra conta não entra em nenhuma contagem. */
  readonly ownerSubHash?: string
  readonly reports: readonly QueuedReport[]
}): PendingCounts {
  const isOwned = (item: Readonly<{ subHash?: string }>): boolean =>
    input.ownerSubHash === undefined || item.subHash === input.ownerSubHash

  let drainable = 0
  let rejected = 0

  for (const report of input.reports) {
    if (!isOwned(report)) continue
    if (report.rejectionCause === undefined) drainable += 1
    else rejected += 1
  }

  for (const [, items] of input.attachments) {
    for (const attachment of items) {
      if (!isOwned(attachment)) continue
      if (attachment.rejectionCause !== undefined) {
        rejected += 1
        continue
      }
      if (isAttachmentDiscardable({ attachment, now: input.now })) continue
      drainable += 1
    }
  }

  return { drainable, rejected, total: drainable + rejected }
}

/** O mesmo intervalo da sonda de reconexão (plan D5, `bootMode.service.ts`). */
export const QUEUE_DRAIN_INTERVAL_MS = 30_000

type DrainEventType = 'online' | 'pageshow' | 'visibilitychange'

export type DrainTriggerTarget = Readonly<{
  addEventListener: (type: DrainEventType, listener: () => void) => void
  clearInterval: (id: number) => void
  isVisible: () => boolean
  removeEventListener: (type: DrainEventType, listener: () => void) => void
  setInterval: (handler: () => void, timeout: number) => number
}>

/**
 * Gatilhos da drenagem (plan D5, `useDriverTrip.hook.ts`): `online`, `visibilitychange` visível e
 * `pageshow` sempre chamam `drain`. O temporizador de 30 s existe só enquanto `getDrainable()` for
 * maior que zero — ele cobre o sinal fraco, onde `online` nunca dispara (o mesmo problema que
 * `scheduleAuthenticationOnReconnect`, de `bootMode.service.ts`, resolve para a reautenticação) — e
 * se desliga sozinho quando a fila esvazia. "Abertura" é o gatilho de fora: quem monta chama
 * `drain()` uma vez, antes de agendar estes.
 */
export function scheduleQueueDrainTriggers(input: {
  readonly drain: () => void
  readonly getDrainable: () => number
  readonly target: DrainTriggerTarget
}): () => void {
  let intervalId: number | undefined

  function stopInterval(): void {
    if (intervalId === undefined) return
    input.target.clearInterval(intervalId)
    intervalId = undefined
  }

  function tick(): void {
    input.drain()
    if (input.getDrainable() <= 0) stopInterval()
  }

  function syncInterval(): void {
    if (input.getDrainable() <= 0) {
      stopInterval()
      return
    }
    intervalId ??= input.target.setInterval(tick, QUEUE_DRAIN_INTERVAL_MS)
  }

  function handleOnline(): void {
    input.drain()
    syncInterval()
  }

  function handlePageshow(): void {
    input.drain()
    syncInterval()
  }

  function handleVisibilityChange(): void {
    if (!input.target.isVisible()) return
    input.drain()
    syncInterval()
  }

  input.target.addEventListener('online', handleOnline)
  input.target.addEventListener('pageshow', handlePageshow)
  input.target.addEventListener('visibilitychange', handleVisibilityChange)
  syncInterval()

  return () => {
    input.target.removeEventListener('online', handleOnline)
    input.target.removeEventListener('pageshow', handlePageshow)
    input.target.removeEventListener('visibilitychange', handleVisibilityChange)
    stopInterval()
  }
}
