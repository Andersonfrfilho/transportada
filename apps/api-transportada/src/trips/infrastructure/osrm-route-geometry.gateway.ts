/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O `/route` do OSRM — o mesmo serviço que o worker já consulta pelo `/table` da ADR-0044, e a
 * mesma instância: nada novo sobe, nada novo se contrata.
 *
 * ⚠️ **Falha é ausência, nunca reta.** Serviço fora do ar, tempo esgotado ou rota impossível
 * devolvem `null`, e a tela volta a ligar as paradas em linha reta **dizendo que são retas**. Uma
 * reta desenhada como se fosse estrada atravessa rio e ferrovia sem avisar.
 */
import type {
  RouteGeometryLeg,
  RouteGeometryPort,
  RouteGeometryRoad,
} from '../application/route-geometry.port.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'

const OK_CODE = 'Ok'
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000

type OsrmRoute = {
  readonly geometry?: { readonly coordinates?: unknown }
  readonly legs?: unknown
}

type OsrmRouteResponse = {
  readonly code?: string
  readonly routes?: readonly OsrmRoute[]
}

export function createOsrmRouteGeometryGateway(input: {
  readonly baseUrl: string
  readonly fetchImplementation?: typeof fetch
  readonly timeoutMilliseconds?: number
}): RouteGeometryPort {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const timeout = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS

  return {
    async readRouteGeometry(points) {
      if (points.length < 2) return null

      const path = points.map((point) => `${point.longitude},${point.latitude}`).join(';')
      const url = `${input.baseUrl.replace(/\/$/u, '')}/route/v1/driving/${path}?overview=full&geometries=geojson&annotations=nodes&alternatives=true`

      try {
        const response = await fetchImplementation(url, {
          signal: AbortSignal.timeout(timeout),
        })
        if (!response.ok) return null

        const payload = (await response.json()) as OsrmRouteResponse
        if (payload.code !== OK_CODE) return null

        const expectedLegs = points.length - 1
        const routes = payload.routes ?? []
        const primary = toRoad(routes[0], expectedLegs)
        if (primary === null) return null

        /**
         * ⚠️ **Alternativa malformada não derruba a rota principal** — ela só fica de fora. A
         * exigência estrita continua valendo para a primária, que é o traço que a tela desenha por
         * padrão (spec 096 D2/spec.md).
         */
        const alternatives = routes
          .slice(1)
          .map((route) => toRoad(route, expectedLegs))
          .filter((road): road is RouteGeometryRoad => road !== null)

        return alternatives.length === 0 ? primary : { ...primary, alternatives }
      } catch {
        // O mapa é enfeite operacional: ele degrada para reta, e nenhuma tela cai por causa disso.
        return null
      }
    },
  }
}

/**
 * Um `routes[]` do OSRM (principal ou alternativa) reduzido ao que a resposta precisa. `null` é
 * "esta rota não presta" — a alternativa malformada é descartada por quem chama, sem derrubar a
 * chamada inteira.
 */
function toRoad(route: OsrmRoute | undefined, expectedLegs: number): RouteGeometryRoad | null {
  const roadPoints = toPoints(route?.geometry?.coordinates)
  if (roadPoints === null) return null

  /**
   * ⚠️ Um trecho por **par** de pontos enviados. Contagem diferente é resposta que não casa
   * com o pedido, e casar leg com parada errada põe o tempo do trecho seguinte ao pé da
   * parada anterior — número plausível e errado, que é pior que número nenhum.
   */
  const legs = toLegs(route?.legs)
  if (legs === null || legs.length !== expectedLegs) return null

  const nodeIdsByLeg = toNodeIdsByLeg(route?.legs)

  return {
    legs,
    nodeIds: nodeIdsByLeg === null ? null : nodeIdsByLeg.flat(),
    nodeIdsByLeg,
    points: roadPoints,
  }
}

/**
 * Os nós percorridos, **um grupo por trecho** e na ordem em que o caminhão os cruza (spec 090 D1).
 *
 * ⚠️ Achatá-los numa lista só, como esta função fazia, jogava fora a única informação capaz de dizer
 * em que perna da viagem cada praça cai — e num roteiro que volta ao barracão o par de cancelas
 * gêmeas (a mesma praça nos dois sentidos) aparecia inteiro antes da primeira entrega. A lista
 * achatada continua sendo publicada, derivada desta.
 *
 * ⚠️ **O OSRM repete o nó da parada** no fim de um trecho e no começo do seguinte. Concatenar cru
 * faria a praça que cai exatamente ali ser cobrada **duas vezes** — número plausível, maior que o
 * real, na tela de quem decide aceitar a carga.
 *
 * ⚠️ **Um trecho sem anotação torna a rota inteira desconhecida.** Devolver os nós que vieram diria
 * "o resto não tem praça", e a conta sairia menor que a verdade sem avisar ninguém. Meia lista é
 * pior que lista nenhuma, porque parece completa.
 */
function toNodeIdsByLeg(value: unknown): readonly (readonly number[])[] | null {
  if (!Array.isArray(value)) return null

  const byLeg: (readonly number[])[] = []
  /**
   * ⚠️ A deduplicação atravessa o limite do trecho, e é por isso que ela mora fora do laço: o nó da
   * parada fecha um trecho e abre o seguinte, e sem isto a praça que cai exatamente ali seria cobrada
   * duas vezes. O nó repartido fica com o trecho **anterior** — é por ele que o caminhão chegou.
   */
  let previous: number | undefined

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { annotation } = entry as Record<string, unknown>
    if (typeof annotation !== 'object' || annotation === null) return null
    const { nodes } = annotation as Record<string, unknown>
    if (!Array.isArray(nodes)) return null

    const nodeIds: number[] = []
    for (const node of nodes) {
      if (typeof node !== 'number' || !Number.isSafeInteger(node) || node <= 0) return null
      if (previous === node) continue
      previous = node
      nodeIds.push(node)
    }
    byLeg.push(nodeIds)
  }

  return byLeg
}

/** O GeoJSON vem `[longitude, latitude]` — trocar a ordem põe a viagem no oceano. */
function toPoints(coordinates: unknown): readonly RouteGeometryPoint[] | null {
  if (!Array.isArray(coordinates)) return null

  const points: RouteGeometryPoint[] = []
  for (const entry of coordinates) {
    if (!Array.isArray(entry)) return null
    const [longitude, latitude] = entry
    if (typeof longitude !== 'number' || typeof latitude !== 'number') return null
    points.push({ latitude, longitude })
  }

  return points.length < 2 ? null : points
}

/**
 * `distance` em metros e `duration` em segundos, que é o que o OSRM publica. A conversão para
 * quilômetro e minuto é da tela — aqui se guarda a unidade da fonte, para arredondar uma vez só.
 *
 * ⚠️ Valor não finito é recusa, não zero: `NaN` somado ao total daria um roteiro inteiro sem tempo,
 * e zero anunciaria trecho instantâneo.
 */
function toLegs(value: unknown): readonly RouteGeometryLeg[] | null {
  if (!Array.isArray(value)) return null

  const legs: RouteGeometryLeg[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { distance, duration } = entry as Record<string, unknown>
    if (typeof distance !== 'number' || !Number.isFinite(distance)) return null
    if (typeof duration !== 'number' || !Number.isFinite(duration)) return null
    legs.push({ distanceMetres: distance, durationSeconds: duration })
  }

  return legs
}
