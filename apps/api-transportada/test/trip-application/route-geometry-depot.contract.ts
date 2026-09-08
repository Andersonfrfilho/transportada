/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 097: a rota da montagem tem **uma perna a mais** que a lista de paradas, e o pedágio inclui
 * as praças dessa perna.
 *
 * Medido em 2026-09-08 contra o OSRM local, com o barracão real desta base e três notas de uma
 * viagem de verdade: 48,3 km / 39 min sem o barracão, 105,3 km / 86 min com ele na origem, 208,3 km
 * / 165 min na ida e volta. Uma praça de pedágio (R$ 30,00) mora **na perna do barracão** — a tela
 * dizia "sem pedágio" e havia.
 */
import { describe, expect, it } from 'bun:test'

import { readRouteGeometry } from '../../src/trips/application/read-route-geometry.use-case.js'
import type {
  RouteGeometryLeg,
  RouteGeometryRoad,
} from '../../src/trips/application/route-geometry.port.js'
import type { RouteDepot } from '../../src/trips/domain/route-depot.policy.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'

const BARRACAO: RouteGeometryPoint = { latitude: -21.1767, longitude: -47.8208 }
const ORLANDIA: RouteGeometryPoint = { latitude: -20.7202, longitude: -47.8866 }
const IPUA: RouteGeometryPoint = { latitude: -20.4436, longitude: -48.0139 }

const PARADAS: readonly RouteGeometryPoint[] = [ORLANDIA, IPUA]

/** O nó da praça que só existe entre o barracão e a primeira entrega. */
const NO_DA_PRACA = 4_242

const PRACA = {
  chargeCar: '15.0000',
  chargePerAxle: '15.0000',
  chargePerAxleAutomatic: null,
  latitude: '-20.9000000',
  longitude: '-47.8500000',
  name: 'Praça da perna do barracão',
  observedOn: '2026-08-01',
  operator: 'Concessionária',
  osmNodeId: NO_DA_PRACA,
} as const

function estrada(input: {
  readonly legs: readonly RouteGeometryLeg[]
  readonly nodeIds?: readonly number[] | null
}): RouteGeometryRoad {
  return {
    legs: input.legs,
    nodeIds: input.nodeIds ?? null,
    nodeIdsByLeg: input.nodeIds === undefined || input.nodeIds === null ? null : [input.nodeIds],
    points: [BARRACAO, ORLANDIA, IPUA],
  }
}

function porta(road: RouteGeometryRoad) {
  const calls: (readonly RouteGeometryPoint[])[] = []
  return {
    calls,
    port: {
      readRouteGeometry: async (points: readonly RouteGeometryPoint[]) => {
        calls.push(points)
        return road
      },
    },
  }
}

/** Um trecho por par de pontos enviados — a contagem que o OSRM devolve de verdade. */
function portaDeVerdade() {
  return {
    readRouteGeometry: async (points: readonly RouteGeometryPoint[]) => ({
      legs: points.slice(1).map((_, index) => ({
        distanceMetres: 10_000 * (index + 1),
        durationSeconds: 600 * (index + 1),
      })),
      nodeIds: null,
      nodeIdsByLeg: null,
      points: [...points],
    }),
  }
}

function barracao(depot: RouteDepot) {
  return { readDescription: async () => null, readDepot: async () => depot }
}

const TRES_TRECHOS: readonly RouteGeometryLeg[] = [
  { distanceMetres: 57_000, durationSeconds: 2_820 },
  { distanceMetres: 1_240, durationSeconds: 186 },
  { distanceMetres: 47_060, durationSeconds: 2_154 },
]

