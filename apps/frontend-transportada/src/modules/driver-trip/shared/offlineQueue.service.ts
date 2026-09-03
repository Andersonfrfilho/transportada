/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverFieldReport } from './driverTrip.types'

/**
 * ADR-0045 §5: o motorista entra no subsolo do shopping e sai sem sinal por vinte minutos. Se o
 * toque em "entreguei" falhar ali, ele para de usar o produto no mesmo dia.
 *
 * Duas regras que fazem isto funcionar de verdade:
 *
 * - **A tela diz a verdade.** Item na fila é "aguardando envio", nunca "enviado". Mentir sobre
 *   sincronização é pior do que não ter offline — o motorista confia uma vez.
 * - **A chave é gerada no toque e não muda no reenvio.** Gerá-la na hora do envio faria cada
 *   tentativa parecer uma confirmação nova, e a idempotência do servidor não teria o que casar.
 *
 * O armazenamento entra por parâmetro porque IndexedDB não existe fora do navegador — e uma fila que
 * só se prova clicando não se prova.
 */
export type QueuedReport = Readonly<{
  /** Quantas vezes a drenagem já tentou e a rede recusou. Falha do servidor não conta aqui. */
  attempts: number
  createdAt: string
  /**
   * Spec 082 D7: a causa legível da recusa do servidor. Preenchida, o item fica **à vista** como
   * rejeitado em vez de sumir — e só o envio manual o tenta de novo (limpando a causa antes).
   */
  rejectionCause?: string
  report: DriverFieldReport
}>

export type OfflineQueueStore = Readonly<{
  read: () => Promise<readonly QueuedReport[]>
  /**
   * Leitura e escrita na **mesma** transação do armazenamento: `mutate` é síncrona e recebe o que
   * está gravado agora. Ler, esperar a rede e sobrescrever perdia o toque enfileirado no meio.
   */
  update: (
    mutate: (items: readonly QueuedReport[]) => readonly QueuedReport[],
  ) => Promise<readonly QueuedReport[]>
}>

/**
 * Spec 082 (revisão): o teto da fila de eventos é declarado e recusado **antes** de escrever —
 * nunca um `QuotaExceededError` cru estourando no meio da rua.
 */
export const EVENT_QUEUE_LIMIT = { maxCount: 200 } as const

export type EventQueueLimits = Readonly<{ maxCount: number }>

export type EnqueueReportResult =
  | Readonly<{ accepted: false; reason: 'count-limit' }>
  | Readonly<{ accepted: true; queue: readonly QueuedReport[] }>

export type DrainOutcome = 'failed-network' | 'rejected' | 'sent'

export type DrainResult = Readonly<{
  /** Recusados pelo servidor: saem da fila e viram conflito à vista, nunca sumiço em silêncio. */
  rejected: readonly QueuedReport[]
  remaining: number
  sent: number
}>

export async function enqueueReport(input: {
  readonly limits?: EventQueueLimits
  readonly now: Date
  readonly report: DriverFieldReport
  readonly store: OfflineQueueStore
}): Promise<EnqueueReportResult> {
  const limits = input.limits ?? EVENT_QUEUE_LIMIT
  let refused = false

  const queue = await input.store.update((queued) => {
    /** O mesmo toque reenviado pela tela não entra duas vezes: a chave é a identidade do item. */
    if (queued.some((item) => item.report.idempotencyKey === input.report.idempotencyKey)) {
      return queued
    }
    if (queued.length + 1 > limits.maxCount) {
      refused = true
      return queued
    }
    return [...queued, { attempts: 0, createdAt: input.now.toISOString(), report: input.report }]
  })

  return refused ? { accepted: false, reason: 'count-limit' } : { accepted: true, queue }
}

/**
 * A ordem importa: chegada antes de entrega, entrega antes da próxima chegada. Drenar em paralelo
 * entregaria numa parada onde o servidor ainda não sabe que o motorista chegou.
 *
 * Falha de **rede** para a drenagem inteira e devolve o resto para a próxima tentativa — insistir
 * item a item sem sinal só gasta bateria. Recusa do **servidor** tira o item da fila: reenviar o que
 * ele já disse que não aceita repetiria a recusa para sempre.
 */
export async function drainQueue(input: {
  readonly send: (report: DriverFieldReport) => Promise<DrainOutcome>
  readonly store: OfflineQueueStore
}): Promise<DrainResult> {
  const queued = await input.store.read()
  const rejected: QueuedReport[] = []
  const settledKeys = new Set<string>()
  let failedKey: string | undefined
  let sent = 0

  for (const item of queued) {
    const outcome = await input.send(item.report)
    if (outcome === 'failed-network') {
      // Só o item que a rede recusou conta uma tentativa: os de trás nem chegaram a ser enviados.
      failedKey = item.report.idempotencyKey
      break
    }
    if (outcome === 'rejected') rejected.push(item)
    else sent += 1
    settledKeys.add(item.report.idempotencyKey)
  }

  /** A reconciliação é por chave, na mesma transação: toque enfileirado durante o envio fica. */
  const remaining = await input.store.update((current) =>
    current.flatMap((item) => {
      const key = item.report.idempotencyKey
      if (settledKeys.has(key)) return []
      if (key === failedKey) return [{ ...item, attempts: item.attempts + 1 }]
      return [item]
    }),
  )

  return { rejected, remaining: remaining.length, sent }
}

/** Chave do toque: opaca, gerada uma vez, e é o que o servidor casa no reenvio. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID()
}
