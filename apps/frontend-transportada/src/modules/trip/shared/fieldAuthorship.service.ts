/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import type { TripFieldChannel } from './trip.types'

export type FieldAuthorship = Readonly<{
  actorName?: null | string
  channel?: null | TripFieldChannel
  onBehalfOfDriverName?: null | string
}>

/**
 * Spec 158 D7: a frase de autoria única — `TripOccurrences` e a linha do tempo usam a mesma função.
 * `channel` **ausente** (`undefined`) é registro anterior a ADR-0067 (API na frente do bundle, ou
 * histórico sem autoria gravada) — sem marca nenhuma. `channel: null` é diferente: a leitura
 * **confirmou** que o canal não foi registrado (D3), e a frase aparece, sem selo de canal.
 *
 * - `office`: "por <ator> (escritório) pelo motorista <motorista>" — os dois nomes.
 * - `driver_app`: "pelo motorista <ator> (aplicativo)" — o próprio motorista é o ator.
 * - `backoffice` (ADR-0068 §3): "por <ator>" — ação do escritório que não é em nome do motorista.
 * - `null` (canal não registrado, D3): "por <ator>" — mesma frase de `backoffice`, sem selo.
 * - `whatsapp` (ADR-0068 §3, agora também o operador): "por <ator> pelo WhatsApp" com nome; sem
 *   nome, a frase genérica que já existia — o canal não garante a mesma identidade resolvida dos
 *   outros, e afirmar um nome que pode estar errado é pior que omitir.
 *
 * `actorName: null` (`office`/`driver_app`): mantêm o rótulo genérico "(escritório)"/"(aplicativo)"
 * sem nome (comportamento já existente).
 *
 * Spec 180 RF2/RF3 (CA02/CA03): `actorName: null` sozinho **não prova** que o ator foi removido —
 * prova só que o nome não chegou até aqui, e a causa pode ser outra (a consulta, um perfil nunca
 * cadastrado). "Usuário removido" fica reservada ao que a D6 original descreve — um ator que existiu
 * e **perdeu** o vínculo —, e hoje não há sinal que confirme esse caso específico. `backoffice` e o
 * canal não registrado caem em "por autor não identificado": nunca `null`, `undefined`, o id cru, e
 * nunca uma afirmação de remoção que pode não ter ocorrido. A chave `authorship.removedActor`
 * continua nos dois idiomas, reservada para quando a API mandar esse sinal.
 */
export function resolveFieldAuthorshipText(input: FieldAuthorship, t: Translate): null | string {
  const { actorName, channel, onBehalfOfDriverName } = input
  if (channel === undefined) return null

  const actorLabel = actorName ?? t('authorship.unidentifiedActor')

  if (channel === null) return t('authorship.notRegistered', { actor: actorLabel })
  if (channel === 'backoffice') return t('authorship.backoffice', { actor: actorLabel })

  if (channel === 'whatsapp') {
    return actorName === null || actorName === undefined
      ? t('authorship.whatsapp')
      : t('authorship.whatsappWithActor', { actor: actorName })
  }

  if (channel === 'office') {
    const driver = onBehalfOfDriverName ?? t('authorship.unknownDriver')
    return actorName === null || actorName === undefined
      ? t('authorship.officeWithoutActor', { driver })
      : t('authorship.office', { actor: actorName, driver })
  }

  return actorName === null || actorName === undefined
    ? t('authorship.driverAppWithoutActor')
    : t('authorship.driverApp', { actor: actorName })
}