describe('a perna do barracão na geometria da montagem (spec 097)', () => {
  it('manda o barracão ao roteirizador antes da primeira entrega', async () => {
    const { calls, port } = porta(estrada({ legs: TRES_TRECHOS }))

    const view = await readRouteGeometry({
      depot: barracao({ end: BARRACAO, origin: BARRACAO, status: 'resolved' }),
      geometry: port,
      stops: PARADAS,
    })

    expect(calls[0]).toEqual([BARRACAO, ORLANDIA, IPUA, BARRACAO])
    expect(view.source).toBe('road')
    expect(view.depot).toEqual({
      absence: null,
      description: null,
      leadingLegs: 1,
      /** ⚠️ A origem publicada é a **mesma** que entrou no traçado — é com ela que o mapa marca. */
      origin: { latitude: '-21.17670', longitude: '-47.82080' },
      trailingLegs: 1,
    })
  })

  /**
   * Uma perna a mais que a lista de paradas: duas entregas dão dois trechos, não um. O roteirizador
   * devolve **um trecho por par enviado**, e é essa contagem que a tela usa para casar trecho com
   * parada — por isso a porta desta suíte deriva os trechos dos pontos que recebeu, como o OSRM.
   */
  it('a rota tem uma perna a mais que a lista de paradas', async () => {
    const semBarracao = await readRouteGeometry({ geometry: portaDeVerdade(), stops: PARADAS })
    const comBarracao = await readRouteGeometry({
      depot: barracao({ end: null, origin: BARRACAO, status: 'resolved' }),
      geometry: portaDeVerdade(),
      stops: PARADAS,
    })

    expect(semBarracao.depot).toBeNull()
    expect(semBarracao.legs.length).toBe(PARADAS.length - 1)
    expect(comBarracao.depot?.leadingLegs).toBe(1)
    expect(comBarracao.legs.length).toBe(semBarracao.legs.length + 1)
  })

  /**
   * ⚠️ O defeito medido: a praça mora na perna do barracão, e sem ela a tela anunciava R$ 0,00 numa
   * viagem de R$ 30,00 de pedágio. O erro é sempre **para baixo** — a direção que faz aceitar carga
   * que não paga.
   */
  it('o pedágio inclui as praças da perna do barracão', async () => {
    const tollBooths = { readByNodeIds: async () => [PRACA] }

    const semBarracao = await readRouteGeometry({
      axles: { count: 3, source: 'declared' } as const,
      /** Truck: três eixos de rodagem dupla, Categoria 4 — multiplicador 3. */
      multiplier: { denominator: 1, numerator: 3 } as const,
      geometry: porta(estrada({ legs: TRES_TRECHOS.slice(0, 1), nodeIds: [] })).port,
      stops: PARADAS,
      tollBooths,
    })
    const comBarracao = await readRouteGeometry({
      axles: { count: 3, source: 'declared' } as const,
      /** Truck: três eixos de rodagem dupla, Categoria 4 — multiplicador 3. */
      multiplier: { denominator: 1, numerator: 3 } as const,
      depot: barracao({ end: null, origin: BARRACAO, status: 'resolved' }),
      geometry: porta(estrada({ legs: TRES_TRECHOS.slice(0, 2), nodeIds: [NO_DA_PRACA] })).port,
      stops: PARADAS,
      tollBooths,
    })

    expect(semBarracao.toll?.booths.length).toBe(0)
    expect(semBarracao.toll?.total).toBe('0.0000')
    expect(comBarracao.toll?.booths.length).toBe(1)
    expect(comBarracao.toll?.total).toBe('45.0000')
  })

  /**
   * D2: barracão sem cadastro ou sem geocodificação não vira ponto inventado. A rota é a de hoje —
   * e a ausência sobe **nomeada**, porque é ela que a tela imprime.
   */
  it('sem coordenada de barracão a rota é a de hoje, e a razão sobe nomeada', async () => {
    for (const reason of ['not_configured', 'not_geocoded'] as const) {
      const { calls, port } = porta(estrada({ legs: TRES_TRECHOS.slice(0, 1) }))

      const view = await readRouteGeometry({
        depot: barracao({ reason, status: 'absent' }),
        geometry: port,
        stops: PARADAS,
      })

      expect(calls[0]).toEqual(PARADAS)
      expect(view.source).toBe('road')
      expect(view.depot).toEqual({
        absence: reason,
        description: null,
        leadingLegs: 0,
        origin: null,
        trailingLegs: 0,
      })
    }
  })

  /**
   * ⚠️ A ausência precisa sobreviver à rota indisponível: é justamente quando não há traçado que o
   * operador precisa saber que o barracão também está faltando.
   */
  it('declara a ausência mesmo quando o roteirizador não respondeu', async () => {
    const view = await readRouteGeometry({
      depot: barracao({ reason: 'not_configured', status: 'absent' }),
      geometry: { readRouteGeometry: async () => null },
      stops: PARADAS,
    })

    expect(view.source).toBe('unavailable')
    expect(view.depot).toEqual({
      absence: 'not_configured',
      description: null,
      leadingLegs: 0,
      origin: null,
      trailingLegs: 0,
    })
  })

  /** Uma entrega só deixa de ser "menos de duas paradas" quando o barracão entra na conta. */
  it('uma entrega só ainda tem rota, porque o barracão é o outro ponto', async () => {
    const { calls, port } = porta(estrada({ legs: TRES_TRECHOS.slice(0, 1) }))

    const view = await readRouteGeometry({
      depot: barracao({ end: null, origin: BARRACAO, status: 'resolved' }),
      geometry: port,
      stops: [ORLANDIA],
    })

    expect(calls[0]).toEqual([BARRACAO, ORLANDIA])
    expect(view.source).toBe('road')
  })
})

/**
 * O contrato de texto de fonte da spec 097: nenhum lugar do caminho da montagem decide a política
 * de fim por constante. Quem interpreta o valor configurado é `resolveRouteEndAddressKey`, provada
 * contra as três políticas em `test/trip-domain/route-depot.contract.ts`.
 */
describe('a política de fim não é constante no caminho da montagem (spec 097 D1)', () => {
  const arquivos = [
    '../../src/trips/application/read-route-geometry.use-case.ts',
    '../../src/trips/application/read-trip-valuation.use-case.ts',
    '../../src/trips/infrastructure/route-depot.query.ts',
  ] as const

  for (const arquivo of arquivos) {
    it(`não fixa 'depot' em ${arquivo.split('/').pop()}`, async () => {
      const source = await Bun.file(new URL(arquivo, import.meta.url)).text()

      expect(source).not.toInclude("'depot'")
      expect(source).not.toInclude('"depot"')
    })
  }

  /** E a leitura da configuração de fato olha a coluna, em vez de assumir o padrão dela. */
  it('a consulta do barracão lê a política da própria configuração', async () => {
    const source = await Bun.file(
      new URL('../../src/trips/infrastructure/route-depot.query.ts', import.meta.url),
    ).text()

    expect(source).toInclude('endPolicy')
    expect(source).toInclude('resolveRouteEndAddressKey')
  })
})
