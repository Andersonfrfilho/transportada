/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A linha da estrada da viagem, para o mapa.
 *
 * Rota **própria e preguiçosa**, fora do detalhe da viagem: a chamada ao OSRM custou 63 ms medidos
 * em staging, e o detalhe é leitura quente que abre a tela inteira. O mapa desenha as paradas
 * primeiro e engrossa a linha depois.
 */
import {
  resolveTollRouteCost,
  type AxleCount,
  type TollRouteCost,
} from '../../toll-booths/domain/toll-route-cost.policy.js'
import type { TollBoothRouteRecord } from '../../toll-booths/application/toll-booth.port.js'
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

/**
 * O pedágio da rota, mais a data da tarifa (spec 090 T7). A política pura (`resolveTollRouteCost`,
 * T5) não conhece data — ela decide só quem passou e quanto custa — e é este use case que junta a
 * data de cada praça cobrada para a tela imprimir ao lado do total.
 */
export type RouteGeometryToll = TollRouteCost &
  Readonly<{
    /**
     * A mais antiga entre as praças cobradas — a leitura conservadora quando o cadastro tem seeds
     * de datas diferentes. `null` quando a rota não passou por praça nenhuma: não há tarifa a datar.
     */
    tariffObservedOn: null | string
  }>

export type RouteGeometryView = {
  /**
   * Um trecho por par de paradas consecutivas, **medido na estrada**. Vazio quando a estrada não
   * veio — e aí a tela não mostra tempo nenhum. A ADR-0044 §5 é explícita: sem o roteirizador não se
   * estima, porque número plausível e errado é pior que número nenhum.
   */
  readonly legs: readonly RouteGeometryLeg[]
  readonly points: readonly { readonly latitude: string; readonly longitude: string }[]
  readonly source: RouteGeometrySource
  /**
   * `null` quando ninguém pediu pedágio (sem eixo ou sem porta de praças) **ou** quando a rota não
   * anotou os nós — as duas coisas são "não calculei", nunca "calculei e deu zero" (spec 090 D1).
   */
  readonly toll: null | RouteGeometryToll
}

/** As praças que a rota pode ter passado, pelos ids de nó que a mesma chamada devolveu. */
export type ReadRouteGeometryTollBoothsPort = {
  readByNodeIds: (nodeIds: readonly number[]) => Promise<readonly TollBoothRouteRecord[]>
}

export type ReadRouteGeometryInput = {
  /** Quantos eixos o veículo escolhido tem, e de onde o número veio (spec 090 D2). */
  readonly axles?: AxleCount | null
  readonly geometry: RouteGeometryPort
  readonly stops: readonly RouteGeometryPoint[]
  /**
   * O catálogo de praças. Ausente é "ninguém pediu pedágio nesta chamada" — o mapa da montagem sem
   * veículo escolhido, por exemplo — e não "a rota não passa por praça".
   */
  readonly tollBooths?: null | ReadRouteGeometryTollBoothsPort
}

/**
 * ⚠️ `unavailable` com lista vazia é o **único** jeito de dizer "não sei o caminho". Devolver as
 * próprias paradas como se fossem a estrada faria a tela desenhar retas anunciando rodovia — e uma
 * reta entre dois pontos atravessa rio, serra e ferrovia sem pedir licença.
 */
export async function readRouteGeometry(input: ReadRouteGeometryInput): Promise<RouteGeometryView> {
  if (input.stops.length < 2) return { legs: [], points: [], source: 'unavailable', toll: null }

  const road = await input.geometry.readRouteGeometry(input.stops)
  if (road === null) return { legs: [], points: [], source: 'unavailable', toll: null }

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
    toll: await resolveRouteToll({
      axles: input.axles ?? null,
      nodeIds: road.nodeIds,
      tollBooths: input.tollBooths ?? null,
    }),
  }
}

/**
 * Spec 090 D4: o pedágio sai dos **mesmos** nós que a chamada acima devolveu — nunca de uma segunda
 * rota, que poderia discordar da desenhada. `resolveTollRouteCost` (T5) continua sendo o único
 * lugar que soma; esta função só decide se há o que somar e junta a data da tarifa.
 */
async function resolveRouteToll(input: {
  readonly axles: AxleCount | null
  readonly nodeIds: null | readonly number[]
  readonly tollBooths: null | ReadRouteGeometryTollBoothsPort
}): Promise<null | RouteGeometryToll> {
  if (input.axles === null || input.tollBooths === null) return null

  const records = input.nodeIds === null ? [] : await input.tollBooths.readByNodeIds(input.nodeIds)
  const observedOnByNode = new Map(records.map((record) => [record.osmNodeId, record.observedOn]))

  const cost = resolveTollRouteCost({ axles: input.axles, booths: records, nodeIds: input.nodeIds })
  if (cost === null) return null

  const observedDates = cost.booths
    .map((booth) => observedOnByNode.get(booth.osmNodeId))
    .filter((value): value is string => value !== undefined)
    .sort()

  return { ...cost, tariffObservedOn: observedDates[0] ?? null }
}
