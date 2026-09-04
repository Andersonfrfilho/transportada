/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CorrectedGeocodedAddress,
  GeocodedAddressCorrectionUseCase,
} from './route-suggestion.port.js'
import type { GeocodedAddressCorrectionRepository } from './geocoding.port.js'

export type GeocodedAddressCorrectionDependencies = Readonly<{
  repository: GeocodedAddressCorrectionRepository
}>

/**
 * ADR-0044 §3: arrastar o pino grava com fonte manual e **conserta aquele endereço para sempre**,
 * em toda viagem futura. É o trabalho que o produto pede ao humano em troca de não pedir de novo.
 *
 * A coordenada gravada não tem `companyId`, e isso é deliberado: a mesma rua corrigida por uma
 * empresa fica certa para as outras. O que a permissão controla é **quem pode corrigir**, não de
 * quem é a correção.
 *
 * ⚠️ **A trilha, essa tem dono** (spec 084, G1). Ela grava na mesma transação da coordenada: em duas
 * escritas, uma falha no meio deixaria o endereço corrigido sem registro de quem o corrigiu — e é
 * esse registro que responde se comprar precisão fina valeu a pena.
 */
export function createGeocodedAddressCorrectionUseCase(
  dependencies: GeocodedAddressCorrectionDependencies,
): GeocodedAddressCorrectionUseCase {
  return {
    async correct(input) {
      /**
       * `rooftop` porque quem arrastou apontou um telhado, e `manual` porque é o que faz a cascata
       * parar aqui: nenhuma geocodificação posterior desfaz esta linha.
       */
      const corrected: CorrectedGeocodedAddress = {
        addressKey: input.addressKey,
        latitude: input.latitude,
        longitude: input.longitude,
        precision: 'rooftop',
        source: 'manual',
      }

      await dependencies.repository.applyCorrection({
        actorUserId: input.context.userId,
        addressKey: input.addressKey,
        companyId: input.context.companyId,
        latitude: input.latitude,
        longitude: input.longitude,
      })

      return corrected
    },
  }
}
