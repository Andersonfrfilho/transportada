/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { searchAddress } from '../../src/modules/fleet/shared/driverAddress.service'

/** Uma resposta do Photon como ela chega: GeoJSON, com a coordenada em `geometry`. */
function photon(coordinates: unknown): unknown {
  return {
    features: [
      {
        geometry: { coordinates, type: 'Point' },
        properties: {
          city: 'Sertãozinho',
          housenumber: '2043',
          name: 'Rua Antônio Fagundes',
          postcode: '14170-480',
          state: 'São Paulo',
          street: 'Rua Antônio Fagundes',
        },
        type: 'Feature',
      },
    ],
    type: 'FeatureCollection',
  }
}

async function buscar(payload: unknown) {
  return searchAddress({
    /** `Promise.resolve` e não `async`: a forma precisa devolver promessa, mas não há o que esperar. */
    fetch: (() =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'application/json' },
        }),
      )) as unknown as typeof fetch,
    signal: new AbortController().signal,
    term: 'Rua Antônio Fagundes',
  })
}

describe('a coordenada da casa do motorista (spec 097 D6)', () => {
  /**
   * ⚠️ **Ela já chegava e era jogada fora.** O Photon devolve GeoJSON e `fromPhotonFeature` lia só
   * `properties`; a coordenada morria na linha seguinte desde que a ADR-0037 tirou o mapa do
   * cadastro. Guardá-la é o que permite o retorno da viagem ter destino sem consultar provedor pago,
   * que é o que a ADR-0044 recusa.
   */
  it('guarda a coordenada que o provedor já devolve', async () => {
    const [sugestao] = await buscar(photon([-47.9901234, -21.1372345]))

    expect(sugestao?.latitude).toBe('-21.1372345')
    expect(sugestao?.longitude).toBe('-47.9901234')
  })

  /**
   * ⚠️ **GeoJSON é `[longitude, latitude]`, nesta ordem** — o inverso de como se fala. Trocar as
   * duas põe a casa de Sertãozinho no Oceano Índico, e o número continua parecendo uma coordenada.
   * O contrato existe para essa troca não passar.
   */
  it('lê longitude primeiro, como o GeoJSON manda', async () => {
    const [sugestao] = await buscar(photon([-47.9901234, -21.1372345]))

    expect(Number(sugestao?.latitude)).toBeLessThan(0)
    expect(Number(sugestao?.latitude)).toBeGreaterThan(-34)
    expect(Number(sugestao?.longitude)).toBeLessThan(-34)
  })

  /**
   * ⚠️ Coordenada ausente ou ilegível é **ausência**, nunca zero: `0,0` é o golfo da Guiné, e o
   * endereço continua servindo — o que se perde é só o retorno automático, que cai no da empresa.
   */
  it('sugestão sem coordenada continua válida, e sem par', async () => {
    for (const ruim of [undefined, [], ['a', 'b'], [-47.99], null]) {
      const [sugestao] = await buscar(photon(ruim))

      expect(sugestao?.street).toBe('Rua Antônio Fagundes')
      expect(sugestao?.latitude).toBeNull()
      expect(sugestao?.longitude).toBeNull()
    }
  })

  /**
   * ⚠️ **Meia coordenada não existe.** Um par pela metade cairia no meridiano ou no equador, e o
   * mapa desenharia a casa no oceano — o mesmo que o CHECK do banco recusa do outro lado.
   */
  it('descarta o par inteiro quando só uma metade é legível', async () => {
    const [sugestao] = await buscar(photon([-47.9901234, 'nao-e-numero']))

    expect(sugestao?.latitude).toBeNull()
    expect(sugestao?.longitude).toBeNull()
  })
})
