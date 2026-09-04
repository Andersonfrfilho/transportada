/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision, ProviderMatchLevel } from '../../database/database.schema.js'
import { compareAddresses } from '../domain/address-comparison.policy.js'
import { checkCityMatch } from '../domain/city-match.policy.js'
import { distanceInMetres } from '../domain/coordinate-distance.js'
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

  return {
    byMatchLevel: {
      ...summary.byMatchLevel,
      [comparison.matchLevel]: summary.byMatchLevel[comparison.matchLevel] + 1,
    },
    cityMismatches: summary.cityMismatches + (cityMismatch ? 1 : 0),
    compared: summary.compared + 1,
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
