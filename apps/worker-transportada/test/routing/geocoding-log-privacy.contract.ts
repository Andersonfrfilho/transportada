/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createBrasilApiPostalCodeGateway } from '../../src/routing/infrastructure/brasil-api-postal-code.gateway.js'
import { createRouteOptimizationPorts } from '../../src/routing/infrastructure/route-optimization-ports.factory.js'
import type { RouteOptimizationStop } from '../../src/routing/application/route-optimization.effect.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

/**
 * `security.md` §1 e a `GeocodingPort`: **nenhum endereço em log, em nenhum nível**. O identificador
 * que rastreia é a `addressKey` e a sugestão.
 *
 * Este contrato não confia em disciplina: ele varre **tudo** que o caminho emitiu — mensagem e
 * metadados — atrás dos valores que passaram pela geocodificação. A tentação de registrar o endereço
 * é maior justamente no `catch`, onde a causa parece útil, e é lá que a resposta do provedor traz o
 * endereço de volta.
 */
const POSTAL_CODE = '01310100'
const STREET = 'Avenida Paulista'
const CITY = 'São Paulo'
const DISTRICT = 'Bela Vista'
const NUMBER = '1000'

const FORBIDDEN = [POSTAL_CODE, STREET, CITY, DISTRICT, '01310-100'] as const

function recordingLogger(lines: string[]): WorkerLogger {
  const record = (message: string, metadata?: Record<string, unknown>) => {
    lines.push(`${message} ${JSON.stringify(metadata ?? {})}`)
  }

  return { error: record, info: record, warn: record }
}

function stop(): RouteOptimizationStop {
  return {
    addressKey: `3550308|${POSTAL_CODE}|${NUMBER}`,
    documentIds: [],
    excludedFromOptimization: true,
    label: 'Cliente',
    latitude: '0',
    longitude: '0',
    serviceTimeSeconds: 600,
    stopId: 'stop-1',
    weightEstimated: false,
    weightKilograms: 10,
    windowEndSeconds: null,
    windowStartSeconds: null,
  }
}

const CONTEXT = {
  date: '2026-09-01',
  duty: { endSeconds: 64_800, startSeconds: 21_600 },
  end: null,
  origin: { addressKey: 'origin', latitude: '-23.5', longitude: '-46.6' },
  seed: 1,
  solverTimeBudgetSeconds: 1,
  stops: [stop()],
  timezone: 'America/Sao_Paulo',
  vehicles: [],
}

function portsWith(input: {
  readonly fetchImplementation: typeof fetch
  readonly lines: string[]
}) {
  return createRouteOptimizationPorts({
    geocoding: {
      centroids: { byCityCode: () => Promise.resolve(null) },
      geocoding: createBrasilApiPostalCodeGateway({
        baseUrl: 'https://brasilapi.com.br/api/cep/v2',
        fetchImplementation: input.fetchImplementation,
      }),
      logger: recordingLogger(input.lines),
      repository: { findByKeys: () => Promise.resolve([]), save: () => Promise.resolve() },
    },
    matrix: { table: () => Promise.resolve({ distancesMeters: [], durationsSeconds: [] }) },
    repository: {
      claim: () => Promise.resolve(null),
      complete: () => Promise.resolve(),
      fail: () => Promise.resolve(),
      readContext: () => Promise.resolve(CONTEXT as never),
      release: () => Promise.resolve(),
    },
  })
}

const JOB = { companyId: 'company-1', correlationId: 'correlation-1', suggestionId: 'suggestion-1' }

async function linesFrom(fetchImplementation: typeof fetch): Promise<string[]> {
  const lines: string[] = []
  await portsWith({ fetchImplementation, lines })
    .optimize({ claim: { suggestionId: JOB.suggestionId }, job: JOB })
    .catch(() => undefined)

  return lines
}

describe('geocoding never logs an address (security.md §1, RNF1)', () => {
  test('says nothing about the address when the provider answers', async () => {
    const lines = await linesFrom(
      (async () =>
        new Response(
          JSON.stringify({
            cep: POSTAL_CODE,
            city: CITY,
            location: {
              coordinates: { latitude: '-23.5617698', longitude: '-46.6553299' },
              type: 'Point',
            },
            neighborhood: DISTRICT,
            street: STREET,
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        )) as unknown as typeof fetch,
    )

    expect(lines.length).toBeGreaterThan(0)
    for (const forbidden of FORBIDDEN) expect(lines.join('\n')).not.toContain(forbidden)
  })

  /** É no erro que a tentação aparece: a recusa do provedor devolve o endereço enviado. */
  test('says nothing about the address when the provider refuses', async () => {
    const lines = await linesFrom(
      (async () =>
        new Response(
          JSON.stringify({ message: `CEP ${POSTAL_CODE} não encontrado`, street: STREET }),
          {
            headers: { 'content-type': 'application/json' },
            status: 404,
          },
        )) as unknown as typeof fetch,
    )

    /** Sem isto o teste passaria por vacuidade num caminho que simplesmente não loga. */
    expect(lines.length).toBeGreaterThan(0)
    for (const forbidden of FORBIDDEN) expect(lines.join('\n')).not.toContain(forbidden)
  })

  test('says nothing about the address when the transport throws', async () => {
    const lines = await linesFrom((async () => {
      throw new Error(`connect failed while resolving ${STREET}, ${POSTAL_CODE}`)
    }) as unknown as typeof fetch)

    expect(lines.length).toBeGreaterThan(0)
    for (const forbidden of FORBIDDEN) expect(lines.join('\n')).not.toContain(forbidden)
  })
})
