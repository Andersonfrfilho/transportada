/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodeAddressRequest } from '../../routing/application/geocoding.port.js'
import type { PlaceCandidate } from '../domain/place-acceptance.policy.js'

/**
 * O degrau 2b (adendo de 2026-09-05 à ADR-0062): a busca de lugar, quando a geocodificação de
 * endereço devolve só o município.
 *
 * ⚠️ Ela **não** manda o nome do destinatário — só o endereço, com os erros de grafia que a nota
 * trouxe. Medido: isso basta, e mantém intacta a linha do `CLAUDE.md` de que o seam de endereço lê o
 * lugar, nunca quem consome.
 */
export type PlaceLookup = PlaceCandidate &
  Readonly<{
    latitude: string
    longitude: string
    placeId: string
  }>

/**
 * `no_result` é resposta legítima e **desejada**: a Places recusa endereço que não existe em vez de
 * devolver palpite, e é essa recusa que torna o degrau seguro (medido em 2026-09-05).
 *
 * `transport_error` é o único que **adia** — ele não é resposta e não cobra, e queimar a chance paga
 * única do endereço por um minuto de rede ruim é o que a ADR-0062 §1 existe para não fazer.
 */
export type PlaceLookupResult =
  | Readonly<{ cause: 'no_result' | 'not_configured' | 'transport_error'; place: null }>
  | Readonly<{ cause: null; place: PlaceLookup }>

export type PlaceLookupPort = Readonly<{
  lookup: (request: GeocodeAddressRequest) => Promise<PlaceLookupResult>
}>
