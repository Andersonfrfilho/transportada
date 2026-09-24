/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { resolveFieldAuthorshipText } from './fieldAuthorship.service'
import { formatOccurrenceInvoice } from './tripOccurrenceFeed.service'
import {
  TRIP_DOCUMENT_SEPARATION_STATUS,
  TRIP_STATUS,
  type TripTimelineDocumentReference,
  type TripTimelineItem,
} from './trip.types'

const KNOWN_TRIP_STATUSES: ReadonlySet<string> = new Set(TRIP_STATUS)
const KNOWN_DOCUMENT_STATUSES: ReadonlySet<string> = new Set(TRIP_DOCUMENT_SEPARATION_STATUS)

/**
 * Spec 158 D5/T8: `trip.dispatched` (fonte `trip_dispatch_snapshots`) e `trip.status_changed` com
 * `toStatus = 'dispatched'` (D1) no **mesmo instante** descrevem o mesmo fato — o despacho. Mostra
 * só o `trip.status_changed`, que tem canal; `trip.dispatched` sobrevive quando não há o par —
 * viagem anterior ao deploy de `trip_status_events`, sem `trip.status_changed` nenhum antes dele.
 */
export function removeDuplicateDispatchEvents(
  items: readonly TripTimelineItem[],
): readonly TripTimelineItem[] {
  const statusChangedDispatchInstants = new Set(
    items
      .filter((item) => item.kind === 'trip.status_changed' && item.toStatus === 'dispatched')
      .map((item) => item.occurredAt),
  )
  if (statusChangedDispatchInstants.size === 0) return items

  return items.filter(
    (item) =>
      item.kind !== 'trip.dispatched' || !statusChangedDispatchInstants.has(item.occurredAt),
  )
}

/**
 * Spec 180 RF12/RF13: filtra por **várias** notas, e mantém os eventos da viagem (sem documento).
 * A versão anterior exigia `document.id` igual, então filtrar por uma nota escondia junto viagem
 * criada, despachada e chegada em parada — comparar notas sem saber quando a viagem saiu tira o
 * sentido da linha do tempo. Conjunto vazio é "nenhum filtro", não "nada".
 */
export function filterTripTimelineItemsByDocumentIds(
  items: readonly TripTimelineItem[],
  documentIds: ReadonlySet<string>,
): readonly TripTimelineItem[] {
  if (documentIds.size === 0) return items
  return items.filter((item) => item.document === null || documentIds.has(item.document.id))
}

/**
 * Spec 180 RF12: as notas que o seletor oferece são as que **aparecem nos itens carregados** — o
 * filtro é em memória (RF14), e oferecer nota sem evento carregado prometeria um resultado vazio.
 * A ordem é a de primeira aparição, que é a da própria lista.
 */
export function collectTripTimelineDocuments(
  items: readonly TripTimelineItem[],
): readonly TripTimelineDocumentReference[] {
  const byId = new Map<string, TripTimelineDocumentReference>()
  for (const item of items) {
    if (item.document !== null && !byId.has(item.document.id)) {
      byId.set(item.document.id, item.document)
    }
  }
  return [...byId.values()]
}

/**
 * Spec 180 RF12: o rótulo da nota no seletor. Nota sem número legível cai no id curto — o operador
 * precisa conseguir distinguir duas linhas, e "nota desconhecida" repetida não distingue nada.
 */
export function formatTripTimelineDocumentFilterLabel(
  document: TripTimelineDocumentReference,
  t: Translate,
): string {
  const invoice = formatOccurrenceInvoice(document.number, document.series)
  return invoice === ''
    ? document.id.slice(0, 8)
    : t('eventTimeline.documentFilterOption', { invoice })
}

function formatTripTimelineDocumentLabel(
  document: null | TripTimelineDocumentReference,
  t: Translate,
): string {
  if (document === null) return t('eventTimeline.itemTitle.unknownDocument')
  const invoice = formatOccurrenceInvoice(document.number, document.series)
  return invoice === ''
    ? t('eventTimeline.itemTitle.unknownDocument')
    : t('eventTimeline.itemTitle.documentLabel', { invoice })
}

/**
 * Spec 158 D6/T8/T10: o título do item pelo `kind` e, nas mudanças de situação, pela transição — no
 * vocabulário do escritório ("Rota iniciada", "Nota 456/1 separada"), não "Situação alterada para
 * <rótulo de status>". Situação que o bundle não conhece cai no título genérico, nunca no código cru.
 */
