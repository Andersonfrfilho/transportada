/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'
import { shouldReplaceStored } from '../domain/geocoding-precision.policy.js'

import type { GeocodedAddressRepository, GeocodingPort } from './geocoding.port.js'
import type { AddressComponentsSource, RefineAddressResult } from './refine-address.port.js'

export type RefineAddressDependencies = Readonly<{
  components: AddressComponentsSource
  /** Ausente quando `GOOGLE_MAPS_API_KEY` não foi configurada: a marca responde, não quebra. */
  geocoding: GeocodingPort | undefined
  repository: GeocodedAddressRepository
  trail: RefineAddressTrail
}>

export type RefineAddressTrail = Readonly<{
  record: (entry: {
    readonly actorUserId: string
    readonly addressKey: string
    readonly companyId: string
    readonly outcome: RefineAddressResult['outcome']
    readonly precision: GeocodingPrecision | undefined
  }) => Promise<void>
}>

export type RefineAddressInput = Readonly<{
  actorUserId: string
  addressKey: string
  companyId: string
}>

/**
 * O degrau 2 da escada (adendo 2026-09-01 da ADR-0044): a precisão fina, comprada **só quando um
 * humano marca** a parada como errada.
 *
 * ⚠️ **A resposta nunca é muda.** Se o provedor devolver precisão igual ou pior,
 * `shouldReplaceStored` recusa a escrita — e sem aviso o conferente marca, nada muda na tela, e ele
 * conclui que a marca está quebrada. `not_improved` existe para oferecer o degrau 3, o pino manual.
 */
export function createRefineAddressUseCase(dependencies: RefineAddressDependencies) {
  return {
    async refine(input: RefineAddressInput): Promise<RefineAddressResult> {
      const result = await resolve(dependencies, input)

      /** RF10: quem marcou, o que o provedor devolveu e se substituiu — sem isso não há como saber
       * se comprar precisão fina valeu a pena. */
      await dependencies.trail.record({
        actorUserId: input.actorUserId,
        addressKey: input.addressKey,
        companyId: input.companyId,
        outcome: result.outcome,
        precision: result.precision,
      })

      return result
    },
  }
}

async function resolve(
  dependencies: RefineAddressDependencies,
  input: RefineAddressInput,
): Promise<RefineAddressResult> {
  if (dependencies.geocoding === undefined) return { outcome: 'provider_not_configured' }

  const [stored] = await dependencies.repository.findByKeys([input.addressKey])

  /**
   * A correção manual sempre vence (ADR-0044 §3): o pino que o conferente arrastou não volta sozinho
   * porque alguém marcou o endereço depois. Nem chega a custar uma chamada.
   */
  if (stored?.source === 'manual') return { outcome: 'not_improved' }

  const request = await dependencies.components.byAddressKey({
    addressKey: input.addressKey,
    companyId: input.companyId,
  })
  /** Endereço que não está em nota nenhuma desta empresa: nada a consultar, e nada a vazar. */
  if (request === null) return { outcome: 'not_improved' }

  const resolved = await dependencies.geocoding.geocode(request).catch(() => null)
  if (resolved === null) return { outcome: 'not_improved' }

  const improves =
    stored === undefined ||
    shouldReplaceStored({
      candidatePrecision: resolved.precision,
      candidateSource: resolved.source,
      storedPrecision: stored.precision,
      storedSource: stored.source,
    })
  if (!improves) return { outcome: 'not_improved' }

  await dependencies.repository.save({ ...resolved, addressKey: input.addressKey })

  return {
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    outcome: 'refined',
    precision: resolved.precision,
  }
}
