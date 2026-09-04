/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision, ProviderMatchLevel } from '../../database/database.schema.js'
import { shouldReplaceStored } from '../../routing/domain/geocoding-precision.policy.js'
import type { GeocodedAddressRepository } from '../../routing/application/geocoding.port.js'
import { compareAddresses } from '../domain/address-comparison.policy.js'
import { checkCityMatch } from '../domain/city-match.policy.js'
import { distanceInMetres } from '../domain/coordinate-distance.js'
import { toStoredPrecision } from '../domain/provider-address.policy.js'
import type { AddressLookupPort } from './address-lookup.port.js'
import type {
  AddressComparisonRepository,
  CityDirectoryPort,
  ComparisonCandidate,
} from './address-comparison.port.js'

/**
 * O lote de medição da **ADR-0061**: uma execução, decidida por uma pessoa, com escopo declarado.
 *
 * ⚠️ **Não é gatilho automático, e a diferença é a ADR inteira.** O que autoriza esta chamada ao
 * provedor pago é alguém ter pedido, sabendo quantos endereços e quanto custa. Nada aqui pode passar
 * a rodar sozinho — a escalada em runtime continua recusada, e
 * `paid-provider-never-called.contract.ts` guarda o caminho de sugestão de roteiro.
 */
export type BatchSummary = Readonly<{
  byMatchLevel: Readonly<Record<ProviderMatchLevel, number>>
  cityMismatches: number
  compared: number
  /**
   * ⚠️ **É esta linha que torna o gasto permanente**, e ela quase não existiu: a primeira versão do
   * lote gravou a medição e **jogou fora a coordenada**, deixando o produto ter de comprar de novo
   * exatamente o que já tinha pago. A ADR-0044 §3 já autorizava guardar; foi descuido, não regra.
   */
  coordinatesUpgraded: number
  districtDiverging: number
  postalCodeDiverging: number
  /** Endereços que o provedor não respondeu — rede, cota, chave. Não são medição: são a repetir. */
  skipped: number
  streetDiverging: number
}>

const EMPTY_SUMMARY: BatchSummary = {
  byMatchLevel: { approximate: 0, not_found: 0, range_interpolated: 0, rooftop: 0 },
  cityMismatches: 0,
  compared: 0,
  coordinatesUpgraded: 0,
  districtDiverging: 0,
  postalCodeDiverging: 0,
  skipped: 0,
  streetDiverging: 0,
}

export type CompareAddressesBatchUseCase = Readonly<{
  run: (input: {
    readonly companyId: string
    readonly limit: number
    readonly precisions: readonly GeocodingPrecision[]
  }) => Promise<BatchSummary>
}>

export function createCompareAddressesBatchUseCase(dependencies: {
  readonly cityDirectory: CityDirectoryPort
  readonly comparisons: AddressComparisonRepository
  readonly geocoded: GeocodedAddressRepository
  readonly lookup: AddressLookupPort
}): CompareAddressesBatchUseCase {
  return {
    async run(input) {
      const candidates = await dependencies.comparisons.findCandidates(input)

      let summary = EMPTY_SUMMARY
      for (const candidate of candidates) {
        summary = await measure({ candidate, dependencies, summary })
      }

      return summary
    },
  }
}

