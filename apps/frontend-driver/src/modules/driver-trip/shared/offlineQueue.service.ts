/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/offlineQueue.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { toEventClockStamp, type StampedReport } from './clockOffset.service'
import { isRetryDue, type DrainOrigin } from './retryBackoff.service'
import type {
  DriverFieldReport,
  DriverOccurrencePhoto,
  DriverReportedLocation,
} from './driverTrip.types'

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

/**
 * Spec 206 D9: `error.details` da API (`shared/api.error.ts`) — lista de `{field, message}`, nunca
 * um objeto solto. O `409 TRIP_HAS_STOP_EN_ROUTE` manda `enRouteStopId`/`enRouteStopSequence` aqui.
 */
export type DriverTripErrorDetail = Readonly<{ field: string; message: string }>

export type QueuedReport = Readonly<{
  /** Quantas vezes a drenagem já tentou e a rede recusou. Falha do servidor não conta aqui. */
  attempts: number
  /**
   * Spec 234 D2: o desvio do relógio medido quando o toque nasceu — nunca o da hora do envio. Junto
   * do `createdAt` (a hora do aparelho no toque) é o que o servidor usa para chegar ao momento do
   * evento. Ausente: item criado antes de qualquer resposta da API, ou antes da spec.
   */
  clockOffsetMs?: number
  createdAt: string
  /**
   * Spec 189 T9.2 ("Confirmar em lote"): gravado no boot sem rede, sem token — a drenagem não envia
   * até o dono autenticado confirmar (`unverifiedPending.service.ts`).
   */
  isUnverified?: true
  /** Spec 254: quando a rede recusou a última tentativa — a base do espaçamento do temporizador. */
  lastAttemptAt?: string
  /**
   * Spec 082 D7: a causa legível da recusa do servidor. Preenchida, o item fica **à vista** como
   * rejeitado em vez de sumir — e só o envio manual o tenta de novo (limpando a causa antes).
   */
  rejectionCause?: string
  /**
   * Spec 206 D9/RF8b: os detalhes do `error.details` da recusa — hoje só usados pelo
   * `409 TRIP_HAS_STOP_EN_ROUTE`, para o motivo/atalho da fila nomear a parada certa quando a tela
   * não viu o bloqueio (outro aparelho, item enfileirado antes do snapshot).
   */
  rejectionDetails?: readonly DriverTripErrorDetail[]
  report: DriverFieldReport
  /**
   * ADR-0075 §8: `SHA-256(sub)` de quem tocou. A drenagem só envia os do `sub` autenticado — o toque
   * de outra conta no mesmo aparelho nunca sai com o token desta (`queueOwner.service.ts`).
   */
  subHash?: string
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

/** Qual tentativa é esta: só rotula o diagnóstico (spec 254), nunca decide nada. */
export type DrainSendOptions = Readonly<{ attempt: number }>

export type DrainOutcome = 'failed-network' | 'rejected' | 'sent'

export type DrainResult = Readonly<{
  /** Recusados pelo servidor: saem da fila e viram conflito à vista, nunca sumiço em silêncio. */
  rejected: readonly QueuedReport[]
  remaining: number
  sent: number
}>

export async function enqueueReport(input: {
  /** Spec 234 D2: o desvio do relógio de agora, carimbado no item; `undefined` é "ainda não medido". */
  readonly clockOffsetMs?: number | undefined
  /** Boot sem rede (`canSync: false`): o item espera a confirmação do dono para subir. */
  readonly isUnverified?: boolean
  readonly limits?: EventQueueLimits
  readonly now: Date
  readonly report: DriverFieldReport
  readonly store: OfflineQueueStore
  readonly subHash?: string
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
    return [
      ...queued,
      {
        attempts: 0,
        ...(input.clockOffsetMs === undefined ? {} : { clockOffsetMs: input.clockOffsetMs }),
        createdAt: input.now.toISOString(),
        ...(input.isUnverified === true ? { isUnverified: true as const } : {}),
        report: input.report,
        ...(input.subHash === undefined ? {} : { subHash: input.subHash }),
      },
    ]
  })

  return refused ? { accepted: false, reason: 'count-limit' } : { accepted: true, queue }
}

/**
 * Spec 179 (T303): vários itens do **mesmo toque** — "Não entreguei" é a ocorrência com foto e a
 * devolução. Entram todos ou nenhum, na ordem dada, numa transação só: metade na fila deixaria a
 * nota devolvida sem a prova, ou a prova sem a devolução.
 */
export async function enqueueReports(input: {
  readonly clockOffsetMs?: number | undefined
  readonly isUnverified?: boolean
  readonly limits?: EventQueueLimits
  readonly now: Date
  readonly reports: readonly DriverFieldReport[]
  readonly store: OfflineQueueStore
  readonly subHash?: string
}): Promise<EnqueueReportResult> {
  const limits = input.limits ?? EVENT_QUEUE_LIMIT
  let refused = false

  const queue = await input.store.update((queued) => {
    const queuedKeys = new Set(queued.map((item) => item.report.idempotencyKey))
    const fresh = input.reports.filter((report) => !queuedKeys.has(report.idempotencyKey))
    if (queued.length + fresh.length > limits.maxCount) {
      refused = true
      return queued
    }
    return [
      ...queued,
      ...fresh.map((report) => ({
        attempts: 0,
        ...(input.clockOffsetMs === undefined ? {} : { clockOffsetMs: input.clockOffsetMs }),
        createdAt: input.now.toISOString(),
        ...(input.isUnverified === true ? { isUnverified: true as const } : {}),
        report,
        ...(input.subHash === undefined ? {} : { subHash: input.subHash }),
      })),
    ]
  })

  return refused ? { accepted: false, reason: 'count-limit' } : { accepted: true, queue }
}

