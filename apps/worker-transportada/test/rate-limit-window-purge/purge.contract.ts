/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import type { PurgeExpiredRateLimitWindows } from '../../src/rate-limit-window-purge/application/rate-limit-window-purge.port.js'
import { createRateLimitWindowPurgeRoutine } from '../../src/rate-limit-window-purge/application/rate-limit-window-purge.routine.js'
import {
  RATE_LIMIT_WINDOW_MAX_SECONDS,
  RATE_LIMIT_WINDOW_PURGE_BATCH_SIZE,
  RATE_LIMIT_WINDOW_PURGE_JOB,
  RATE_LIMIT_WINDOW_PURGE_MAX_BATCHES,
  resolveRateLimitWindowPurgeCutoff,
} from '../../src/rate-limit-window-purge/domain/rate-limit-window-purge.constant.js'

const NOW = new Date('2026-09-15T12:00:00.000Z')

type LoggedCall = readonly unknown[]

function buildLogger(calls: LoggedCall[] = []) {
  const record = (...args: unknown[]) => {
    calls.push(args)
  }
  return { debug: record, error: record, info: record, warn: record }
}

function buildContext(isStopRequested: () => boolean = () => false): JobRoutineContext {
  return {
    correlationId: 'rate-limit-window-purge-contract',
    executionId: 'execution-1',
    isStopRequested,
    job: RATE_LIMIT_WINDOW_PURGE_JOB,
    origin: 'schedule',
  }
}

function buildRoutine(purge: PurgeExpiredRateLimitWindows, calls: LoggedCall[] = []) {
  return createRateLimitWindowPurgeRoutine({
    logger: buildLogger(calls) as never,
    now: () => NOW,
    purge,
  })
}

describe('limpeza das janelas do limitador (spec 150 T406)', () => {
  test('a rotina tem o nome que o catálogo e o CHECK do banco conhecem', () => {
    expect(RATE_LIMIT_WINDOW_PURGE_JOB).toBe('rate-limit.window.purge')
  })

  /**
   * O worker não conhece a janela configurada na API: corta pela maior que ela aceita (um dia) mais
   * um dia de folga. Janela de um dia que começou há 47 h ainda não venceu há 24 h — fica.
   */
  test('só apaga a janela que venceu há mais de 24 h, qualquer que seja a duração dela', () => {
    expect(RATE_LIMIT_WINDOW_MAX_SECONDS).toBe(86_400)
    expect(resolveRateLimitWindowPurgeCutoff(NOW).toISOString()).toBe('2026-09-13T12:00:00.000Z')
  })

  test('apaga em lotes até não sobrar janela vencida', async () => {
    const asked: Array<{ readonly before: Date; readonly limit: number }> = []
    const answers = [RATE_LIMIT_WINDOW_PURGE_BATCH_SIZE, 12, 0]
    const routine = buildRoutine(async (input) => {
      asked.push(input)
      return answers[asked.length - 1] ?? 0
    })

    const result = await routine.run(buildContext())

    expect(result).toEqual({
      counters: { batches: 2, deleted: RATE_LIMIT_WINDOW_PURGE_BATCH_SIZE + 12 },
      outcome: 'succeeded',
    })
    expect(asked).toHaveLength(3)
    expect(asked[0]?.limit).toBe(RATE_LIMIT_WINDOW_PURGE_BATCH_SIZE)
    expect(asked[0]?.before.toISOString()).toBe('2026-09-13T12:00:00.000Z')
  })

  test('para no limite do lote quando o operador pede parada', async () => {
    let calls = 0
    const routine = buildRoutine(async () => {
      calls += 1
      return RATE_LIMIT_WINDOW_PURGE_BATCH_SIZE
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
      return RATE_LIMIT_WINDOW_PURGE_BATCH_SIZE
    }, logged)

    const result = await routine.run(buildContext())

    expect(calls).toBe(RATE_LIMIT_WINDOW_PURGE_MAX_BATCHES)
    expect(result.counters.batches).toBe(RATE_LIMIT_WINDOW_PURGE_MAX_BATCHES)
    expect(JSON.stringify(logged)).toContain('"exhausted":true')
  })

  /** A chave da janela é `companyId:userId`: o log leva só contagens e os ids da execução. */
  test('o log do ciclo leva só contagens e os ids da execução', async () => {
    const logged: LoggedCall[] = []
    await buildRoutine(async () => 0, logged).run(buildContext())

    const serialized = JSON.stringify(logged)
    expect(serialized).toContain('rate_limit_window_purge_cycle_finished')
    expect(serialized).toContain('"deleted":0')
    expect(serialized).not.toContain('subject')
    expect(serialized).not.toContain('scope')
  })
})
