/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0056 §2: o rastro ao vivo tem prazo próprio, e ele não depende de a viagem fechar.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { createTripLocationPurgeRoutine } from '../../src/trip-location-purge/application/trip-location-purge.routine.js'
import {
  TRIP_LOCATION_RETENTION_DAYS,
  TRIP_TRACKING_MAX_AGE_HOURS,
  resolveTrackingPurgeCutoff,
} from '../../src/trip-location-purge/domain/trip-location-purge.constant.js'

const NOW = new Date('2026-09-03T18:00:00.000Z')

function buildContext(): JobRoutineContext {
  return {
    correlationId: 'stale-pings-contract',
    executionId: 'execution-1',
    isStopRequested: () => false,
    job: 'trip.location.purge',
    origin: 'schedule',
  }
}

function buildRoutine(input: {
  readonly purgeStalePings: (params: {
    readonly before: Date
    readonly limit: number
  }) => Promise<number>
}) {
  return createTripLocationPurgeRoutine({
    logger: { error() {}, info() {}, warn() {} } as never,
    now: () => NOW,
    purgeStalePings: input.purgeStalePings,
    redact: async () => 0,
  })
}

describe('o expurgo do rastro ao vivo', () => {
  test('corta trinta e seis horas para trás, não noventa dias', () => {
    expect(resolveTrackingPurgeCutoff(NOW)).toEqual(
      new Date(NOW.getTime() - TRIP_TRACKING_MAX_AGE_HOURS * 3_600_000),
    )
  })

  /**
   * O ping é o trajeto, que a ADR-0050 §5 decidiu não guardar; a coordenada de entrega é o carimbo
   * de um fato que se audita depois. Prazos iguais confundiriam as duas coisas.
   */
  test('o prazo do rastro é muito mais curto que o da coordenada de entrega', () => {
    expect(TRIP_TRACKING_MAX_AGE_HOURS / 24).toBeLessThan(TRIP_LOCATION_RETENTION_DAYS)
  })

  test('apaga em lotes até a tabela não ter mais ping vencido', async () => {
    const asked: { readonly before: Date; readonly limit: number }[] = []
    const remaining = [500, 500, 120, 0]
    const routine = buildRoutine({
      purgeStalePings: async (input) => {
        asked.push(input)
        return remaining[asked.length - 1] ?? 0
      },
    })

    const result = await routine.run(buildContext())

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({ batches: 0, purgedPings: 1120, redacted: 0 })
    expect(asked).toHaveLength(4)
    expect(asked[0]?.before).toEqual(resolveTrackingPurgeCutoff(NOW))
  })

  test('base sem ping vencido termina em sucesso sem apagar nada', async () => {
    const result = await buildRoutine({ purgeStalePings: async () => 0 }).run(buildContext())

    expect(result.counters).toEqual({ batches: 0, purgedPings: 0, redacted: 0 })
  })

  /**
   * ⚠️ Cópia por valor: o worker não importa código da API. O número é o mesmo dos dois lados, e a
   * divergência seria silenciosa — a API pararia de aceitar ping numa idade e o expurgo apagaria
   * noutra, deixando uma faixa de rastro que ninguém escreve e ninguém limpa.
   */
  test('o teto é o mesmo da política da API', async () => {
    const policy = await readFile(
      new URL(
        '../../../api-transportada/src/trips/domain/tracking-window.policy.ts',
        import.meta.url,
      ).pathname,
      'utf8',
    )

    expect(policy).toContain(
      `export const TRIP_TRACKING_MAX_AGE_HOURS = ${TRIP_TRACKING_MAX_AGE_HOURS}`,
    )
  })
})
