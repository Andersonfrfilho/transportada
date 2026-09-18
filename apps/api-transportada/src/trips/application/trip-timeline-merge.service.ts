/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5 (D6, D8; T9 correção do orquestrador): a parte pura da linha do tempo — o formato de
 * linha comum às seis fontes e o merge em memória. Sem I/O, testável sem banco
 * (`trip-timeline-merge.contract.ts`): ordem e desempate (D8), e o cursor que não repete nem pula
 * ao paginar 250 itens em páginas de 100.
 */
import { TRIP_TIMELINE_KIND_PRIORITY } from './trip-timeline.types.js'
import type { TripTimelineItem, TripTimelineKind } from './trip-timeline.types.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'

/**
 * Linha comum às seis fontes, antes de virar `TripTimelineItem`. `occurredAtKey` é o mesmo instante
 * de `occurredAt`, mas como texto com microssegundos (`formatTimelineTimestampKey`,
 * infraestrutura) — é ele, nunca `occurredAt`, que decide ordem entre fontes e alimenta o próximo
 * cursor (T9): `occurredAt` (`Date`) só guarda milissegundos.
 */
export type TripTimelineRow = Omit<TripTimelineItem, 'occurredAt' | 'recordedAt'> & {
  readonly occurredAt: Date
  readonly occurredAtKey: string
  readonly recordedAt: Date | null
}

const RECORDED_AT_THRESHOLD_MS = 60_000

/** D6: só quando o escritório informou a hora do fato, e ela diverge da hora do registro por >60s. */
export function resolveRecordedAt(
  channel: TripFieldChannel | null,
  occurredAt: Date,
  recordedAt: Date,
): Date | null {
  if (channel !== TRIP_FIELD_CHANNELS.office) return null
  const diffMs = Math.abs(recordedAt.getTime() - occurredAt.getTime())
  return diffMs > RECORDED_AT_THRESHOLD_MS ? recordedAt : null
}

/**
 * Compara pela chave de microssegundos (texto, mesmo formato de ponta a ponta — comparação
 * lexicográfica equivale à cronológica), nunca por `occurredAt.getTime()`: duas fontes podem
 * compartilhar o mesmo `now()` de transação com microssegundos que `Date` já teria truncado.
 */
function compareTimelineRows(first: TripTimelineRow, second: TripTimelineRow): number {
  const byTime = second.occurredAtKey.localeCompare(first.occurredAtKey)
  if (byTime !== 0) return byTime
  const byPriority =
    TRIP_TIMELINE_KIND_PRIORITY[second.kind] - TRIP_TIMELINE_KIND_PRIORITY[first.kind]
  if (byPriority !== 0) return byPriority
  // Desempate final por id, decrescente — o mesmo sentido do `order by ... id desc` de cada fonte.
  return first.id < second.id ? 1 : first.id > second.id ? -1 : 0
}

export type MergeTripTimelineResult = {
  readonly hasMore: boolean
  readonly items: readonly TripTimelineRow[]
}

/**
 * Cada fonte já vem limitada a `limit + 1` e cortada pelo mesmo cursor; aqui só se ordena, corta em
 * `limit` e decide se sobrou linha (`hasMore`). Pura, sem I/O.
 */
export function mergeTripTimeline(input: {
  readonly limit: number
  readonly sources: readonly (readonly TripTimelineRow[])[]
}): MergeTripTimelineResult {
  const merged = input.sources.flatMap((source) => [...source]).sort(compareTimelineRows)
  return { hasMore: merged.length > input.limit, items: merged.slice(0, input.limit) }
}

export type { TripTimelineKind }
