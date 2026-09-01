/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  MAP_VIEWBOX_SIZE,
  formatCoordinate,
  projectPoint,
  toPoint,
} from '../../src/modules/deliveries/shared/mapProjection.service'

const RIBEIRAO_PRETO = { latitude: -21.1767, longitude: -47.8208 }

describe('o mapa desenhado por nós (spec 063 T010)', () => {
  test('o centro da janela cai no centro do desenho', () => {
    expect(projectPoint({ center: RIBEIRAO_PRETO, point: RIBEIRAO_PRETO })).toEqual({
      x: MAP_VIEWBOX_SIZE / 2,
      y: MAP_VIEWBOX_SIZE / 2,
    })
  })

  /** No SVG o eixo y cresce para baixo, e a latitude cresce para o norte: um inverte o outro. */
  test('o norte sobe na tela', () => {
    const north = projectPoint({
      center: RIBEIRAO_PRETO,
      point: { ...RIBEIRAO_PRETO, latitude: RIBEIRAO_PRETO.latitude + 0.1 },
    })

    expect(north.y).toBeLessThan(MAP_VIEWBOX_SIZE / 2)
  })

  /**
   * A longitude é corrigida pelo cosseno da latitude: sem isso, um grau de longitude no sul do país
   * teria a mesma largura de um grau no equador, e a posição sairia do lugar.
   */
  test('corrige a longitude pela latitude', () => {
    const east = projectPoint({
      center: RIBEIRAO_PRETO,
      point: { ...RIBEIRAO_PRETO, longitude: RIBEIRAO_PRETO.longitude + 0.1 },
    })
    const northOfIt = projectPoint({
      center: RIBEIRAO_PRETO,
      point: { ...RIBEIRAO_PRETO, latitude: RIBEIRAO_PRETO.latitude + 0.1 },
    })

    const eastOffset = east.x - MAP_VIEWBOX_SIZE / 2
    const northOffset = MAP_VIEWBOX_SIZE / 2 - northOfIt.y

    expect(eastOffset).toBeLessThan(northOffset)
    expect(eastOffset).toBeGreaterThan(northOffset * 0.9)
  })

  /** Ponto fora da janela é preso na borda: desenhar fora do `viewBox` seria desenhar no nada. */
  test('prende o ponto distante na borda', () => {
    const far = projectPoint({
      center: RIBEIRAO_PRETO,
      point: { latitude: -23.5, longitude: -46.6 },
    })

    expect(far.x).toBe(MAP_VIEWBOX_SIZE)
    expect(far.y).toBe(MAP_VIEWBOX_SIZE)
  })

  /** A coordenada chega como texto da API — vira número só para desenhar, nunca para voltar. */
  test('recusa coordenada que não é coordenada', () => {
    expect(toPoint({ latitude: '-21.1767000', longitude: '-47.8208000' })).toEqual(RIBEIRAO_PRETO)
    expect(toPoint({ latitude: 'norte', longitude: '-47.8' })).toBeNull()
    expect(toPoint({ latitude: '-100', longitude: '0' })).toBeNull()
  })

  /** Quatro casas é ~11 metros: onde está, e nada além disso. */
  test('imprime quatro casas', () => {
    expect(formatCoordinate(-21.176712345)).toBe('-21.1767')
  })
})
