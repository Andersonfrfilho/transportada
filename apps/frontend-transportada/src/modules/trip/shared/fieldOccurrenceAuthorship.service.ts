/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { TripFieldChannel } from './trip.types'

export type FieldAuthorship = Readonly<{
  actorName?: null | string
  channel?: TripFieldChannel
  onBehalfOfDriverName?: null | string
}>

/**
 * Spec 156 T9 (D3): a frase de autoria da linha do tempo. `channel` ausente é registro anterior a
 * ADR-0067 (API na frente do bundle, ou histórico sem autoria gravada) — sem marca nenhuma, para
 * não inventar um canal que a leitura não confirmou.
 *
 * - `office`: "registrado por <ator> (escritório) pelo motorista <motorista>" — os dois nomes.
 * - `driver_app`: "pelo motorista <ator> (aplicativo)" — o próprio motorista é o ator.
 * - `whatsapp`: "(WhatsApp)" — sem nome: o canal não garante a mesma identidade resolvida dos outros
 *   dois, e afirmar um nome que pode estar errado é pior que omitir.
 *
 * Ator sem vínculo ativo na empresa (`actorName: null`) cai no rótulo genérico "(escritório)"/
 * "(aplicativo)" sem nome — nunca o id cru.
 */
export function resolveFieldAuthorshipText(input: FieldAuthorship, t: Translate): null | string {
  const { actorName, channel, onBehalfOfDriverName } = input
  if (channel === undefined) return null

  if (channel === 'whatsapp') return t('occurrence.authorship.whatsapp')

  if (channel === 'office') {
    const driver = onBehalfOfDriverName ?? t('occurrence.authorship.unknownDriver')
    return actorName === null || actorName === undefined
      ? t('occurrence.authorship.officeWithoutActor', { driver })
      : t('occurrence.authorship.office', { actor: actorName, driver })
  }

  return actorName === null || actorName === undefined
    ? t('occurrence.authorship.driverAppWithoutActor')
    : t('occurrence.authorship.driverApp', { actor: actorName })
}
