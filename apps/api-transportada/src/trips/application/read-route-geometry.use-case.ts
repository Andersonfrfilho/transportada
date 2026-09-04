/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A linha da estrada da viagem, para o mapa.
 *
 * Rota **própria e preguiçosa**, fora do detalhe da viagem: a chamada ao OSRM custou 63 ms medidos
 * em staging, e o detalhe é leitura quente que abre a tela inteira. O mapa desenha as paradas
 * primeiro e engrossa a linha depois.
 */
import { simplifyRouteGeometry, type RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type { RouteGeometryLeg, RouteGeometryPort } from './route-geometry.port.js'

/**
 * O desvio máximo aceito entre a linha desenhada e a estrada de verdade.
 *
 * ⚠️ **Cinco metros porque o mapa tem zoom.** O valor anterior era derivado da extensão da rota
 * (`extent / 600`), herdado do mapa SVG de largura fixa — nesta rota de três paradas isso dava
 * **126 metros**, e a linha cortava quarteirão e saía da rua ao aproximar. Cinco metros é menos que
 * a largura de uma pista, então a linha fica sobre o asfalto em qualquer zoom que o painel alcança.
 */
const TOLERANCE_METRES = 5

/** Cinco casas ≈ 1 m: abaixo do pixel em qualquer escala que este mapa desenhe. */
const COORDINATE_SCALE = 5

export const ROUTE_GEOMETRY_SOURCES = ['road', 'unavailable'] as const
export type RouteGeometrySource = (typeof ROUTE_GEOMETRY_SOURCES)[number]

export type RouteGeometryView = {
  /**
   * Um trecho por par de paradas consecutivas, **medido na estrada**. Vazio quando a estrada não
   * veio — e aí a tela não mostra tempo nenhum. A ADR-0044 §5 é explícita: sem o roteirizador não se
   * estima, porque número plausível e errado é pior que número nenhum.
   */
  readonly legs: readonly RouteGeometryLeg[]
  readonly points: readonly { readonly latitude: string; readonly longitude: string }[]
  readonly source: RouteGeometrySource
}

export type ReadRouteGeometryInput = {
  readonly geometry: RouteGeometryPort
  readonly stops: readonly RouteGeometryPoint[]
}

/**
 * ⚠️ `unavailable` com lista vazia é o **único** jeito de dizer "não sei o caminho". Devolver as
 * próprias paradas como se fossem a estrada faria a tela desenhar retas anunciando rodovia — e uma
 * reta entre dois pontos atravessa rio, serra e ferrovia sem pedir licença.
 */
export async function readRouteGeometry(input: ReadRouteGeometryInput): Promise<RouteGeometryView> {
  if (input.stops.length < 2) return { legs: [], points: [], source: 'unavailable' }

  const road = await input.geometry.readRouteGeometry(input.stops)
  if (road === null) return { legs: [], points: [], source: 'unavailable' }

  /**
   * ⚠️ A simplificação é do **desenho**, e os trechos passam intactos por ela. Jogar fora ponto para
   * caber no pixel não pode encurtar a distância que o operador lê — o traço é aproximação, o número
   * não é.
   */
  const simplified = simplifyRouteGeometry(road.points, { toleranceMetres: TOLERANCE_METRES })

  return {
    legs: road.legs,
    points: simplified.map((point) => ({
      latitude: point.latitude.toFixed(COORDINATE_SCALE),
      longitude: point.longitude.toFixed(COORDINATE_SCALE),
    })),
    source: 'road',
  }
}