export function resolveTripTimelineTitle(item: TripTimelineItem, t: Translate): string {
  switch (item.kind) {
    case 'trip.created':
      return t('eventTimeline.itemTitle.tripCreated')
    case 'trip.dispatched':
      return t('eventTimeline.itemTitle.dispatched')
    case 'trip.status_changed':
      return item.toStatus !== null && KNOWN_TRIP_STATUSES.has(item.toStatus)
        ? t(`eventTimeline.itemTitle.tripStatus.${item.toStatus}`)
        : t('eventTimeline.itemTitle.statusChanged', {
            status: t('eventTimeline.itemTitle.unknownStatus'),
          })
    case 'stop.arrived':
      return item.stop === null
        ? t('eventTimeline.itemTitle.stopArrivedUnknown')
        : t('eventTimeline.itemTitle.stopArrived', { sequence: item.stop.sequence })
    case 'document.delivered':
      return t('eventTimeline.itemTitle.documentDelivered', {
        document: formatTripTimelineDocumentLabel(item.document, t),
      })
    case 'document.returned':
      return t('eventTimeline.itemTitle.documentReturned', {
        document: formatTripTimelineDocumentLabel(item.document, t),
      })
    case 'stop.occurrence':
      return t('eventTimeline.itemTitle.stopOccurrence', {
        type:
          item.occurrence === null
            ? t('eventTimeline.itemTitle.unknownOccurrenceType')
            : item.occurrence.typeName,
      })
    case 'document.occurrence':
      return t('eventTimeline.itemTitle.documentOccurrence', {
        document: formatTripTimelineDocumentLabel(item.document, t),
        type:
          item.occurrence === null
            ? t('eventTimeline.itemTitle.unknownOccurrenceType')
            : item.occurrence.typeName,
      })
    case 'document.status_changed':
      return item.toStatus !== null && KNOWN_DOCUMENT_STATUSES.has(item.toStatus)
        ? t(`eventTimeline.itemTitle.documentStatus.${item.toStatus}`, {
            document: formatTripTimelineDocumentLabel(item.document, t),
          })
        : t('eventTimeline.itemTitle.documentStatusChanged', {
            document: formatTripTimelineDocumentLabel(item.document, t),
            status: t('eventTimeline.itemTitle.unknownStatus'),
          })
  }
}

export type TripTimelineTone = 'done' | 'problem' | 'progress'

const DONE_STATUSES: ReadonlySet<string> = new Set(['completed', 'delivered'])
const PROBLEM_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'returned'])

/** Spec 158 T10: o tom do marcador no trilho — o olho acha a devolução numa lista de 50 notas. */
export function resolveTripTimelineTone(item: TripTimelineItem): TripTimelineTone {
  if (item.kind === 'document.delivered') return 'done'
  if (
    item.kind === 'document.returned' ||
    item.kind === 'stop.occurrence' ||
    item.kind === 'document.occurrence'
  ) {
    return 'problem'
  }
  const isStatusChange =
    item.kind === 'trip.status_changed' || item.kind === 'document.status_changed'
  if (!isStatusChange || item.toStatus === null) return 'progress'
  if (DONE_STATUSES.has(item.toStatus)) return 'done'
  if (PROBLEM_STATUSES.has(item.toStatus)) return 'problem'
  return 'progress'
}

/**
 * Spec 171 (caso extremo): `trip.created` semeada/importada sem ator humano diz "pelo sistema" —
 * frase diferente de `authorship.unidentifiedActor` ("autor não identificado", spec 180 RF3), que é
 * o texto genérico para `actorName: null` sem causa confirmada. As duas leituras têm
 * `actorName: null`; só `trip.created` pode não ter tido ator nenhum, então só ela ganha o desvio.
 * Toda a autoria por `channel` continua em `resolveFieldAuthorshipText` — este wrapper não duplica
 * aquela regra.
 */
export function resolveTripTimelineAuthorshipText(
  item: TripTimelineItem,
  t: Translate,
): null | string {
  if (item.kind === 'trip.created' && item.actorName === null) return t('authorship.system')
  return resolveFieldAuthorshipText(item, t)
}
export type TripTimelineDayGroup = Readonly<{
  dayKey: string
  items: readonly TripTimelineItem[]
}>

function resolveDayKey(occurredAt: string): string {
  const moment = new Date(occurredAt)
  if (Number.isNaN(moment.getTime())) return occurredAt
  const month = String(moment.getMonth() + 1).padStart(2, '0')
  const day = String(moment.getDate()).padStart(2, '0')
  return `${moment.getFullYear()}-${month}-${day}`
}

/**
 * Agrupa em faixas de dia sem reordenar: a ordem da API (D4, do mais recente para o mais antigo) é
 * a ordem da tela, e um dia que reaparecesse depois de outro abriria faixa nova em vez de mentir
 * sobre a sequência.
 */
export function groupTripTimelineItemsByDay(
  items: readonly TripTimelineItem[],
): readonly TripTimelineDayGroup[] {
  const groups: { dayKey: string; items: TripTimelineItem[] }[] = []
  for (const item of items) {
    const dayKey = resolveDayKey(item.occurredAt)
    const current = groups.at(-1)
    if (current !== undefined && current.dayKey === dayKey) {
      current.items.push(item)
      continue
    }
    groups.push({ dayKey, items: [item] })
  }
  return groups
}
