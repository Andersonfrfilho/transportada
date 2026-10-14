/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { TripTimelineItem } from './trip.types'

export type TripTimelineDocumentReleaseText = Readonly<{
  /** `null` quando ninguém digitou motivo. */
  note: null | string
  /** `null` quando a nota saiu sozinha. */
  scope: null | string
  stop: null | string
}>

/** O que a retirada diz além do título: de qual parada saiu, se foi com a parada inteira e o motivo. */
export function resolveTripTimelineDocumentRelease(
  item: TripTimelineItem,
  t: Translate,
): null | TripTimelineDocumentReleaseText {
  if (item.kind !== 'document.released' || item.documentRelease === undefined) return null
  const { note, scope, stopLabel } = item.documentRelease

  return {
    note: note === null ? null : t('eventTimeline.documentRelease.note', { note }),
    scope: scope === 'stop' ? t('eventTimeline.documentRelease.wholeStop') : null,
    stop: stopLabel === null ? null : t('eventTimeline.documentRelease.stop', { stop: stopLabel }),
  }
}
