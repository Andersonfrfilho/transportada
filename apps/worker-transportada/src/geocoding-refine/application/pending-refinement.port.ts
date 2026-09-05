/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision } from '../../database/routing.schema.js'
import type { GeocodeAddressRequest } from '../../routing/application/geocoding.port.js'

/**
 * Um endereço guardado em centroide de município que ainda não custou uma chamada paga.
 *
 * A requisição vem **por extenso** — logradouro, número, bairro, cidade, UF —, ao contrário da
 * rotina gratuita, que manda só o CEP. É a diferença inteira: o que o degrau 1 não consegue é
 * justamente distinguir um endereço dentro do município, e mandar o mesmo CEP a um provedor mais
 * caro devolveria o mesmo palpite por mais dinheiro.
 */
export type PendingRefinement = Readonly<{ request: GeocodeAddressRequest }>

export type PendingRefinementSource = Readonly<{
  list: (input: { readonly limit: number }) => Promise<readonly PendingRefinement[]>
}>

export type RefinedAddressRepository = Readonly<{
  /**
   * Carimba `paid_refined_at` **sem tocar na coordenada**: é o que se grava quando o provedor não
   * melhorou nada. Sem isto o endereço voltaria na janela seguinte e seria cobrado de novo, para
   * sempre — o modo de falha que a ADR-0062 existe para não ter.
   */
  markPaid: (addressKey: string) => Promise<void>
  /**
   * Grava a coordenada comprada **e** o carimbo, na mesma escrita. Ao contrário do `save` da cascata
   * (`drizzle-geocoded-address.repository.ts`), este sobrescreve de propósito — e só pode, porque
   * quem chama já provou que o candidato é mais fino que `city`, que é a única precisão selecionada.
   */
  replace: (input: {
    readonly addressKey: string
    readonly externalPlaceId: string
    readonly latitude: string
    readonly longitude: string
    readonly precision: GeocodingPrecision
  }) => Promise<void>
}>
