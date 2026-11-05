/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CorrectionOrigin } from '../../database/geocoded-address-correction.schema.js'
import type { GeocodingPrecision, GeocodingSource } from '../../database/geocoding.schema.js'

/**
 * O que se manda ao geocodificador. É PII (`security.md` §1) — **nada disto vai para log**, em
 * nenhum nível: a chamada é encanamento, e o identificador que rastreia é a `addressKey`.
 */
export type GeocodeAddressRequest = Readonly<{
  addressKey: string
  city: string
  cityCode: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type GeocodedCoordinate = Readonly<{
  externalPlaceId: string
  latitude: string
  longitude: string
  precision: GeocodingPrecision
  source: GeocodingSource
}>

/**
 * ADR-0044 §3, mitigação 2: a porta é o que torna a troca de provedor um adaptador novo em vez de
 * uma reescrita — e a cascata de precisão é o vocabulário comum entre eles.
 *
 * `null` é resposta legítima: o provedor não achou o endereço. Quem chama decide a cascata (CEP →
 * município); o adaptador não inventa coordenada para não devolver vazio.
 */
export type GeocodingPort = Readonly<{
  geocode: (request: GeocodeAddressRequest) => Promise<GeocodedCoordinate | null>
}>

export type GeocodedAddressRecord = GeocodedCoordinate & Readonly<{ addressKey: string }>

export type GeocodedAddressRepository = Readonly<{
  findByKeys: (addressKeys: readonly string[]) => Promise<readonly GeocodedAddressRecord[]>
  save: (record: GeocodedAddressRecord) => Promise<void>
}>

/**
 * A correção humana de coordenada, **com trilha** (spec 084, G1/RF4).
 *
 * ⚠️ **Coordenada e trilha numa transação só.** Em duas escritas, uma falha no meio deixaria o
 * endereço corrigido sem registro de quem o corrigiu — e o relatório da 084 mede exatamente isso.
 */
export type GeocodedAddressCorrectionInput = {
  readonly actorUserId: string
  readonly addressKey: string
  readonly companyId: string
  readonly latitude: string
  readonly longitude: string
  /** Spec 294 (ADR-0113): a chegada do motorista grava `driver`/`driver`; o padrão é o pino do operador. */
  readonly origin?: CorrectionOrigin
  /** Spec 294 S3: a chegada grava `street` (refinável); o pino do operador segue `rooftop`. */
  readonly precision?: 'rooftop' | 'street'
  readonly source?: 'driver' | 'manual'
}

export type GeocodedAddressCorrectionResult = {
  readonly applied: boolean
  readonly previous: GeocodedAddressRecord | null
}

export type GeocodedAddressCorrectionRepository = Readonly<{
  /**
   * `applied: false` quando o banco recusou a escrita. Ele **precisa** existir: a rota devolvia
   * `200` com a coordenada nova enquanto o `where` do upsert descartava a atualização em silêncio,
   * e a resposta mentia.
   */
  applyCorrection: (
    input: GeocodedAddressCorrectionInput,
  ) => Promise<GeocodedAddressCorrectionResult>
}>
