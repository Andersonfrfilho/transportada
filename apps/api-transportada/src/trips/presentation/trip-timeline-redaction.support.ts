/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 RF4 + spec 153 D10: a diferença de custo da transferência é dinheiro — `trip.financials`.
 * Quem lê a linha do tempo só por `fleet.read` ou `trip.report-on-behalf` recebe o evento sem a
 * chave: ela **sai** do objeto, nunca vira `null` nem zero.
 */
import type {
  TripTimelineCrewTransfer,
  TripTimelineItem,
} from '../application/trip-timeline.types.js'

export type RedactedTripTimelineItem = Omit<TripTimelineItem, 'crewTransfer'> & {
  readonly crewTransfer?: Omit<TripTimelineCrewTransfer, 'costDifference'>
}

export type RedactTimelineCostParams = {
  readonly canReadFinancials: boolean
  readonly items: readonly TripTimelineItem[]
}

export function redactTimelineCosts({
  canReadFinancials,
  items,
}: RedactTimelineCostParams): readonly RedactedTripTimelineItem[] {
  if (canReadFinancials) return items

  return items.map((item) => {
    if (item.crewTransfer === undefined) return item
    /** Lista o que fica, em vez de listar o que sai: campo novo no evento não vaza por padrão. */
    const { mdfeDriverDivergence, nextCrew, previousCrew, reason } = item.crewTransfer
    return { ...item, crewTransfer: { mdfeDriverDivergence, nextCrew, previousCrew, reason } }
  })
}
