/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { buildTripBasemapPaths } from '@/modules/trip/shared/tripBasemap.service'

const project = (point: { readonly latitude: number; readonly longitude: number }) => ({
  x: point.longitude,
  y: -point.latitude,
})

const SAO_CARLOS = {
  code: '3548906',
  rings: [
    [
      [-47.9, -22.0],
      [-47.8, -22.0],
      [-47.8, -21.9],
    ],
  ] as const,
}

const OUTRA = {
  code: '3509502',
  rings: [
    [
      [-47.1, -22.8],
      [-47.0, -22.8],
      [-47.0, -22.7],
    ],
  ] as const,
}

/**
 * O mapa desenhava pinos e a linha da estrada sobre um retângulo vazio — e é isso que se lê como
 * "não aparece mapa". O fundo é o contorno do IBGE, o mesmo que a aba Regiões usa, **projetado na
 * escala das paradas** para desenho e pontos falarem do mesmo lugar.
 */
describe('o fundo do mapa do roteiro (spec 080 T005)', () => {
  it('desenha só os municípios que a viagem toca', () => {
    const paths = buildTripBasemapPaths({
      cityCodes: [SAO_CARLOS.code],
      features: [SAO_CARLOS, OUTRA],
      project,
    })

    expect(paths).toHaveLength(1)
    expect(paths[0]).toStartWith('M-47.9 22')
  })

  /**
   * ⚠️ O estado inteiro num enquadramento de três paradas vizinhas sai como borrão que cobre a tela
   * sem localizar nada. Sem código de município não há recorte — e aí é melhor nenhum fundo.
   */
  it('sem código de município não desenha fundo', () => {
    expect(buildTripBasemapPaths({ cityCodes: [''], features: [SAO_CARLOS], project })).toEqual([])
  })

  /** Ilha e enclave viram **um** caminho com subcaminhos: anel por anel pintaria a cidade duas vezes. */
  it('junta os anéis do mesmo município num caminho só', () => {
    const ilha = { code: SAO_CARLOS.code, rings: [...SAO_CARLOS.rings, SAO_CARLOS.rings[0]] }
    const [path] = buildTripBasemapPaths({ cityCodes: [ilha.code], features: [ilha], project })

    expect(path?.match(/Z/gu)).toHaveLength(2)
  })
})
