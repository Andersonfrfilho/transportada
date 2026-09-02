/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'
import type { GeocodeAddressRequest } from './geocoding.port.js'

/**
 * O endereço por extenso, para o degrau 2. A cascata do worker vive só de CEP e município, mas o
 * provedor pago existe justamente para acertar **logradouro e número** — mandar a ele o que a chave
 * carrega seria pagar por uma precisão que não se pediu.
 *
 * A leitura é escopada pela empresa do contexto: a coordenada não tem tenant, mas **o endereço tem**
 * — ele vem da nota, e ler a nota de outra empresa para montar a consulta seria vazamento.
 */
export type AddressComponentsSource = Readonly<{
  byAddressKey: (input: {
    readonly addressKey: string
    readonly companyId: string
  }) => Promise<GeocodeAddressRequest | null>
}>

/**
 * As três respostas da marca, e **nenhuma delas é silêncio** (RF5). O conferente marcou porque quer
 * saber: sem resposta ele conclui que a marca não funciona e para de usá-la.
 */
export type RefineAddressOutcome = 'refined' | 'not_improved' | 'provider_not_configured'

export type RefineAddressResult = Readonly<{
  latitude?: string
  longitude?: string
  outcome: RefineAddressOutcome
  precision?: GeocodingPrecision
}>
