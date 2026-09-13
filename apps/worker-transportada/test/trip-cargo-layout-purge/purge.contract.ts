/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createTripCargoLayoutPurgeRoutine } from '../../src/trip-cargo-layout-purge/application/trip-cargo-layout-purge.routine.js'
import type { PurgeStaleCargoLayoutPreviews } from '../../src/trip-cargo-layout-purge/application/trip-cargo-layout-purge.port.js'
import {
  resolveCargoLayoutPreviewCutoff,
  TRIP_CARGO_LAYOUT_PREVIEW_RETENTION_HOURS,
  TRIP_CARGO_LAYOUT_PURGE_BATCH_SIZE,
  TRIP_CARGO_LAYOUT_PURGE_JOB,
  TRIP_CARGO_LAYOUT_PURGE_MAX_BATCHES,
} from '../../src/trip-cargo-layout-purge/domain/trip-cargo-layout-purge.constant.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'

const NOW = new Date('2026-09-13T09:00:00.000Z')

type LoggedCall = readonly unknown[]

function buildLogger(calls: LoggedCall[] = []) {
  const record = (...args: unknown[]) => {
    calls.push(args)
  }
  return { debug: record, error: record, info: record, warn: record }
}

function buildContext(isStopRequested: () => boolean = () => false): JobRoutineContext {
  return {
    correlationId: 'cargo-layout-purge-contract',
    executionId: 'execution-1',
    isStopRequested,
    job: TRIP_CARGO_LAYOUT_PURGE_JOB,
    origin: 'schedule',
  }
}

function buildRoutine(purge: PurgeStaleCargoLayoutPreviews, calls: LoggedCall[] = []) {
  return createTripCargoLayoutPurgeRoutine({
    logger: buildLogger(calls) as never,
    now: () => NOW,
    purge,
  })
}

describe('expurgo da prévia da planta (D19)', () => {
  test('a rotina tem o nome que o catálogo e o CHECK do banco conhecem', () => {
    expect(TRIP_CARGO_LAYOUT_PURGE_JOB).toBe('trip.cargo-layout.purge')
  })

  /** O `input` da prévia carrega nome de cliente e endereço: um dia, e não mais (LGPD art. 6º). */
  test('corta em 24 horas, contadas do instante do ciclo', () => {
    expect(TRIP_CARGO_LAYOUT_PREVIEW_RETENTION_HOURS).toBe(24)
    expect(resolveCargoLayoutPreviewCutoff(NOW).toISOString()).toBe('2026-09-12T09:00:00.000Z')
  })

  test('apaga em lotes de 500 até não sobrar prévia vencida, somando a outbox junto', async () => {
    const asked: Array<{ readonly before: Date; readonly limit: number }> = []
    const answers = [
      { deleted: TRIP_CARGO_LAYOUT_PURGE_BATCH_SIZE, deletedOutbox: 3 },
      { deleted: 7, deletedOutbox: 1 },
      { deleted: 0, deletedOutbox: 0 },
    ]
    const routine = buildRoutine(async (input) => {
      asked.push(input)
      return answers[asked.length - 1] ?? { deleted: 0, deletedOutbox: 0 }
    })

    const result = await routine.run(buildContext())

    expect(TRIP_CARGO_LAYOUT_PURGE_BATCH_SIZE).toBe(500)
    expect(result).toEqual({
      counters: { batches: 2, deleted: 507, deletedOutbox: 4 },
      outcome: 'succeeded',
    })
    expect(asked).toHaveLength(3)
    expect(asked[0]?.limit).toBe(TRIP_CARGO_LAYOUT_PURGE_BATCH_SIZE)
    expect(asked[0]?.before.toISOString()).toBe('2026-09-12T09:00:00.000Z')
  })

  /** A parada é lida no limite do lote: o lote em curso fecha a transação dele, o resto espera. */
  test('para no limite do lote quando o operador pede parada', async () => {
    let calls = 0
    const routine = buildRoutine(async () => {
      calls += 1
      return { deleted: TRIP_CARGO_LAYOUT_PURGE_BATCH_SIZE, deletedOutbox: 0 }
    })

    const result = await routine.run(buildContext(() => calls >= 2))

    expect(calls).toBe(2)
    expect(result.counters.batches).toBe(2)
    expect(result.outcome).toBe('succeeded')
  })

  test('não varre sem fim: no teto de lotes o resto espera a próxima batida', async () => {
    let calls = 0
    const logged: LoggedCall[] = []
    const routine = buildRoutine(async () => {
      calls += 1
      return { deleted: TRIP_CARGO_LAYOUT_PURGE_BATCH_SIZE, deletedOutbox: 0 }
    }, logged)

    const result = await routine.run(buildContext())

    expect(TRIP_CARGO_LAYOUT_PURGE_MAX_BATCHES).toBe(200)
    expect(calls).toBe(TRIP_CARGO_LAYOUT_PURGE_MAX_BATCHES)
    expect(result.counters.batches).toBe(TRIP_CARGO_LAYOUT_PURGE_MAX_BATCHES)
    expect(JSON.stringify(logged)).toContain('"exhausted":true')
  })

  test('base sem prévia vencida termina em sucesso sem apagar nada', async () => {
    const result = await buildRoutine(async () => ({ deleted: 0, deletedOutbox: 0 })).run(
      buildContext(),
    )

    expect(result).toEqual({
      counters: { batches: 0, deleted: 0, deletedOutbox: 0 },
      outcome: 'succeeded',
    })
  })

  /** Um expurgo de PII que escreve a PII no log não expurgou nada: só contagens e ids de execução. */
  test('o log do ciclo leva só contagens e os ids da execução', async () => {
    const logged: LoggedCall[] = []
    await buildRoutine(async () => ({ deleted: 0, deletedOutbox: 0 }), logged).run(buildContext())

    const metadata = findMetadata(logged)
    expect(Object.keys(metadata ?? {}).sort()).toEqual([
      'batches',
      'correlationId',
      'deleted',
      'deletedOutbox',
      'executionId',
      'exhausted',
    ])
    expect(metadata).toMatchObject({
      batches: 0,
      correlationId: 'cargo-layout-purge-contract',
      deleted: 0,
      deletedOutbox: 0,
      executionId: 'execution-1',
      exhausted: false,
    })
  })
})

function findMetadata(calls: readonly LoggedCall[]): Record<string, unknown> | undefined {
  for (const args of calls) {
    for (const argument of args) {
      const candidate = unwrapMetadata(argument)
      if (candidate !== undefined) return candidate
    }
  }
  return undefined
}

function unwrapMetadata(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if ('deletedOutbox' in record) return record
  for (const nested of Object.values(record)) {
    const found = unwrapMetadata(nested)
    if (found !== undefined) return found
  }
  return undefined
}
