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
  report: DriverFieldReport
}>

export type OfflineQueueStore = Readonly<{
  read: () => Promise<readonly QueuedReport[]>
  write: (items: readonly QueuedReport[]) => Promise<void>
}>

export type DrainOutcome = 'failed-network' | 'rejected' | 'sent'

export type DrainResult = Readonly<{
  /** Recusados pelo servidor: saem da fila e viram conflito à vista, nunca sumiço em silêncio. */
  rejected: readonly QueuedReport[]
  remaining: number
  sent: number
}>

export async function enqueueReport(input: {
  readonly now: Date
  readonly report: DriverFieldReport
  readonly store: OfflineQueueStore
}): Promise<readonly QueuedReport[]> {
  const queued = await input.store.read()
  /** O mesmo toque reenviado pela tela não entra duas vezes: a chave é a identidade do item. */
  if (queued.some((item) => item.report.idempotencyKey === input.report.idempotencyKey)) {
    return queued
  }

  const next = [
    ...queued,
    { attempts: 0, createdAt: input.now.toISOString(), report: input.report },
  ]
  await input.store.write(next)

  return next
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
  let sent = 0
  let index = 0

  while (index < queued.length) {
    const item = queued[index]
    if (item === undefined) break

    const outcome = await input.send(item.report)
    if (outcome === 'failed-network') break

    if (outcome === 'rejected') rejected.push(item)
    else sent += 1
    index += 1
  }

  // Só o item que a rede recusou conta uma tentativa: os de trás nem chegaram a ser enviados.
  const remaining = queued
    .slice(index)
    .map((item, position) => (position === 0 ? { ...item, attempts: item.attempts + 1 } : item))
  await input.store.write(remaining)

  return { rejected, remaining: remaining.length, sent }
}

/** Chave do toque: opaca, gerada uma vez, e é o que o servidor casa no reenvio. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID()
}
