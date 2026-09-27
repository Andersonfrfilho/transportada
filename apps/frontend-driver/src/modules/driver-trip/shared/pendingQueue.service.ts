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
    if (!isOwned(report)) continue
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
      if (!isOwned(attachment)) continue
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

/** Spec 193 D13: o número do cabeçalho é o `total` do dono — o mesmo que a tela da fila lista. */
export function selectPendingTotal(input: {
  readonly attachments: AttachmentGroupEntries
  readonly now: Date
  readonly ownerSubHash: string
  readonly reports: readonly QueuedReport[]
}): number {
  return countPending(input).total
}

const QUEUE_BADGE_MAX = 99

/** Spec 193 D13: zero não tem selo; acima de 99 o selo não cresce. */
export function formatQueueBadge(total: number): string {
  if (total <= 0) return ''
  if (total > QUEUE_BADGE_MAX) return `${QUEUE_BADGE_MAX}+`
  return String(total)
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

export type DrainScheduler = Readonly<{
  request: (only?: string) => void
  /** Quem roda a drenagem chama isto quando ela termina, dando certo ou não. */
  settled: () => void
}>

/**
 * Uma drenagem por vez (spec 082): duas em paralelo mandariam o mesmo evento duas vezes. O pedido
 * que chega ocupado não é descartado — o geral vira uma repetição, e cada "Enviar agora" (`only`)
 * fica guardado num `Set` e roda na sua vez. Spec 189 T9.2 (M3): a repetição sem `only` engolia o
 * envio manual de um item recusado, que só drena com o `only` dele.
 */
export function createDrainScheduler(input: {
  readonly run: (only: string | undefined) => void
}): DrainScheduler {
  let isRunning = false
  let hasPendingFullDrain = false
  const pendingKeys = new Set<string>()

  function start(only: string | undefined): void {
    isRunning = true
    input.run(only)
  }

  return {
    request(only) {
      if (!isRunning) {
        start(only)
        return
      }
      if (only === undefined) hasPendingFullDrain = true
      else pendingKeys.add(only)
    },
    settled() {
      isRunning = false
      if (hasPendingFullDrain) {
        hasPendingFullDrain = false
        start(undefined)
        return
      }
      const [nextKey] = pendingKeys
      if (nextKey === undefined) return
      pendingKeys.delete(nextKey)
      start(nextKey)
    },
  }
}
