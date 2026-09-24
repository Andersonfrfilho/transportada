/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import type { ExpireOccurrenceUploadBatch } from '../../src/trip-occurrence-upload-expire/application/trip-occurrence-upload-expire.port.js'
import { createTripOccurrenceUploadExpireRoutine } from '../../src/trip-occurrence-upload-expire/application/trip-occurrence-upload-expire.routine.js'
import {
  TRIP_OCCURRENCE_UPLOAD_EXPIRE_BATCH_SIZE,
  TRIP_OCCURRENCE_UPLOAD_EXPIRE_GRACE_SECONDS,
  TRIP_OCCURRENCE_UPLOAD_EXPIRE_JOB,
  TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_BATCHES,
  TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES,
} from '../../src/trip-occurrence-upload-expire/domain/trip-occurrence-upload-expire.constant.js'

const NOW = new Date('2026-09-24T09:00:00.000Z')

type LoggedCall = readonly unknown[]

function buildLogger(calls: LoggedCall[] = []) {
  const record = (...args: unknown[]) => {
    calls.push(args)
  }
  return { debug: record, error: record, info: record, warn: record }
}

function buildContext(isStopRequested: () => boolean = () => false): JobRoutineContext {
  return {
    correlationId: 'occurrence-upload-expire-contract',
    executionId: 'execution-1',
    isStopRequested,
    job: TRIP_OCCURRENCE_UPLOAD_EXPIRE_JOB,
    origin: 'schedule',
  }
}

function buildRoutine(expire: ExpireOccurrenceUploadBatch, calls: LoggedCall[] = []) {
  return createTripOccurrenceUploadExpireRoutine({
    expire,
    logger: buildLogger(calls) as never,
    now: () => NOW,
  })
}

describe('ciclo de expiração do upload de ocorrência (achado [3], spec 179)', () => {
  test('a rotina tem o nome que o catálogo e o CHECK do banco conhecem', () => {
    expect(TRIP_OCCURRENCE_UPLOAD_EXPIRE_JOB).toBe('trip.occurrence-upload.expire')
  })

  /** A folga desloca o corte para trás de `now`, nunca para adiante. */
  test('pede o lote com o corte já deslocado pela folga, nunca por `now` cru', async () => {
    const asked: Array<{ readonly before: Date; readonly limit: number }> = []
    const routine = buildRoutine(async (input) => {
      asked.push(input)
      return { expired: 0, failed: 0, missing: 0, processed: 0 }
    })

    await routine.run(buildContext())

    expect(asked).toHaveLength(1)
    expect(asked[0]?.limit).toBe(TRIP_OCCURRENCE_UPLOAD_EXPIRE_BATCH_SIZE)
    expect(asked[0]?.before.getTime()).toBe(
      NOW.getTime() - TRIP_OCCURRENCE_UPLOAD_EXPIRE_GRACE_SECONDS * 1000,
    )
  })

  test('pede lotes até não sobrar candidato — nunca até `expired` zerar', async () => {
    const asked: Array<{ readonly before: Date; readonly limit: number }> = []
    const answers = [
      { expired: 2, failed: 0, missing: 1, processed: TRIP_OCCURRENCE_UPLOAD_EXPIRE_BATCH_SIZE },
      // Lote inteiro perdido para corridas com `confirm`: `expired` zera, mas ainda há candidatas —
      // o laço continua porque `processed` não é zero.
      { expired: 0, failed: 0, missing: 5, processed: 5 },
      { expired: 0, failed: 0, missing: 0, processed: 0 },
    ]
    const routine = buildRoutine(async (input) => {
      asked.push(input)
      return answers[asked.length - 1] ?? { expired: 0, failed: 0, missing: 0, processed: 0 }
    })

    const result = await routine.run(buildContext())

    expect(result).toEqual({
      counters: { batches: 2, expired: 2, failed: 0, missing: 6 },
      outcome: 'succeeded',
    })
    expect(asked).toHaveLength(3)
  })

  test('para no limite do lote quando o operador pede parada', async () => {
    let calls = 0
    const routine = buildRoutine(async () => {
      calls += 1
      return { expired: 1, failed: 0, missing: 0, processed: 1 }
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
      return { expired: 1, failed: 0, missing: 0, processed: 1 }
    }, logged)

    const result = await routine.run(buildContext())

    expect(calls).toBe(TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_BATCHES)
    expect(result.counters.batches).toBe(TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_BATCHES)
    expect(JSON.stringify(logged)).toContain('"exhausted":true')
  })

  /** Bucket fora do ar: falhas seguidas interrompem o ciclo em vez de queimar os 200 lotes. */
  test('para o ciclo depois do teto de falhas de storage seguidas', async () => {
    let calls = 0
    const logged: LoggedCall[] = []
    const routine = buildRoutine(async () => {
      calls += 1
      return { expired: 0, failed: 1, missing: 0, processed: 1 }
    }, logged)

    const result = await routine.run(buildContext())

    expect(calls).toBe(TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES)
    expect(result.counters.failed).toBe(
      TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES,
    )
    expect(JSON.stringify(logged)).toContain('"stoppedByStorageFailures":true')
  })

  test('base sem candidata vencida termina em sucesso sem apagar nada', async () => {
    const result = await buildRoutine(async () => ({
      expired: 0,
      failed: 0,
      missing: 0,
      processed: 0,
    })).run(buildContext())

    expect(result).toEqual({
      counters: { batches: 0, expired: 0, failed: 0, missing: 0 },
      outcome: 'succeeded',
    })
  })

  /** O log leva só contadores e ids da execução — a chave do objeto carrega tenant e viagem. */
  test('o log do ciclo nunca leva chave de objeto, bucket ou id de empresa/viagem', async () => {
    const logged: LoggedCall[] = []
    await buildRoutine(
      async () => ({ expired: 3, failed: 0, missing: 1, processed: 4 }),
      logged,
    ).run(buildContext())

    const serialized = JSON.stringify(logged)
    expect(serialized).not.toContain('bucket')
    expect(serialized).not.toContain('companyId')
    expect(serialized).not.toContain('tripId')
    expect(serialized).not.toContain('objectKey')
  })
})
