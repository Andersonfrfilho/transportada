/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision, ProviderMatchLevel } from '../../database/database.schema.js'

/**
 * Um endereço da base, com o texto que a nota trouxe e a coordenada que hoje se usa (spec 084, G6).
 * É PII: **nada disto vai para log**, e o que identifica a linha no relatório é a `addressKey`.
 */
export type ComparisonCandidate = Readonly<{
  addressKey: string
  city: string
  cityCode: string
  companyId: string
  district: string
  latitude: null | string
  longitude: null | string
  number: string
  postalCode: string
  precision: GeocodingPrecision
  state: string
  street: string
}>

export type AddressComparisonRecord = Readonly<{
  addressKey: string
  cityMismatch: boolean
  companyId: string
  distanceMetres: null | number
  districtDiverges: boolean
  matchLevel: ProviderMatchLevel
  noteDistrict: string
  noteNumber: string
  notePostalCode: string
  noteStreet: string
  postalCodeDiverges: boolean
  providerDistrict: string
  providerNumber: string
  providerPlaceId: string
  providerPostalCode: string
  providerStreet: string
  streetDiverges: boolean
}>

export type AddressComparisonRepository = Readonly<{
  findCandidates: (input: {
    readonly companyId: string
    readonly limit: number
    readonly precisions: readonly GeocodingPrecision[]
  }) => Promise<readonly ComparisonCandidate[]>
  saveComparison: (record: AddressComparisonRecord) => Promise<void>
}>

/**
 * O provedor devolve o município **por nome**; `checkCityMatch` compara por **código IBGE**, porque
 * nome volta em grafia, acentuação e caixa variadas. Esta porta é a ponte entre os dois, e ela
 * resolve contra o que a nossa própria base já conhece — que é, por construção, o conjunto de
 * municípios para onde esta empresa entrega.
 *
 * `null` é resposta legítima e **segura**: município que não sabemos nomear é indistinguível de
 * município errado, e `checkCityMatch` descarta os dois.
 */
export type CityDirectoryPort = Readonly<{
  resolveCityCode: (input: {
    readonly name: string
    readonly state: string
  }) => Promise<null | string>
}>
