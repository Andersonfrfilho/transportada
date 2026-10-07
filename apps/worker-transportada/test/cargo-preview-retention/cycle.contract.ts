/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ApplyCargoPreviewRetentionBatch,
  ApplyCargoPreviewRetentionBatchInput,
  ApplyCargoPreviewRetentionBatchResult,
} from '../../src/cargo-preview-retention/application/cargo-preview-retention.port.js'
import { createCargoPreviewRetentionRoutine } from '../../src/cargo-preview-retention/application/cargo-preview-retention.routine.js'
import {
  CARGO_PREVIEW_RETENTION_BATCH_SIZE,
  CARGO_PREVIEW_RETENTION_JOB,
  CARGO_PREVIEW_RETENTION_MAX_BATCHES,
  CARGO_PREVIEW_RETENTION_MAX_CONSECUTIVE_STORAGE_FAILURES,
} from '../../src/cargo-preview-retention/domain/cargo-preview-retention.constant.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'

const NOW = new Date('2026-12-31T12:00:00.000Z')
const EMPTY: ApplyCargoPreviewRetentionBatchResult = {
  deferredPreviewIds: [],
  failed: 0,
  partial: 0,
  processed: 0,
  retained: 0,
  skipped: 0,
}

function buildContext(isStopRequested: () => boolean = () => false): JobRoutineContext {
  return {
    correlationId: 'cargo-preview-retention-contract',
    executionId: 'execution-1',
    isStopRequested,
    job: CARGO_PREVIEW_RETENTION_JOB,
    origin: 'schedule',
  }
}

function buildRoutine(apply: ApplyCargoPreviewRetentionBatch, logged: unknown[][] = []) {
  const record = (...args: unknown[]) => {
    logged.push(args)
  }
  return createCargoPreviewRetentionRoutine({
    apply,
    logger: { debug: record, error: record, info: record, warn: record } as never,
    now: () => NOW,
  })
}

describe('o ciclo da retenção dos dados da planilha (spec 237 T4.8)', () => {
  test('a rotina tem o nome que o catálogo e o CHECK do banco conhecem', () => {
    expect(CARGO_PREVIEW_RETENTION_JOB).toBe('cargo-preview.retention.apply')
  })

  test('pede lotes até não sobrar candidata — nunca até `retained` zerar', async () => {
    const asked: ApplyCargoPreviewRetentionBatchInput[] = []
    const answers: ApplyCargoPreviewRetentionBatchResult[] = [
      { ...EMPTY, processed: CARGO_PREVIEW_RETENTION_BATCH_SIZE, retained: 24, skipped: 1 },
      { ...EMPTY, processed: 3, skipped: 3 },
      EMPTY,
    ]
    const routine = buildRoutine(async (input) => {
      asked.push(input)
      return answers[asked.length - 1] ?? EMPTY
    })

    const result = await routine.run(buildContext())

    expect(result).toEqual({
      counters: { batches: 2, failed: 0, partial: 0, retained: 24, skipped: 4 },
      outcome: 'succeeded',
    })
    expect(asked).toHaveLength(3)
    expect(asked[0]?.limit).toBe(CARGO_PREVIEW_RETENTION_BATCH_SIZE)
    expect(asked[0]?.now.toISOString()).toBe(NOW.toISOString())
  })

  test('a prévia que falhou ou ficou parcial não volta no mesmo ciclo', async () => {
    const asked: ApplyCargoPreviewRetentionBatchInput[] = []
    const answers: ApplyCargoPreviewRetentionBatchResult[] = [
      { ...EMPTY, deferredPreviewIds: ['preview-a'], failed: 1, processed: 2, retained: 1 },
      { ...EMPTY, deferredPreviewIds: ['preview-b'], partial: 1, processed: 1 },
      EMPTY,
    ]
    const routine = buildRoutine(async (input) => {
      asked.push({ ...input, excludedPreviewIds: [...input.excludedPreviewIds] })
      return answers[asked.length - 1] ?? EMPTY
    })

    await routine.run(buildContext())

    expect(asked.map((input) => input.excludedPreviewIds)).toEqual([
      [],
      ['preview-a'],
      ['preview-a', 'preview-b'],
    ])
  })

  test('o teto de lotes por ciclo vale: o resto fica para a próxima batida', async () => {
    let calls = 0
    const logged: unknown[][] = []
    const routine = buildRoutine(async () => {
      calls += 1
      return { ...EMPTY, processed: CARGO_PREVIEW_RETENTION_BATCH_SIZE, retained: 25 }
    }, logged)

    const result = await routine.run(buildContext())

    expect(calls).toBe(CARGO_PREVIEW_RETENTION_MAX_BATCHES)
    expect(result.counters.batches).toBe(CARGO_PREVIEW_RETENTION_MAX_BATCHES)
    expect(JSON.stringify(logged)).toContain('"exhausted":true')
  })

  test('para quando o bucket falha seguido, sem esgotar os 200 lotes', async () => {
    let calls = 0
    const routine = buildRoutine(async () => {
      calls += 1
      return { ...EMPTY, deferredPreviewIds: [`preview-${calls}`], failed: 1, processed: 1 }
    })

    const result = await routine.run(buildContext())

    expect(calls).toBe(CARGO_PREVIEW_RETENTION_MAX_CONSECUTIVE_STORAGE_FAILURES)
    expect(result.counters.failed).toBe(CARGO_PREVIEW_RETENTION_MAX_CONSECUTIVE_STORAGE_FAILURES)
  })

  test('um lote que retém algo zera a sequência de falhas', async () => {
    let calls = 0
    const routine = buildRoutine(async () => {
      calls += 1
      if (calls > 12) return EMPTY
      const isFailure = calls % 3 !== 0
      return {
        ...EMPTY,
        deferredPreviewIds: isFailure ? [`preview-${calls}`] : [],
        failed: isFailure ? 1 : 0,
        processed: 1,
        retained: isFailure ? 0 : 1,
      }
    })

    await routine.run(buildContext())

    expect(calls).toBe(13)
  })

  test('para no limite do lote quando o operador pede parada', async () => {
    let calls = 0
    const routine = buildRoutine(async () => {
      calls += 1
      return { ...EMPTY, processed: 1, retained: 1 }
    })
    let isStopRequested = false

    const result = await routine.run(
      buildContext(() => {
        isStopRequested = calls >= 2
        return isStopRequested
      }),
    )

    expect(calls).toBe(2)
    expect(result.counters.batches).toBe(2)
  })

  test('o log só tem contagens e ids da execução — nunca id de prévia, chave ou nome', async () => {
    const logged: unknown[][] = []
    const answers: ApplyCargoPreviewRetentionBatchResult[] = [
      { ...EMPTY, deferredPreviewIds: ['preview-secret-id'], failed: 1, processed: 2, retained: 1 },
      EMPTY,
    ]
    let calls = 0
    const routine = buildRoutine(async () => answers[calls++] ?? EMPTY, logged)

    await routine.run(buildContext())

    expect(logged).toHaveLength(1)
    const serialized = JSON.stringify(logged)
    expect(serialized).not.toContain('preview-secret-id')
    expect(logged[0]?.[0]).toBe('cargo_preview_retention_cycle_finished')
    expect(logged[0]?.[1]).toEqual({
      batches: 1,
      correlationId: 'cargo-preview-retention-contract',
      exhausted: false,
      executionId: 'execution-1',
      failed: 1,
      partial: 0,
      retained: 1,
      skipped: 0,
      stoppedByStorageFailures: false,
    })
  })
})
