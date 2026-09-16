/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T103: a chamada `exclude=toll` entra **em paralelo** com a de sempre, e o resultado das
 * duas se junta numa lista só de candidatas — deduplicada por assinatura (T102), com a marca de
 * quem é sem pedágio. `selectRouteOption`/`options[].signature` continuam de fora (T104): esta
 * função só entrega a lista de estradas, ainda sem virar `RouteGeometryOption`.
 */
import { describe, expect, it } from 'bun:test'

import { readRouteGeometryTollFreeCandidates } from '../../src/trips/application/route-geometry-toll-free-candidates.service.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'
import type {
  RouteGeometryPort,
  RouteGeometryRoad,
} from '../../src/trips/application/route-geometry.port.js'

const PARADAS: readonly RouteGeometryPoint[] = [
  { latitude: -21.1767, longitude: -47.8103 },
  { latitude: -22.9056, longitude: -47.0608 },
]

const ESTRADA_COM_PEDAGIO: RouteGeometryRoad = {
  legs: [{ distanceMetres: 221_500, durationSeconds: 179 * 60 }],
  nodeIds: [10, 20, 30],
  nodeIdsByLeg: [[10, 20, 30]],
  points: PARADAS,
}

const ESTRADA_SEM_PEDAGIO: RouteGeometryRoad = {
  legs: [{ distanceMetres: 239_600, durationSeconds: 198 * 60 }],
  nodeIds: [10, 40, 30],
  nodeIdsByLeg: [[10, 40, 30]],
  points: PARADAS,
}

const ESTRADA_SEM_ANOTACAO: RouteGeometryRoad = {
  legs: [{ distanceMetres: 250_000, durationSeconds: 200 * 60 }],
  nodeIds: null,
  nodeIdsByLeg: null,
  points: PARADAS,
}

/** Porta falsa: cada chamada responde conforme `excludeToll`, e pode falhar isolada por canal. */
function fakePort(input: {
  readonly normal?: () => Promise<RouteGeometryRoad | null>
  readonly tollFree?: () => Promise<RouteGeometryRoad | null>
}): RouteGeometryPort {
  return {
    readRouteGeometry: async (_points, options) => {
      if (options?.excludeToll === true) {
        return input.tollFree === undefined ? null : input.tollFree()
      }
      return input.normal === undefined ? null : input.normal()
    },
  }
}

