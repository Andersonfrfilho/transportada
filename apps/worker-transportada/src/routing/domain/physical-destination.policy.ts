/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildStopAddressKey, type StopAddressComponents } from './pool-address-key.js'

/**
 * Spec 073: a NF-e tem **dois** endereços de destino. `<enderDest>` é onde o cliente está
 * cadastrado; `<entrega>` é onde a carga tem de ser deixada, e o emitente só o emite quando os
 * dois divergem. Tudo que decide *para onde o caminhão vai* segue este seam.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/nfe-documents/domain/physical-destination.policy.ts`
 * — as apps não importam código uma da outra, e o import de `buildStopAddressKey` é o único ponto
 * em que os dois arquivos podem divergir (aqui `pool-address-key`, lá `stop-address-key`, que já
 * são cópia um do outro). A paridade é cobrada por
 * `test/routing/physical-destination-parity.contract.ts`: se a parada que o worker propõe e a
 * parada que o aceite cria deixarem de casar, o roteiro aceito fica com duas paradas no mesmo portão.
 */
export const PHYSICAL_DESTINATION_ORIGINS = ['delivery', 'recipient'] as const

export type PhysicalDestinationOrigin = (typeof PHYSICAL_DESTINATION_ORIGINS)[number]

export type PhysicalDestinationCandidate = {
  readonly components: StopAddressComponents
  readonly origin: PhysicalDestinationOrigin
}

/**
 * `<entrega>` vence quando existe e monta chave de parada. Incompleto cai para o destinatário —
 * meio endereço é pior que o endereço do cadastro, e o critério de "utilizável" é o mesmo que a
 * parada já usa, nunca um segundo critério ao lado dele.
 *
 * Quando nenhum dos dois monta chave, vence o destinatário: o chamador segue tratando a nota
 * como `SEM ENDEREÇO`, exatamente como antes desta spec.
 */
export function resolvePhysicalDestination<TCandidate extends PhysicalDestinationCandidate>(
  candidates: readonly TCandidate[],
): TCandidate | null {
  const recipient = candidates.find((candidate) => candidate.origin === 'recipient') ?? null
  const delivery = candidates.find((candidate) => candidate.origin === 'delivery') ?? null

  if (delivery !== null && buildStopAddressKey(delivery.components) !== null) return delivery

  return recipient ?? delivery
}
