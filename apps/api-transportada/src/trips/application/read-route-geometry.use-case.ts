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
import type { RouteGeometryPort } from './route-geometry.port.js'

/**
 * Largura de desenho em pixels usada para decidir o que é visível. O `viewBox` do mapa é 100×100 e
 * escala com o CSS; 600 é a largura típica do painel, e errar para mais só guarda ponto a mais.
 */
const TARGET_PIXELS = 600

/** Cinco casas ≈ 1 m: abaixo do pixel em qualquer escala que este mapa desenhe. */
const COORDINATE_SCALE = 5

export const ROUTE_GEOMETRY_SOURCES = ['road', 'unavailable'] as const
export type RouteGeometrySource = (typeof ROUTE_GEOMETRY_SOURCES)[number]

export type RouteGeometryView = {
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
  if (input.stops.length < 2) return { points: [], source: 'unavailable' }

  const road = await input.geometry.readRouteGeometry(input.stops)
  if (road === null) return { points: [], source: 'unavailable' }

  const simplified = simplifyRouteGeometry(road, { targetPixels: TARGET_PIXELS })

  return {
    points: simplified.map((point) => ({
      latitude: point.latitude.toFixed(COORDINATE_SCALE),
      longitude: point.longitude.toFixed(COORDINATE_SCALE),
    })),
    source: 'road',
  }
}
