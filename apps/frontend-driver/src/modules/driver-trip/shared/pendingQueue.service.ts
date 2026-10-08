/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isAwaitingDeliveryKey, type AttachmentGroupEntries } from './offlineAttachments.service'
import type { QueuedReport } from './offlineQueue.service'
import type { DrainOrigin } from './retryBackoff.service'

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
    /** Spec 218: o canhoto de antes da entrega espera o "Confirmar entrega", não a drenagem. */
    const isBlocked = blockedEventKeys.has(eventKey) || isAwaitingDeliveryKey(eventKey)
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
  /** Spec 254: `timer` respeita o espaçamento por item; os demais gatilhos são `immediate`. */
  readonly drain: (origin: DrainOrigin) => void
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
    input.drain('timer')
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
    input.drain('immediate')
    syncInterval()
  }

  function handlePageshow(): void {
    input.drain('immediate')
    syncInterval()
  }

  function handleVisibilityChange(): void {
    if (!input.target.isVisible()) return
    input.drain('immediate')
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
  request: (only: string | undefined, origin: DrainOrigin) => void
  /** Quem roda a drenagem chama isto quando ela termina, dando certo ou não. */
  settled: () => void
}>

/**
 * ⚠️ **Cão de guarda da trava.** O teto é maior que qualquer teto de requisição do cliente (90 s do
 * multipart), de propósito: chegar aqui significa que a drenagem não assentou nem com os tetos de
 * lá — defeito nosso, não rede. Reabrir a trava pode repetir um envio ainda em voo, e é para isso
 * que todo relatório carrega `idempotencyKey` e todo anexo carrega `attachmentKey`; fila trancada
 * até o motorista recarregar o aplicativo é o pior dos dois, e foi o que aconteceu em produção em
 * 02/10 com uma entrega já registrada e o comprovante preso no aparelho.
 */
const DRAIN_WATCHDOG_MILLISECONDS = 180_000

function scheduleWatchdogWithTimer(release: () => void): () => void {
  const timer = setTimeout(release, DRAIN_WATCHDOG_MILLISECONDS)
  /** No navegador não existe; no runner de teste é o que impede um timer de 3 min segurar a saída. */
  ;(timer as unknown as { readonly unref?: () => void }).unref?.()
  return () => clearTimeout(timer)
}

/**
 * Uma drenagem por vez (spec 082): duas em paralelo mandariam o mesmo evento duas vezes. O pedido
 * que chega ocupado não é descartado — o geral vira uma repetição, e cada "Enviar agora" (`only`)
 * fica guardado num `Set` e roda na sua vez. Spec 189 T9.2 (M3): a repetição sem `only` engolia o
 * envio manual de um item recusado, que só drena com o `only` dele.
 *
 * Spec 254: cada pedido carrega a origem; ao juntar dois, `immediate` vence `timer` — senão um "Enviar
 * agora" pedido durante uma drenagem respeitaria o espaçamento.
 */
export function createDrainScheduler(input: {
  readonly run: (only: string | undefined, origin: DrainOrigin) => void
  /** Injetável só para o teste disparar o cão de guarda sem esperar três minutos. */
  readonly scheduleWatchdog?: (release: () => void) => () => void
}): DrainScheduler {
  const scheduleWatchdog = input.scheduleWatchdog ?? scheduleWatchdogWithTimer
  let isRunning = false
  let hasPendingFullDrain = false
  let pendingFullDrainOrigin: DrainOrigin = 'timer'
  let cancelWatchdog: (() => void) | undefined
  /**
   * ⚠️ O cão de guarda cria uma corrida que antes não existia: ele abre a trava e a drenagem
   * seguinte começa, e então a abandonada **termina** e chama `settled()`. Esse `settled()` é de
   * uma drenagem que já não manda em nada — atendê-lo abriria a trava da atual no meio do caminho,
   * que é justamente o reenvio em paralelo que a trava existe para impedir. Cada disparo do cão de
   * guarda abandona exatamente uma drenagem, e o `settled()` dela é engolido.
   */
  let abandonedDrains = 0
  const pendingKeys = new Map<string, DrainOrigin>()

  function start(only: string | undefined, origin: DrainOrigin): void {
    isRunning = true
    cancelWatchdog = scheduleWatchdog(() => {
      abandonedDrains += 1
      settle()
    })
    input.run(only, origin)
  }

  function settle(): void {
    cancelWatchdog?.()
    cancelWatchdog = undefined
    isRunning = false
    if (hasPendingFullDrain) {
      hasPendingFullDrain = false
      const origin = pendingFullDrainOrigin
      pendingFullDrainOrigin = 'timer'
      start(undefined, origin)
      return
    }
    const [next] = pendingKeys
    if (next === undefined) return
    const [nextKey, nextOrigin] = next
    pendingKeys.delete(nextKey)
    start(nextKey, nextOrigin)
  }

  return {
    request(only, origin) {
      if (!isRunning) {
        start(only, origin)
        return
      }
      if (only === undefined) {
        hasPendingFullDrain = true
        if (origin === 'immediate') pendingFullDrainOrigin = 'immediate'
        return
      }
      if (origin === 'immediate' || !pendingKeys.has(only)) pendingKeys.set(only, origin)
    },
    settled() {
      if (abandonedDrains > 0) {
        abandonedDrains -= 1
        return
      }
      settle()
    },
  }
}
