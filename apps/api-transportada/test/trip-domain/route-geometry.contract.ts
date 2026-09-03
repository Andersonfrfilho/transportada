/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  simplifyRouteGeometry,
  type RouteGeometryPoint,
} from '../../src/trips/domain/route-geometry.policy.js'

/** Uma reta com um degrau no meio: o degrau é a única coisa que a simplificação não pode comer. */
const COM_DEGRAU: readonly RouteGeometryPoint[] = [
  { latitude: 0, longitude: 0 },
  { latitude: 0.0001, longitude: 0.25 },
  { latitude: 0.5, longitude: 0.5 },
  { latitude: 0.0001, longitude: 0.75 },
  { latitude: 0, longitude: 1 },
]

/**
 * Uma linha quase reta, com ondulação de ~100 m. É a forma que o OSRM devolve num trecho de
 * rodovia: nenhum desvio grande, e muito ponto que só existe pela amostragem.
 */
const ONDULADA: readonly RouteGeometryPoint[] = Array.from({ length: 41 }, (_unused, index) => ({
  latitude: index % 2 === 0 ? 0 : 0.001,
  longitude: index / 40,
}))

describe('route geometry simplification (spec 079, geometria do OSRM)', () => {
  /**
   * ⚠️ A tolerância é **da escala**, não uma constante: uma viagem intermunicipal de 64 km e um
   * roteiro dentro de um bairro cabem no mesmo `viewBox`, e o metro que some num desenho é visível
   * no outro. Medido em staging: 1285 pontos das 64 km viram 162 com erro de 11 m, que é sub-pixel
   * a 600px — mas os mesmos 11 m num roteiro de 2 km seriam três pixels de desvio.
   */
  it('derives the tolerance from the drawing extent, not from a fixed number', () => {
    const largo = simplifyRouteGeometry(ONDULADA, { targetPixels: 10 })
    const estreito = simplifyRouteGeometry(ONDULADA, { targetPixels: 4000 })

    // A 10px a ondulação inteira cabe num pixel e some; a 4000px cada crista vale vários.
    expect(largo).toHaveLength(2)
    expect(estreito.length).toBeGreaterThan(largo.length)
  })

  /** As duas pontas são o começo e o fim da rota: comê-las moveria a linha para outro lugar. */
  it('never moves the ends', () => {
    const simplificada = simplifyRouteGeometry(COM_DEGRAU, { targetPixels: 2 })

    expect(simplificada.at(0)).toEqual(COM_DEGRAU[0]!)
    expect(simplificada.at(-1)).toEqual(COM_DEGRAU.at(-1)!)
  })

  /** O desvio que importa sobrevive: é ele que distingue a estrada da linha reta. */
  it('keeps the detour that makes the road a road', () => {
    const simplificada = simplifyRouteGeometry(COM_DEGRAU, { targetPixels: 600 })

    expect(simplificada).toContainEqual({ latitude: 0.5, longitude: 0.5 })
  })

  /**
   * Rota que é mesmo uma reta vira duas pontas — e é assim que o payload cai de 28 KB para
   * quilobytes: a maior parte dos 1285 pontos do OSRM é trecho reto amostrado de metro em metro.
   */
  it('collapses a straight run to its two ends', () => {
    const reta: readonly RouteGeometryPoint[] = Array.from({ length: 50 }, (_unused, index) => ({
      latitude: 0,
      longitude: index / 49,
    }))

    expect(simplifyRouteGeometry(reta, { targetPixels: 600 })).toHaveLength(2)
  })

  /** Menos de dois pontos não é linha; devolvê-los como estão evita `NaN` na extensão. */
  it('returns what it got when there is no line to simplify', () => {
    expect(simplifyRouteGeometry([], { targetPixels: 600 })).toEqual([])
    expect(simplifyRouteGeometry([COM_DEGRAU[0]!], { targetPixels: 600 })).toHaveLength(1)
  })

  /**
   * ⚠️ Extensão zero — a rota inteira num ponto só — daria tolerância zero e divisão por zero na
   * escala. Simplificar não pode ser o passo que quebra o desenho.
   */
  it('survives a route with no extent at all', () => {
    const parado = [COM_DEGRAU[0]!, COM_DEGRAU[0]!, COM_DEGRAU[0]!]

    expect(simplifyRouteGeometry(parado, { targetPixels: 600 }).length).toBeGreaterThan(0)
  })
})
