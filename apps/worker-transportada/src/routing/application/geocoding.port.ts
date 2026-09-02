/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision, GeocodingSource } from '../../database/routing.schema.js'

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
 *
 * ⚠️ Estes tipos são **declaração, não regra**, e por isso existem também na API — as duas apps não
 * importam código uma da outra (adendo 2026-09-01 da ADR-0044). O que **não** se repete é lógica: a
 * cascata mora só aqui, e a ordenação de precisão mora só na API.
 */
/**
 * Por que não resolveu — **sem dizer qual endereço** (RNF1). Sem isto a métrica conta o fracasso e
 * não o nomeia: staging passou seis ciclos dizendo `unresolved: 5` sem nada distinguir CEP
 * inexistente de egresso bloqueado de defeito nosso, e as três exigem respostas opostas.
 *
 * O comentário do gateway dizia que "a causa seria tentadora de registrar" — e a leitura certa
 * daquilo é **não registrar o endereço**, não deixar de registrar a causa.
 */
export const GEOCODE_FAILURE_CAUSES = [
  'not_configured',
  'invalid_postal_code',
  'not_found',
  'no_coordinate',
  'transport_error',
] as const
export type GeocodeFailureCause = (typeof GEOCODE_FAILURE_CAUSES)[number]

export type GeocodeResult =
  | Readonly<{ cause: null; coordinate: GeocodedCoordinate }>
  | Readonly<{ cause: GeocodeFailureCause; coordinate: null }>

export type GeocodingPort = Readonly<{
  geocode: (request: GeocodeAddressRequest) => Promise<GeocodeResult>
}>

export type GeocodedAddressRecord = GeocodedCoordinate & Readonly<{ addressKey: string }>

export type GeocodedAddressRepository = Readonly<{
  findByKeys: (addressKeys: readonly string[]) => Promise<readonly GeocodedAddressRecord[]>
  save: (record: GeocodedAddressRecord) => Promise<void>
}>
