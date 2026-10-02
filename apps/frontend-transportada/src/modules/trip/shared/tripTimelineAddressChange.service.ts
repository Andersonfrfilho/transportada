/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { formatTripTimelineDistance } from './tripTimelineDetail.service'
import type { TripTimelineItem } from './trip.types'

export type TripTimelineAddressChangeText = Readonly<{
  displacement: null | string
  origin: string
  /** A frase única da linha: "Corrigido pelo contratante · deslocado 45 m", ou só a origem. */
  summary: string
}>

/**
 * Spec 228 D8: quem corrigiu o endereço e quanto o ponto andou. O deslocamento sai na mesma
 * unidade da distância do resto do painel; sem ele (sem ponto anterior, ou refino) só a origem fala.
 */
export function resolveTripTimelineAddressChange(
  item: TripTimelineItem,
  t: Translate,
): null | TripTimelineAddressChangeText {
  if (item.kind !== 'stop.address_corrected' || item.addressChange === undefined) return null
  const { displacementMeters, origin } = item.addressChange
  const distance =
    displacementMeters === null ? null : formatTripTimelineDistance(displacementMeters)
  const displacement =
    distance === null
      ? null
      : t(`eventTimeline.addressChange.displacement.${distance.unit}`, {
          distance: distance.value,
        })
  const originText = t(`eventTimeline.addressChange.origin.${origin}`)
  return {
    displacement,
    origin: originText,
    summary:
      displacement === null
        ? originText
        : t('eventTimeline.addressChange.summary', { displacement, origin: originText }),
  }
}
