/* Copyright (c) 2026 Ada Technology. MIT License. */
/* Cópia por valor de apps/frontend-driver/src/modules/driver-trip/shared/pendingQueue.service.ts (ADR-0075 §7). */
import { isAttachmentDiscardable, type AttachmentGroupEntries } from './offlineAttachments.service'
import type { QueuedReport } from './offlineQueue.service'

/**
 * A pendência da fila antiga (ADR-0075 §6, plan D6): a mesma definição da app do motorista, copiada
 * no sentido inverso — o contrato `pending-queue` compara as duas pelo texto. O painel usa `total`
 * para decidir se o motorista já pode ir para a casa nova.
 *
 * A fila daqui não tem dono (`subHash`), então o filtro de `ownerSubHash` da app não vem, e o
 * contrato compara sem ele. Os gatilhos da drenagem também não: a tela de pendências drena pela
 * mesma porta de sempre (`useDriverTrip`).
 */
export type PendingCounts = Readonly<{ drainable: number; rejected: number; total: number }>

export function countPending(input: {
  readonly attachments: AttachmentGroupEntries
  readonly now: Date
  readonly reports: readonly QueuedReport[]
}): PendingCounts {
  let drainable = 0
  let rejected = 0
  let unverified = 0
  /** Anexo parado atrás de um evento que não sobe: pendente (entra no total), não drenável. */
  let blocked = 0
  /**
   * Spec 189 T9.2 (B1): o grupo de anexos espera o evento dele. Evento recusado ou não verificado
   * não sobe na drenagem automática, e os anexos de trás também não — contá-los como drenáveis
   * deixava o relógio de 30 s ligado para sempre.
   */
  const blockedEventKeys = new Set<string>()

  /** N3: a drenagem para no primeiro não verificado do dono — o que vem atrás espera junto. */
  let isBehindUnverified = false

  for (const report of input.reports) {
    const key = report.report.idempotencyKey
    if (report.rejectionCause !== undefined) {
      rejected += 1
      blockedEventKeys.add(key)
    } else if (report.isUnverified === true) {
      unverified += 1
      blockedEventKeys.add(key)
      isBehindUnverified = true
    } else if (isBehindUnverified) {
      blocked += 1
      blockedEventKeys.add(key)
    } else drainable += 1
  }

  for (const [eventKey, items] of input.attachments) {
    const isBlocked = blockedEventKeys.has(eventKey)
    for (const attachment of items) {
      if (attachment.rejectionCause !== undefined) {
        rejected += 1
        continue
      }
      if (attachment.isUnverified === true) {
        unverified += 1
        continue
      }
      if (isAttachmentDiscardable({ attachment, now: input.now })) continue
      if (isBlocked) blocked += 1
      else drainable += 1
    }
  }

  return { drainable, rejected, total: drainable + rejected + unverified + blocked }
}

/** O mesmo intervalo da sonda de reconexão da app do motorista (plan D5, `bootMode.service.ts`). */
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
 * ADR-0075 §6, revisão M4: a b18564bc8 estabilizou as lojas do `useDriverTrip` e, sem querer, tirou
 * o único gatilho de repetição que a tela de pendências tinha — o efeito de montagem que reexecutava
 * a cada render. Estes são os gatilhos explícitos: `online`, `visibilitychange` visível e `pageshow`
 * sempre chamam `drain`. O temporizador de 30 s existe só enquanto `getDrainable()` for maior que
 * zero — cobre o sinal fraco, onde `online` nunca dispara — e se desliga sozinho quando a fila
 * esvazia. "Abertura" é o gatilho de fora: quem monta chama `drain()` uma vez, antes de agendar
 * estes.
 */
export function scheduleQueueDrainTriggers(input: {
  readonly drain: () => void
  readonly getDrainable: () => number
  /**
   * Entrega a quem chama o `sync` do temporizador. Um toque enfileirado com sinal fraco não dispara
   * `online` nem muda a visibilidade: sem este aviso, o temporizador só nasceria no próximo gatilho.
   */
  readonly onQueueSync?: (sync: () => void) => void
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
  input.onQueueSync?.(syncInterval)
  syncInterval()

  return () => {
    input.target.removeEventListener('online', handleOnline)
    input.target.removeEventListener('pageshow', handlePageshow)
    input.target.removeEventListener('visibilitychange', handleVisibilityChange)
    stopInterval()
  }
}
