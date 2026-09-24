/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import type { PurgeOccurrenceAttachmentBatch } from '../../src/trip-occurrence-attachment-purge/application/trip-occurrence-attachment-purge.port.js'
import { createTripOccurrenceAttachmentPurgeRoutine } from '../../src/trip-occurrence-attachment-purge/application/trip-occurrence-attachment-purge.routine.js'
import {
  TRIP_OCCURRENCE_ATTACHMENT_PURGE_BATCH_SIZE,
  TRIP_OCCURRENCE_ATTACHMENT_PURGE_JOB,
  TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_BATCHES,
  TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_CONSECUTIVE_STORAGE_FAILURES,
} from '../../src/trip-occurrence-attachment-purge/domain/trip-occurrence-attachment-purge.constant.js'

const NOW = new Date('2026-09-22T09:00:00.000Z')

type LoggedCall = readonly unknown[]

function buildLogger(calls: LoggedCall[] = []) {
  const record = (...args: unknown[]) => {
    calls.push(args)
  }
  return { debug: record, error: record, info: record, warn: record }
}

function buildContext(isStopRequested: () => boolean = () => false): JobRoutineContext {
  return {
    correlationId: 'occurrence-attachment-purge-contract',
    executionId: 'execution-1',
    isStopRequested,
    job: TRIP_OCCURRENCE_ATTACHMENT_PURGE_JOB,
    origin: 'schedule',
  }
}

function buildRoutine(purge: PurgeOccurrenceAttachmentBatch, calls: LoggedCall[] = []) {
  return createTripOccurrenceAttachmentPurgeRoutine({
    logger: buildLogger(calls) as never,
    now: () => NOW,
    purge,
  })
}

describe('ciclo de expurgo da foto de ocorrência (RF21–RF25)', () => {
  test('a rotina tem o nome que o catálogo e o CHECK do banco conhecem', () => {
    expect(TRIP_OCCURRENCE_ATTACHMENT_PURGE_JOB).toBe('trip.occurrence-attachment.purge')
  })

  test('pede lotes até não sobrar candidato — nunca até `deleted` zerar (ajuste 5)', async () => {
    const asked: Array<{ readonly before: Date; readonly limit: number }> = []
    const answers = [
      { deleted: 2, failed: 0, missing: 1, processed: TRIP_OCCURRENCE_ATTACHMENT_PURGE_BATCH_SIZE },
      // Lote com objeto órfão pulado por lock: `deleted` zera, mas ainda há candidatas — o laço
      // continua porque `processed` não é zero.
      { deleted: 0, failed: 0, missing: 5, processed: 5 },
      { deleted: 0, failed: 0, missing: 0, processed: 0 },
    ]
    const routine = buildRoutine(async (input) => {
      asked.push(input)
      return answers[asked.length - 1] ?? { deleted: 0, failed: 0, missing: 0, processed: 0 }
    })

    const result = await routine.run(buildContext())

    expect(result).toEqual({
      counters: { batches: 2, deleted: 2, failed: 0, missing: 6 },
      outcome: 'succeeded',
    })
    expect(asked).toHaveLength(3)
    expect(asked[0]?.limit).toBe(TRIP_OCCURRENCE_ATTACHMENT_PURGE_BATCH_SIZE)
    expect(asked[0]?.before.toISOString()).toBe(NOW.toISOString())
  })

  test('para no limite do lote quando o operador pede parada', async () => {
    let calls = 0
    const routine = buildRoutine(async () => {
      calls += 1
      return { deleted: 1, failed: 0, missing: 0, processed: 1 }
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
      return { deleted: 1, failed: 0, missing: 0, processed: 1 }
    }, logged)

    const result = await routine.run(buildContext())

    expect(calls).toBe(TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_BATCHES)
    expect(result.counters.batches).toBe(TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_BATCHES)
    expect(JSON.stringify(logged)).toContain('"exhausted":true')
  })

  /** Bucket fora do ar: falhas seguidas interrompem o ciclo em vez de queimar os 200 lotes. */
  test('para o ciclo depois do teto de falhas de storage seguidas', async () => {
    let calls = 0
    const logged: LoggedCall[] = []
    const routine = buildRoutine(async () => {
      calls += 1
      return { deleted: 0, failed: 1, missing: 0, processed: 1 }
    }, logged)

    const result = await routine.run(buildContext())

    expect(calls).toBe(TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_CONSECUTIVE_STORAGE_FAILURES)
    expect(result.counters.failed).toBe(
      TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_CONSECUTIVE_STORAGE_FAILURES,
    )
    expect(JSON.stringify(logged)).toContain('"stoppedByStorageFailures":true')
  })

  test('base sem candidata vencida termina em sucesso sem apagar nada', async () => {
    const result = await buildRoutine(async () => ({
      deleted: 0,
      failed: 0,
      missing: 0,
      processed: 0,
    })).run(buildContext())

    expect(result).toEqual({
      counters: { batches: 0, deleted: 0, failed: 0, missing: 0 },
      outcome: 'succeeded',
    })
  })

  /** O log leva só contadores e ids da execução — a chave do objeto carrega tenant e ocorrência. */
  test('o log do ciclo nunca leva chave de objeto, bucket ou id de empresa/ocorrência', async () => {
    const logged: LoggedCall[] = []
    await buildRoutine(
      async () => ({ deleted: 3, failed: 0, missing: 1, processed: 4 }),
      logged,
    ).run(buildContext())

    const metadata = findMetadata(logged)
    expect(Object.keys(metadata ?? {}).sort()).toEqual([
      'batches',
      'correlationId',
      'deleted',
      'executionId',
      'exhausted',
      'failed',
      'missing',
      'stoppedByStorageFailures',
    ])
    const serialized = JSON.stringify(logged)
    expect(serialized).not.toContain('bucket')
    expect(serialized).not.toContain('companyId')
    expect(serialized).not.toContain('occurrenceId')
    expect(serialized).not.toContain('objectKey')
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
  if ('exhausted' in record) return record
  for (const nested of Object.values(record)) {
    const found = unwrapMetadata(nested)
    if (found !== undefined) return found
  }
  return undefined
}
