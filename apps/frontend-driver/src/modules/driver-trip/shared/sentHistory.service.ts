/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { EventQueueItemView } from './eventQueueView.service'
import type { QueuedReport } from './offlineQueue.service'

/**
 * Pedido do usuário (15/10): "por que não temos histórico de itens enviados e o horário de envio?".
 * O item sai da fila quando sobe e não deixava rastro — com o motorista dizendo que "não enviou", não
 * havia como saber o que aconteceu. Este registro leve fica no aparelho: o que foi, de qual nota ou
 * parada, a hora do toque, a hora do desfecho e o desfecho. Sem foto, sem corpo do evento.
 */
export type SentHistoryResult = 'discarded' | 'rejected' | 'sent'

export type SentHistoryEntry = Readonly<{
  /** A hora do desfecho (envio aceito, recusa ou descarte). */
  at: string
  cause?: string
  documentId?: string
  key: string
  kind: EventQueueItemView['kind']
  result: SentHistoryResult
  stopId?: string
  /** A hora do toque do motorista. */
  tappedAt: string
}>

export type SentHistoryStore = Readonly<{
  read: () => Promise<readonly SentHistoryEntry[]>
  update: (
    mutate: (entries: readonly SentHistoryEntry[]) => readonly SentHistoryEntry[],
  ) => Promise<readonly SentHistoryEntry[]>
}>

/** O histórico vale até a viagem concluir (`purgeTripSentHistory`); prazo e teto são só a rede de segurança. */
export const SENT_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
export const SENT_HISTORY_MAX_ENTRIES = 500

export function toSentHistoryEntry(input: {
  readonly at: string
  readonly cause?: string | undefined
  readonly item: QueuedReport
  readonly result: SentHistoryResult
}): SentHistoryEntry {
  const { report } = input.item
  return {
    at: input.at,
    ...(input.cause === undefined ? {} : { cause: input.cause }),
    ...(report.kind === 'documentOccurrence' ||
    report.kind === 'deliver' ||
    report.kind === 'return' ||
    report.kind === 'proofReceiver'
      ? { documentId: report.documentId }
      : {}),
    key: report.idempotencyKey,
    kind: report.kind,
    result: input.result,
    ...(report.kind === 'arrive' ||
    report.kind === 'depart' ||
    report.kind === 'cancelDeparture' ||
    report.kind === 'stopOccurrencePhoto'
      ? { stopId: report.stopId }
      : {}),
    tappedAt: input.item.createdAt,
  }
}

/**
 * O desfecho novo de um item substitui o anterior do mesmo item (a recusa reenviada e aceita vira
 * "enviado"); sai o que passou do prazo e o que passou do teto, e o mais recente vem primeiro.
 */
export function appendSentHistory(input: {
  readonly additions: readonly SentHistoryEntry[]
  readonly current: readonly SentHistoryEntry[]
  readonly nowMs: number
}): readonly SentHistoryEntry[] {
  const replaced = new Set(input.additions.map((entry) => entry.key))
  return [...input.additions, ...input.current.filter((entry) => !replaced.has(entry.key))]
    .filter((entry) => {
      const atMs = Date.parse(entry.at)
      return Number.isFinite(atMs) && input.nowMs - atMs <= SENT_HISTORY_RETENTION_MS
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, SENT_HISTORY_MAX_ENTRIES)
}

/**
 * Pedido do usuário (15/10): o histórico vale "até a viagem ser concluída". Concluída a viagem e vazia
 * a fila (nada pendente nem recusado), saem os registros das paradas e notas dela. Registro sem nota
 * nem parada (ex.: despacho) fica até o prazo de segurança de `appendSentHistory`.
 */
export function purgeTripSentHistory(input: {
  readonly entries: readonly SentHistoryEntry[]
  readonly trip: Readonly<{
    stops: readonly Readonly<{ documents: readonly Readonly<{ id: string }>[]; id: string }>[]
  }>
}): readonly SentHistoryEntry[] {
  const stopIds = new Set(input.trip.stops.map((stop) => stop.id))
  const documentIds = new Set(
    input.trip.stops.flatMap((stop) => stop.documents.map((document) => document.id)),
  )
  return input.entries.filter(
    (entry) =>
      !(
        (entry.stopId !== undefined && stopIds.has(entry.stopId)) ||
        (entry.documentId !== undefined && documentIds.has(entry.documentId))
      ),
  )
}
