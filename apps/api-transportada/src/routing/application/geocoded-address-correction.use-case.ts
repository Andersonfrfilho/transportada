/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CorrectedGeocodedAddress,
  GeocodedAddressCorrectionUseCase,
} from './route-suggestion.port.js'
import type { GeocodedAddressRepository } from './geocoding.port.js'

export type GeocodedAddressCorrectionDependencies = Readonly<{
  repository: GeocodedAddressRepository
}>

/**
 * ADR-0044 §3: arrastar o pino grava com fonte manual e **conserta aquele endereço para sempre**,
 * em toda viagem futura. É o trabalho que o produto pede ao humano em troca de não pedir de novo.
 *
 * Não há `companyId` na escrita, e isso é deliberado: a coordenada de um endereço não é de ninguém —
 * a mesma rua corrigida por uma empresa fica certa para as outras. O que a permissão controla é
 * **quem pode corrigir**, não de quem é a correção.
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

      /**
       * Sem `place_id`: ele é do provedor, e correção humana não vem de provedor nenhum. O CHECK da
       * tabela só o exige de linha `google`, exatamente por isso.
       */
      await dependencies.repository.save({ ...corrected, externalPlaceId: '' })

      return corrected
    },
  }
}