describe('candidatas de rota com exclude=toll (spec 153 T103)', () => {
  it('chama as duas rotas em paralelo e devolve as duas quando diferem', async () => {
    let normalStartedAt = 0
    let tollFreeStartedAt = 0
    const geometry = fakePort({
      normal: async () => {
        normalStartedAt = performance.now()
        return ESTRADA_COM_PEDAGIO
      },
      tollFree: async () => {
        tollFreeStartedAt = performance.now()
        return ESTRADA_SEM_PEDAGIO
      },
    })

    const candidates = await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(candidates).toHaveLength(2)
    expect(candidates[0]?.road).toBe(ESTRADA_COM_PEDAGIO)
    expect(candidates[0]?.isNoToll).toBe(false)
    expect(candidates[1]?.road).toBe(ESTRADA_SEM_PEDAGIO)
    expect(candidates[1]?.isNoToll).toBe(true)
    /** As duas chamadas começaram antes de qualquer uma terminar — não é uma esperando a outra. */
    expect(normalStartedAt).toBeGreaterThan(0)
    expect(tollFreeStartedAt).toBeGreaterThan(0)
  })

  it('não duplica quando a rota sem pedágio é a mesma estrada da principal, e marca isNoToll', async () => {
    const geometry = fakePort({
      normal: async () => ESTRADA_COM_PEDAGIO,
      tollFree: async () => ESTRADA_COM_PEDAGIO,
    })

    const candidates = await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.isNoToll).toBe(true)
  })

  it('a falha isolada da chamada sem pedágio não derruba a rota principal', async () => {
    const geometry = fakePort({
      normal: async () => ESTRADA_COM_PEDAGIO,
      tollFree: async () => {
        throw new Error('OSRM não suporta exclude=toll neste perfil')
      },
    })

    const candidates = await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.road).toBe(ESTRADA_COM_PEDAGIO)
    expect(candidates[0]?.isNoToll).toBe(false)
  })

  it('a chamada sem pedágio devolvendo null também não derruba a principal', async () => {
    const geometry = fakePort({
      normal: async () => ESTRADA_COM_PEDAGIO,
      tollFree: async () => null,
    })

    const candidates = await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.road).toBe(ESTRADA_COM_PEDAGIO)
  })

  /**
   * ⚠️ Decisão: a rota principal é a âncora de toda opção (spec 096 D2) — sem ela não há o que
   * oferecer ao lado, então a chamada sem pedágio ter dado certo não basta para publicar rota
   * nenhuma.
   */
  it('a principal falhando não deixa a sem pedágio sozinha na lista', async () => {
    const geometry = fakePort({
      normal: async () => {
        throw new Error('OSRM fora do ar')
      },
      tollFree: async () => ESTRADA_SEM_PEDAGIO,
    })

    const candidates = await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(candidates).toHaveLength(0)
  })

  it('a principal devolvendo null também esvazia a lista', async () => {
    const geometry = fakePort({
      normal: async () => null,
      tollFree: async () => ESTRADA_SEM_PEDAGIO,
    })

    const candidates = await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(candidates).toHaveLength(0)
  })

  /**
   * ⚠️ Decisão: assinatura nula não se compara com nada — nem consigo mesma. Tratar como igual
   * daria a mesma identidade a toda rota sem anotação de nó, que é a colisão que a T102 já recusa.
   */
  it('rota sem pedágio sem anotação de nó nunca é tratada como duplicata', async () => {
    const geometry = fakePort({
      normal: async () => ESTRADA_COM_PEDAGIO,
      tollFree: async () => ESTRADA_SEM_ANOTACAO,
    })

    const candidates = await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(candidates).toHaveLength(2)
    expect(candidates[1]?.signature).toBeNull()
    expect(candidates[1]?.isNoToll).toBe(true)
  })

  it('as alternativas da rota principal continuam na lista, sem marca de sem pedágio', async () => {
    const comAlternativa: RouteGeometryRoad = {
      ...ESTRADA_COM_PEDAGIO,
      alternatives: [{ ...ESTRADA_SEM_ANOTACAO }],
    }
    const geometry = fakePort({
      normal: async () => comAlternativa,
      tollFree: async () => null,
    })

    const candidates = await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(candidates).toHaveLength(2)
    expect(candidates[1]?.isNoToll).toBe(false)
  })

  it('a sem pedágio que casa com uma alternativa (não a principal) marca a alternativa certa', async () => {
    const comAlternativa: RouteGeometryRoad = {
      ...ESTRADA_COM_PEDAGIO,
      alternatives: [{ ...ESTRADA_SEM_PEDAGIO }],
    }
    const geometry = fakePort({
      normal: async () => comAlternativa,
      tollFree: async () => ESTRADA_SEM_PEDAGIO,
    })

    const candidates = await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(candidates).toHaveLength(2)
    expect(candidates[0]?.isNoToll).toBe(false)
    expect(candidates[1]?.isNoToll).toBe(true)
  })

  it('pede a rota sem pedágio pela flag do gateway, não por um segundo caminho', async () => {
    const chamadas: (boolean | undefined)[] = []
    const geometry: RouteGeometryPort = {
      readRouteGeometry: async (_points, options) => {
        chamadas.push(options?.excludeToll)
        return options?.excludeToll === true ? ESTRADA_SEM_PEDAGIO : ESTRADA_COM_PEDAGIO
      },
    }

    await readRouteGeometryTollFreeCandidates({ geometry, points: PARADAS })

    expect(chamadas).toContain(true)
    expect(chamadas).toContain(undefined)
  })
})
