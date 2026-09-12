/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { toLayers, type PlacedBox } from '../../src/trips/domain/cargo-placement.policy.js'

function placedBox(overrides: Partial<PlacedBox>): PlacedBox {
  return {
    depthM: 0.4,
    documentId: null,
    documentNumber: null,
    heightM: 0.25,
    isFragile: false,
    label: 'CAIXA',
    layer: 0,
    reasons: [],
    source: 'measured',
    stopSequence: 1,
    widthM: 0.4,
    xM: 0,
    yM: 0,
    zM: 0,
    ...overrides,
  }
}

describe('camadas do desenho 3D contam pela altura, não pelo contador da busca', () => {
  /** Bug real: a tela mostrava "Camada 97 / 138 / 195" — o contador de busca, não a elevação. */
  test('duas caixas empilhadas (0 e 0,25 m) viram camada 0 e camada 1', () => {
    const bottom = placedBox({ label: 'BASE', layer: 0, zM: 0 })
    const top = placedBox({ label: 'TOPO', layer: 1, zM: 0.25 })

    const layers = toLayers([bottom, top])

    expect(layers.map((layer) => layer.index)).toEqual([0, 1])
    expect(layers[0]?.boxes).toEqual([bottom])
    expect(layers[1]?.boxes).toEqual([top])
  })

  test('contador de busca grande e não contíguo não vaza para a numeração da camada', () => {
    const floor = placedBox({ label: 'PISO', layer: 97, zM: 0 })
    const middle = placedBox({ label: 'MEIO', layer: 138, zM: 0.25 })
    const top = placedBox({ label: 'TOPO', layer: 195, zM: 0.5 })

    const layers = toLayers([floor, middle, top])

    expect(layers.map((layer) => layer.index)).toEqual([0, 1, 2])
    expect(layers[0]?.boxes).toEqual([floor])
    expect(layers[1]?.boxes).toEqual([middle])
    expect(layers[2]?.boxes).toEqual([top])
  })

  test('caixas na mesma altura, dentro da tolerância de 1 mm, ficam na mesma camada', () => {
    const left = placedBox({ label: 'ESQUERDA', layer: 3, zM: 0.5 })
    const right = placedBox({ label: 'DIREITA', layer: 9, zM: 0.5003 })

    const layers = toLayers([left, right])

    expect(layers).toHaveLength(1)
    expect(layers[0]?.boxes).toEqual([left, right])
  })
})
