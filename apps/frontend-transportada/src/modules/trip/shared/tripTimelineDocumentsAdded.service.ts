/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { TripTimelineItem } from './trip.types'

export type TripTimelineDocumentsAddedText = Readonly<{
  /** `null` quando todas as notas já têm CT-e autorizado. */
  cteWarning: null | string
  count: string
  hasMdfeDivergence: boolean
  reason: string
}>

/** Spec 257 D9: quantas notas entraram, o motivo e os avisos fiscais (CT-e e MDF-e). */
export function resolveTripTimelineDocumentsAdded(
  item: TripTimelineItem,
  t: Translate,
): null | TripTimelineDocumentsAddedText {
  if (item.kind !== 'documents_added' || item.documentsAdded === undefined) return null
  const { documentCount, documentsWithoutCte, mdfeDocumentDivergence, reason } = item.documentsAdded

  return {
    count: t('eventTimeline.documentsAdded.count', { count: documentCount }),
    cteWarning:
      documentsWithoutCte === 0
        ? null
        : t('eventTimeline.documentsAdded.withoutCte', { count: documentsWithoutCte }),
    hasMdfeDivergence: mdfeDocumentDivergence,
    reason: t('eventTimeline.documentsAdded.reason', { reason }),
  }
}
