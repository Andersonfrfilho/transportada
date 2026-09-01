/* Copyright (c) 2026 Ada Technology. MIT License. */

export type Point = Readonly<{ latitude: number; longitude: number }>

export type ProjectedPoint = Readonly<{ x: number; y: number }>

export const MAP_VIEWBOX_SIZE = 100

/**
 * Meio grau de lado — cerca de 55 km — é a janela que faz uma carga em rota intermunicipal caber com
 * folga e ainda dar noção de deslocamento. Fixa de propósito: sem uma segunda referência (a parada,
 * que o portal não conhece), qualquer zoom automático seria zoom sobre um ponto só.
 */
const WINDOW_DEGREES = 0.5

/**
 * Projeção equirretangular, com a longitude corrigida pelo cosseno da latitude. É a projeção certa
 * para uma janela deste tamanho: em meio grau a diferença para Mercator é menor que a espessura do
 * traço, e ela não precisa de biblioteca — que é o ponto (ADR-0033: dependência só quando o código
 * nosso não dá conta).
 *
 * O eixo y é invertido porque no SVG ele cresce para baixo e a latitude cresce para o norte.
 */
export function projectPoint(input: {
  readonly center: Point
  readonly point: Point
}): ProjectedPoint {
  const latitudeRadians = (input.center.latitude * Math.PI) / 180
  const longitudeScale = Math.max(Math.cos(latitudeRadians), 0.01)

  const half = MAP_VIEWBOX_SIZE / 2
  const unitsPerDegree = MAP_VIEWBOX_SIZE / WINDOW_DEGREES

  const x =
    half + (input.point.longitude - input.center.longitude) * longitudeScale * unitsPerDegree
  const y = half - (input.point.latitude - input.center.latitude) * unitsPerDegree

  return { x: clamp(x), y: clamp(y) }
}

/**
 * A coordenada chega como **texto** da API — é assim que ela atravessa a fronteira sem passar por
 * ponto flutuante binário no caminho. Aqui ela vira número porque desenho é aritmética; o que não se
 * faz é o contrário, mandar número de volta.
 */
export function toPoint(input: {
  readonly latitude: string
  readonly longitude: string
}): Point | null {
  const latitude = Number(input.latitude)
  const longitude = Number(input.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null

  return { latitude, longitude }
}

/** Grau com quatro casas é ~11 metros: precisão suficiente para "onde está", e nada além disso. */
export function formatCoordinate(value: number): string {
  return value.toFixed(4)
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), MAP_VIEWBOX_SIZE)
}
