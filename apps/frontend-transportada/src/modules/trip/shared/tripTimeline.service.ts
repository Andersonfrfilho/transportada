/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { formatOccurrenceInvoice } from './tripOccurrenceFeed.service'
import type { TripTimelineDocumentReference, TripTimelineItem } from './trip.types'

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

/** RF6: a nota aberta no detalhe filtra os itens que se referem a ela — sem nota aberta, tudo passa. */
export function filterTripTimelineItemsByDocumentId(
  items: readonly TripTimelineItem[],
  documentId: null | string,
): readonly TripTimelineItem[] {
  if (documentId === null) return items
  return items.filter((item) => item.document?.id === documentId)
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
 * Spec 158 D6/T8: o título do item pelo `kind`. Reaproveita o vocabulário de status que o módulo já
 * tem (`status.*` de `trip.status_changed`, `separationStatus.*` de `document.status_changed`) — não
 * inventa rótulo novo onde já existe um.
 */
export function resolveTripTimelineTitle(item: TripTimelineItem, t: Translate): string {
  switch (item.kind) {
    case 'trip.dispatched':
      return t('eventTimeline.itemTitle.dispatched')
    case 'trip.status_changed':
      return t('eventTimeline.itemTitle.statusChanged', {
        status:
          item.toStatus === null
            ? t('eventTimeline.itemTitle.unknownStatus')
            : t(`status.${item.toStatus}`),
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
      return t('eventTimeline.itemTitle.documentStatusChanged', {
        document: formatTripTimelineDocumentLabel(item.document, t),
        status:
          item.toStatus === null
            ? t('eventTimeline.itemTitle.unknownStatus')
            : t(`separationStatus.${item.toStatus}`),
      })
  }
}
