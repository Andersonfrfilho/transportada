/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ProviderMatchLevel } from '../../database/address-comparison.schema.js'
import type { ProviderAddress } from '../domain/provider-address.policy.js'

/**
 * O que se pergunta ao provedor. É PII (`security.md` §1): **nada disto vai para log**, em nenhum
 * nível — quem rastreia é a `addressKey`, que não diz onde ninguém mora.
 */
export type AddressLookupRequest = Readonly<{
  city: string
  cityCode: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

/**
 * O que o provedor respondeu — **medição, não veredito**. Quem julga divergência é
 * `compareAddresses`; quem descarta resultado de outro município é `checkCityMatch`.
 */
export type AddressLookupResult = Readonly<{
  address: ProviderAddress
  /** Nulos quando o provedor não achou nada: `not_found` é resultado, e resultado sem lugar. */
  latitude: null | string
  longitude: null | string
  matchLevel: ProviderMatchLevel
  placeId: string
}>

/**
 * O degrau 2 visto pelo lote de medição (**ADR-0061**), ao lado do `GeocodingPort`, que é o mesmo
 * degrau visto pela marca humana numa parada. São portas separadas porque as consultas divergem num
 * ponto que importa: aquela **filtra** pelo nosso CEP para achar a coordenada mais fina dele; esta
 * **não pode**, porque é a divergência de CEP que ela veio medir.
 *
 * ⚠️ **`null` é "não consegui perguntar", nunca "não achou".** Rede fora do ar gravada como
 * `not_found` diria que o provedor não conhece o endereço, e o relatório mandaria o contratante
 * corrigir um cadastro que está certo. O lote pula a linha e tenta de novo depois.
 */
export type AddressLookupPort = Readonly<{
  lookup: (request: AddressLookupRequest) => Promise<AddressLookupResult | null>
}>
