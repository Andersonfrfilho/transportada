/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentDetail } from '../shared/trip.types'
import {
  countDocumentsByDeliveryDeadline,
  filterDocumentsByDeliveryDeadline,
  hasAnyDeliveryDeadline,
  type DeliveryDeadlineCounts,
} from '../shared/tripDeliveryDeadlineFilter.service'

import {
  useTripDeliveryDeadlineFilter,
  type TripDeliveryDeadlineFilterController,
} from './useTripDeliveryDeadlineFilter.hook'

export type TripDeliveryDeadlineScope = Readonly<{
  counts: DeliveryDeadlineCounts
  filter: TripDeliveryDeadlineFilterController
  hasFilter: boolean
  /** O filtro só tem o que oferecer quando alguma nota da viagem tem prazo. */
  isOffered: boolean
  keepVisible: (documents: readonly TripDocumentDetail[]) => readonly TripDocumentDetail[]
  shownCount: number
  totalCount: number
  /** `undefined` é "sem filtro": todas as notas aparecem. */
  visibleDocumentIds: ReadonlySet<string> | undefined
  visibleDocuments: readonly TripDocumentDetail[]
}>

/** O recorte das notas da viagem pelo filtro de prazo: o que aparece, quantas e o que pode ser marcado. */
export function useTripDeliveryDeadlineScope(
  documents: readonly TripDocumentDetail[],
): TripDeliveryDeadlineScope {
  const filter = useTripDeliveryDeadlineFilter()
  const hasFilter = filter.values.length > 0
  const visibleDocuments = filterDocumentsByDeliveryDeadline({ documents, values: filter.values })
  const visibleDocumentIds = hasFilter
    ? new Set(visibleDocuments.map((document) => document.id))
    : undefined

  return {
    counts: countDocumentsByDeliveryDeadline(documents),
    filter,
    hasFilter,
    isOffered: hasAnyDeliveryDeadline(documents),
    keepVisible: (candidates) =>
      visibleDocumentIds === undefined
        ? candidates
        : candidates.filter((candidate) => visibleDocumentIds.has(candidate.id)),
    shownCount: visibleDocuments.length,
    totalCount: documents.length,
    visibleDocumentIds,
    visibleDocuments,
  }
}