/**
 * Spec 179 (e 209, a foto do "Deu problema"): os bytes de foto que os itens da fila carregam. Contam no mesmo teto dos anexos
 * (`ATTACHMENT_QUEUE_LIMIT.maxTotalBytes`) — é o mesmo aparelho e a mesma cota.
 */
export function sumReportPhotoBytes(reports: readonly DriverFieldReport[]): number {
  return reports.reduce(
    (total, report) =>
      total + listReportPhotos(report).reduce((bytes, photo) => bytes + photo.blob.size, 0),
    0,
  )
}

/**
 * Tudo o que o item carrega como arquivo: a foto, e — spec 246 — as demais fotos e a assinatura da
 * ocorrência de nota, que moram no mesmo item e contam na mesma cota.
 */
export function listReportPhotos(report: DriverFieldReport): readonly DriverOccurrencePhoto[] {
  if (report.kind === 'documentOccurrence') {
    return [
      ...(report.photo === null ? [] : [report.photo]),
      ...(report.extraPhotos ?? []),
      ...(report.signature === undefined ? [] : [report.signature]),
    ]
  }
  return report.kind === 'stopOccurrencePhoto' ? [report.photo] : []
}

/**
 * A ordem importa: chegada antes de entrega, entrega antes da próxima chegada. Drenar em paralelo
 * entregaria numa parada onde o servidor ainda não sabe que o motorista chegou.
 *
 * Falha de **rede** para a drenagem inteira e devolve o resto para a próxima tentativa — insistir
 * item a item sem sinal só gasta bateria. Recusa do **servidor** tira o item da fila: reenviar o que
 * ele já disse que não aceita repetiria a recusa para sempre.
 *
 * Spec 254: na origem `timer`, o primeiro item ainda em espera **para** a drenagem — sem contar
 * tentativa e sem pular (a ordem importa) —; `immediate` ignora o espaçamento. Nada sai da fila por
 * isso (spec 227 D1).
 */
export async function drainQueue(input: {
  readonly now?: Date
  readonly origin: DrainOrigin
  readonly random?: () => number
  readonly send: (stamped: StampedReport, options: DrainSendOptions) => Promise<DrainOutcome>
  readonly store: OfflineQueueStore
}): Promise<DrainResult> {
  const readClock = (): Date => input.now ?? new Date()
  const queued = await input.store.read()
  const rejected: QueuedReport[] = []
  const settledKeys = new Set<string>()
  let failedKey: string | undefined
  let failedAt: string | undefined
  let sent = 0

  for (const item of queued) {
    if (input.origin === 'timer' && !isRetryDue({ item, now: readClock(), random: input.random })) {
      break
    }
    const outcome = await input.send(
      { report: item.report, stamp: toEventClockStamp(item) },
      { attempt: item.attempts + 1 },
    )
    if (outcome === 'failed-network') {
      // Só o item que a rede recusou conta uma tentativa: os de trás nem chegaram a ser enviados.
      failedKey = item.report.idempotencyKey
      failedAt = readClock().toISOString()
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
      if (key === failedKey && failedAt !== undefined) {
        return [{ ...item, attempts: item.attempts + 1, lastAttemptAt: failedAt }]
      }
      return [item]
    }),
  )

  return { rejected, remaining: remaining.length, sent }
}

/**
 * Spec 189 T9.2 (M1): o toque grava com `location: null` e a posição chega depois, no mesmo item
 * pela chave — o molde de `applyAttachmentLocation`. Spec 196: vale para todo item que leva o
 * campo, ocorrência incluída; o item que já tem uma posição não é sobrescrito.
 */
export function applyReportLocation(input: {
  readonly idempotencyKey: string
  readonly items: readonly QueuedReport[]
  readonly location: DriverReportedLocation
}): readonly QueuedReport[] {
  return input.items.map((item) => {
    const report = item.report
    if (report.idempotencyKey !== input.idempotencyKey) return item
    if (!('location' in report) || report.location !== null) return item
    return { ...item, report: { ...report, location: input.location } }
  })
}

/** Spec 196 D5: um toque pode gravar mais de um item ("Não entreguei"), e a mesma leitura vale para todos. */
export function completeReportLocations(input: {
  readonly items: readonly QueuedReport[]
  readonly keys: readonly string[]
  readonly location: DriverReportedLocation
}): readonly QueuedReport[] {
  return input.keys.reduce(
    (items, idempotencyKey) =>
      applyReportLocation({ idempotencyKey, items, location: input.location }),
    input.items,
  )
}

/** As chaves, entre os itens do toque, dos que levam ponto — a foto da ocorrência não é evento. */
export function listLocatedReportKeys(reports: readonly DriverFieldReport[]): readonly string[] {
  return reports.filter((report) => 'location' in report).map((report) => report.idempotencyKey)
}

/** Spec 196 RF7: item gravado antes do campo existir sai com `location: null`, nunca sem a chave. */
export function withLegacyLocation(report: DriverFieldReport): DriverFieldReport {
  if (
    report.kind !== 'dispatch' &&
    report.kind !== 'documentOccurrence' &&
    report.kind !== 'occurrence'
  ) {
    return report
  }
  const fields: Readonly<Record<string, unknown>> = report
  return 'location' in fields ? report : { ...report, location: null }
}

/** Chave do toque: opaca, gerada uma vez, e é o que o servidor casa no reenvio. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID()
}
