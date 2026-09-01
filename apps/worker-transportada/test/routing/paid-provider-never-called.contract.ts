/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import { createRouteOptimizationPorts } from '../../src/routing/infrastructure/route-optimization-ports.factory.js'
import type { RouteOptimizationStop } from '../../src/routing/application/route-optimization.effect.js'

/**
 * ⚠️ **CA6 — este contrato guarda uma decisão de custo, não um comportamento.**
 *
 * A escada da spec 069 diz que o provedor **pago** só é chamado quando um humano marca a parada como
 * errada. A escalada automática por colisão — duas paradas caindo na mesma coordenada — foi avaliada
 * e **recusada** (adendo 2026-09-01 da ADR-0044): ela mede a coisa certa e gasta sem ninguém decidir.
 *
 * Ela é tentadora. Sem um teste que a proíba, alguém a acrescenta em seis meses com a melhor das
 * intenções, e a fatura aparece sem que decisão nenhuma tenha sido tomada.
 */
function collidingStops(): readonly RouteOptimizationStop[] {
  const base = {
    documentIds: [],
    excludedFromOptimization: true,
    label: 'Cliente',
    latitude: '0',
    longitude: '0',
    serviceTimeSeconds: 600,
    weightEstimated: false,
    weightKilograms: 10,
    windowEndSeconds: null,
    windowStartSeconds: null,
  }

  /** Mesmo CEP, números diferentes: é exatamente onde a precisão de CEP atrapalha a ordem. */
  return [
    { ...base, addressKey: '3543402|14015000|100', stopId: 'a' },
    { ...base, addressKey: '3543402|14015000|2000', stopId: 'b' },
    { ...base, addressKey: '3543402|14015000|3500', stopId: 'c' },
  ]
}

const CONTEXT = {
  date: '2026-09-01',
  duty: { endSeconds: 64_800, startSeconds: 21_600 },
  end: null,
  origin: { addressKey: 'origin', latitude: '-21.17', longitude: '-47.82' },
  seed: 1,
  solverTimeBudgetSeconds: 1,
  stops: collidingStops(),
  timezone: 'America/Sao_Paulo',
  vehicles: [],
}

const JOB = { companyId: 'company-1', correlationId: 'correlation-1', suggestionId: 'suggestion-1' }

describe('a sugestão nunca chama o provedor pago (spec 069, CA6)', () => {
  test('resolves a whole suggestion of colliding stops with zero paid calls', async () => {
    const providersAsked: string[] = []

    const ports = createRouteOptimizationPorts({
      geocoding: {
        centroids: {
          byCityCode: () => {
            providersAsked.push('centroid')

            return Promise.resolve({
              externalPlaceId: '',
              latitude: '-21.2138406',
              longitude: '-47.8218619',
              precision: 'city' as const,
              source: 'city' as const,
            })
          },
        },
        geocoding: {
          geocode: () => {
            providersAsked.push('postal_code')

            return Promise.resolve({
              externalPlaceId: '',
              latitude: '-21.18',
              longitude: '-47.81',
              precision: 'postal_code' as const,
              source: 'postal_code' as const,
            })
          },
        },
        repository: { findByKeys: () => Promise.resolve([]), save: () => Promise.resolve() },
      },
      matrix: { table: () => Promise.resolve({ distancesMeters: [], durationsSeconds: [] }) },
      repository: {
        claim: () => Promise.resolve({ suggestionId: JOB.suggestionId }),
        complete: () => Promise.resolve(),
        fail: () => Promise.resolve(),
        readContext: () => Promise.resolve(CONTEXT as never),
        release: () => Promise.resolve(),
      },
    })

    await ports
      .optimize({ claim: { suggestionId: JOB.suggestionId }, job: JOB })
      .catch(() => undefined)

    /** Três paradas colidindo no mesmo CEP, e nenhuma delas escalou: só o degrau 1 foi consultado. */
    expect(providersAsked.length).toBeGreaterThan(0)
    expect(new Set(providersAsked)).toEqual(new Set(['postal_code']))
  })

  /**
   * A trava por texto de fonte, e ela é a que sobrevive a refatoração: o worker **não conhece** o
   * provedor pago. Se um `import` dele aparecer aqui, é porque alguém trouxe o degrau 2 para dentro
   * do caminho automático — que é justamente o que a decisão recusou.
   */
  test('the worker never imports the paid provider', async () => {
    const factory = await readFile(
      new URL(
        '../../src/routing/infrastructure/route-optimization-ports.factory.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const cascade = await readFile(
      new URL('../../src/routing/application/geocode-address.use-case.ts', import.meta.url),
      'utf8',
    )

    /**
     * A varredura é sobre **import**, não sobre a palavra: a cascata cita `google` num comentário
     * que explica por que a métrica antiga estava errada, e proibir a palavra proibiria a
     * explicação. O que não pode existir é a dependência.
     */
    for (const source of [factory, cascade]) {
      const imports = source
        .split('\n')
        .filter((line) => line.trimStart().startsWith('import'))
        .join('\n')

      expect(imports.toLowerCase()).not.toContain('google')
      expect(imports.toLowerCase()).not.toContain('geocoding-api')
    }
  })
})