async function measure(input: {
  candidate: ComparisonCandidate
  dependencies: {
    readonly cityDirectory: CityDirectoryPort
    readonly comparisons: AddressComparisonRepository
    readonly geocoded: GeocodedAddressRepository
    readonly lookup: AddressLookupPort
  }
  summary: BatchSummary
}): Promise<BatchSummary> {
  const { candidate, dependencies, summary } = input

  const result = await dependencies.lookup.lookup({
    city: candidate.city,
    cityCode: candidate.cityCode,
    district: candidate.district,
    number: candidate.number,
    postalCode: candidate.postalCode,
    state: candidate.state,
    street: candidate.street,
  })

  /** Não conseguir perguntar não é medição. Gravar aqui diria que o provedor não conhece o lugar. */
  if (result === null) return { ...summary, skipped: summary.skipped + 1 }

  /**
   * ⚠️ **`not_found` não passa pelo portão do município, e não é descuido.** `checkCityMatch`
   * descarta resultado sem município identificável — e é o certo, porque cair em cidade
   * desconhecida é indistinguível de cair na errada. Mas quem não achou nada não caiu em lugar
   * nenhum: mandá-lo ao portão apagaria a linha **mais acionável do relatório**, que é justamente
   * "o texto desta nota não existe para o provedor".
   */
  const cityMismatch =
    result.matchLevel === 'not_found'
      ? false
      : checkCityMatch({
          noteCityCode: candidate.cityCode,
          resultCityCode: await dependencies.cityDirectory.resolveCityCode({
            name: result.address.cityName,
            state: result.address.state,
          }),
        }).mismatch

  const comparison = compareAddresses({
    cityMismatch,
    matchLevel: result.matchLevel,
    note: {
      district: candidate.district,
      number: candidate.number,
      postalCode: candidate.postalCode,
      street: candidate.street,
    },
    provider: {
      district: result.address.district,
      number: result.address.number,
      postalCode: result.address.postalCode,
      street: result.address.street,
    },
  })

  await dependencies.comparisons.saveComparison({
    addressKey: candidate.addressKey,
    cityMismatch,
    companyId: candidate.companyId,
    distanceMetres: toDistance({ candidate, cityMismatch, result }),
    districtDiverges: comparison.districtDiverges,
    matchLevel: comparison.matchLevel,
    noteDistrict: candidate.district,
    noteNumber: candidate.number,
    notePostalCode: candidate.postalCode,
    noteStreet: candidate.street,
    postalCodeDiverges: comparison.postalCodeDiverges,
    providerDistrict: result.address.district,
    providerNumber: result.address.number,
    providerPlaceId: result.placeId,
    providerPostalCode: result.address.postalCode,
    providerStreet: result.address.street,
    streetDiverges: comparison.streetDiverges,
  })

  const upgraded = await storeCoordinate({ candidate, cityMismatch, dependencies, result })

  return {
    byMatchLevel: {
      ...summary.byMatchLevel,
      [comparison.matchLevel]: summary.byMatchLevel[comparison.matchLevel] + 1,
    },
    cityMismatches: summary.cityMismatches + (cityMismatch ? 1 : 0),
    compared: summary.compared + 1,
    coordinatesUpgraded: summary.coordinatesUpgraded + (upgraded ? 1 : 0),
    districtDiverging: summary.districtDiverging + (comparison.districtDiverges ? 1 : 0),
    postalCodeDiverging: summary.postalCodeDiverging + (comparison.postalCodeDiverges ? 1 : 0),
    skipped: summary.skipped,
    streetDiverging: summary.streetDiverging + (comparison.streetDiverges ? 1 : 0),
  }
}

/**
 * Distância só quando há dois pontos comparáveis. Município divergente já descartou o resultado —
 * medir a distância até uma coordenada recusada publicaria um número que não significa nada.
 */
function toDistance(input: {
  candidate: ComparisonCandidate
  cityMismatch: boolean
  result: { latitude: null | string; longitude: null | string }
}): null | number {
  const { candidate, cityMismatch, result } = input
  if (cityMismatch) return null
  if (candidate.latitude === null || candidate.longitude === null) return null
  if (result.latitude === null || result.longitude === null) return null

  return distanceInMetres(
    { latitude: candidate.latitude, longitude: candidate.longitude },
    { latitude: result.latitude, longitude: result.longitude },
  )
}

/**
 * A coordenada comprada entra na base, e é isso que faz o lote ser pago **uma vez** — endereço já
 * visto nunca é geocodificado de novo (ADR-0044 §3).
 *
 * Quatro portões, e nenhum é decorativo:
 *
 * - **município divergente** já descartou o resultado; gravá-lo seria precisão alta na cidade errada;
 * - **sem `place_id`** o CHECK `geocoded_addresses_place_id_check` recusaria a linha `google`;
 * - **`approximate`** não é melhoria: o provedor caiu no mesmo centroide que a escada grátis já
 *   conhecia, e gravá-lo marcaria o endereço como resolvido sem nada ter melhorado;
 * - **`shouldReplaceStored`** é quem garante que correção manual nunca é desfeita e que precisão
 *   grossa nunca substitui fina. O `where` do upsert repete a primeira metade porque entre ler e
 *   decidir cabe outra escrita.
 */
async function storeCoordinate(input: {
  candidate: ComparisonCandidate
  cityMismatch: boolean
  dependencies: { readonly geocoded: GeocodedAddressRepository }
  result: {
    latitude: null | string
    longitude: null | string
    matchLevel: ProviderMatchLevel
    placeId: string
  }
}): Promise<boolean> {
  const { candidate, cityMismatch, dependencies, result } = input
  if (cityMismatch) return false
  if (result.latitude === null || result.longitude === null) return false
  if (result.placeId.length === 0) return false

  const precision = toStoredPrecision(result.matchLevel)
  if (precision === null) return false

  const replaces = shouldReplaceStored({
    candidatePrecision: precision,
    candidateSource: 'google',
    storedPrecision: candidate.precision,
    storedSource: candidate.source,
  })
  if (!replaces) return false

  await dependencies.geocoded.save({
    addressKey: candidate.addressKey,
    externalPlaceId: result.placeId,
    latitude: result.latitude,
    longitude: result.longitude,
    precision,
    source: 'google',
  })

  return true
}
