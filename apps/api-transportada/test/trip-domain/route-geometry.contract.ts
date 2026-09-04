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
   * ⚠️ **A tolerância é em metro, e essa é a correção que importa.** Antes ela era
   * `extensão da rota ÷ 600`, herdado do mapa SVG de largura fixa: o critério **piorava quanto mais
   * longa a viagem**. Medido numa rota real de três paradas, extensão de 0,68° dava **126 metros**
   * de desvio aceito — a linha cortava quarteirão e saía da rua ao aproximar no mapa vetorial, que
   * tem zoom. Metro é o critério certo porque o desvio que importa é o do chão, não o da tela.
   */
  it('mede a tolerância em metro, sem depender do tamanho da rota', () => {
    const grosso = simplifyRouteGeometry(ONDULADA, { toleranceMetres: 5_000 })
    const fino = simplifyRouteGeometry(ONDULADA, { toleranceMetres: 1 })

    expect(grosso).toHaveLength(2)
    expect(fino.length).toBeGreaterThan(grosso.length)
  })

  /**
   * ⚠️ O teste que a versão anterior não tinha: **a mesma forma, alongada, guarda o mesmo detalhe**.
   * Com a tolerância derivada da extensão, esticar a rota afrouxava o critério e comia curva — que
   * é exatamente como 126 metros apareceram numa viagem intermunicipal.
   */
  it('não afrouxa o detalhe só porque a rota é mais longa', () => {
    const curta = COM_DEGRAU
    const longa = COM_DEGRAU.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude * 100,
    }))

    const detalheCurta = simplifyRouteGeometry(curta, { toleranceMetres: 5 }).length
    const detalheLonga = simplifyRouteGeometry(longa, { toleranceMetres: 5 }).length

    expect(detalheLonga).toBeGreaterThanOrEqual(detalheCurta)
  })

  /** As duas pontas são o começo e o fim da rota: comê-las moveria a linha para outro lugar. */
  it('never moves the ends', () => {
    const simplificada = simplifyRouteGeometry(COM_DEGRAU, { toleranceMetres: 50_000 })

    expect(simplificada.at(0)).toEqual(COM_DEGRAU[0]!)
    expect(simplificada.at(-1)).toEqual(COM_DEGRAU.at(-1)!)
  })

  /** O desvio que importa sobrevive: é ele que distingue a estrada da linha reta. */
  it('keeps the detour that makes the road a road', () => {
    const simplificada = simplifyRouteGeometry(COM_DEGRAU, { toleranceMetres: 5 })

    expect(simplificada).toContainEqual({ latitude: 0.5, longitude: 0.5 })
  })

  /**
   * Rota que é mesmo uma reta vira duas pontas — e é assim que o payload continua pequeno: a maior
   * parte dos 1285 pontos do OSRM é trecho reto amostrado de metro em metro.
   */
  it('collapses a straight run to its two ends', () => {
    const reta: readonly RouteGeometryPoint[] = Array.from({ length: 50 }, (_unused, index) => ({
      latitude: 0,
      longitude: index / 49,
    }))

    expect(simplifyRouteGeometry(reta, { toleranceMetres: 5 })).toHaveLength(2)
  })

  /** Menos de dois pontos não é linha; devolvê-los como estão evita conta sobre lista vazia. */
  it('returns what it got when there is no line to simplify', () => {
    expect(simplifyRouteGeometry([], { toleranceMetres: 5 })).toEqual([])
    expect(simplifyRouteGeometry([COM_DEGRAU[0]!], { toleranceMetres: 5 })).toHaveLength(1)
  })

  /** Rota inteira num ponto só não pode quebrar o desenho. */
  it('survives a route with no extent at all', () => {
    const parado = [COM_DEGRAU[0]!, COM_DEGRAU[0]!, COM_DEGRAU[0]!]

    expect(simplifyRouteGeometry(parado, { toleranceMetres: 5 }).length).toBeGreaterThan(0)
  })
})
