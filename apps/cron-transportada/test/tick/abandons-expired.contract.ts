/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A varredura de abandono. Ela existe porque o índice parcial `job_executions_open_unique` é
 * absoluto: uma linha aberta que ninguém está correndo trava a rotina para sempre, e a batida
 * seguinte só saberia dizer `cron_tick_job_still_running` — a morte calada que esta spec veio
 * fechar. Duas mortes cabem aqui: o worker que caiu com o lease na mão, e a mensagem que morreu no
 * caminho e deixou a linha aberta sem lease nenhum.
 */
import { describe, expect, test } from 'bun:test'

import { runTickCycle } from '../../src/tick/application/run-tick.js'
import { JOB_EXECUTION_PICKUP_GRACE_SECONDS } from '../../src/tick/domain/tick.constant.js'
import { createJobScheduleDouble, type ScheduleRow } from './job-schedule.double.js'
import {
  createEventIdFactory,
  createLockDouble,
  createLoggerDouble,
  createPublisherDouble,
} from './tick.double.js'

const NOW = new Date('2026-08-23T12:00:00.000Z')
const CORRELATION_ID = 'tick-correlation'
const JOB = 'fuel.price.pull'

function scheduleRow(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    enabled: true,
    intervalSeconds: 300,
    job: JOB,
    nextRunAt: new Date('2026-08-23T11:55:00.000Z'),
    ...overrides,
  }
}

type OpenExecution = {
  readonly leaseExpiresAt?: Date
  readonly startedAt?: Date
}

type RunParams = {
  readonly granted?: boolean
  readonly open?: OpenExecution
  readonly rows?: readonly ScheduleRow[]
}

async function runCycle(params: RunParams = {}) {
  const schedules = createJobScheduleDouble(params.rows ?? [scheduleRow()])
  const logger = createLoggerDouble()
  const publisher = createPublisherDouble()

  if (params.open !== undefined) {
    // Abre a linha pelo caminho de produção — é o relógio quem insere, e ele insere sem lease.
    const started = await schedules.start({
      correlationId: 'previous-tick',
      job: JOB,
      nextRunAt: NOW,
      startedAt: params.open.startedAt ?? NOW,
    })
    if (started === undefined) throw new Error('OPEN_EXECUTION_NOT_STARTED')
    const row = schedules.executions.find((candidate) => candidate.id === started.executionId)
    if (row === undefined) throw new Error('OPEN_EXECUTION_NOT_FOUND')
    // O lease é do worker: ele só aparece na linha depois da reivindicação.
    row.leaseExpiresAt = params.open.leaseExpiresAt
  }

  const result = await runTickCycle({
    correlationId: CORRELATION_ID,
    lock: createLockDouble(params.granted ?? true),
    logger,
    newEventId: createEventIdFactory(),
    now: NOW,
    publisher,
    schedules,
  })

  return { logger, publisher, result, schedules }
}

function openExecutionOf(schedules: {
  readonly executions: readonly { finishedAt: Date | undefined }[]
}) {
  return schedules.executions.filter((row) => row.finishedAt === undefined)
}

describe('cron tick abandons executions nobody is running', () => {
  test('lease vencido é abandonado e a rotina publica na mesma batida', async () => {
    const { publisher, result, schedules } = await runCycle({
      open: { leaseExpiresAt: new Date(NOW.getTime() - 1_000) },
    })

    expect(result.abandonedCount).toBe(1)
    expect(schedules.executions[0]).toMatchObject({
      finishedAt: NOW,
      leaseExpiresAt: undefined,
      outcome: 'abandoned',
    })
    // A ordem é o que importa: varrer depois de `listDue` publicaria zero e travaria de novo.
    expect(result.publishedCount).toBe(1)
    expect(publisher.published).toHaveLength(1)
    expect(openExecutionOf(schedules)).toHaveLength(1)
  })

  test('lease vivo não é abandonado — a rotina está correndo mesmo, e a batida a pula', async () => {
    const { publisher, result, schedules } = await runCycle({
      open: { leaseExpiresAt: new Date(NOW.getTime() + 20_000) },
    })

    expect(result.abandonedCount).toBe(0)
    expect(result.publishedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(publisher.published).toHaveLength(0)
    expect(schedules.executions[0]?.outcome).toBeUndefined()
  })

  test('linha aberta sem lease dentro da carência espera: a mensagem ainda pode ser retirada', async () => {
    const { result, schedules } = await runCycle({
      open: {
        startedAt: new Date(NOW.getTime() - (JOB_EXECUTION_PICKUP_GRACE_SECONDS - 1) * 1000),
      },
    })

    expect(result.abandonedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(schedules.executions[0]?.outcome).toBeUndefined()
  })

  test('linha aberta sem lease além da carência é abandonada: ninguém vai reivindicá-la', async () => {
    const { result, schedules } = await runCycle({
      open: { startedAt: new Date(NOW.getTime() - JOB_EXECUTION_PICKUP_GRACE_SECONDS * 1000) },
    })

    expect(result.abandonedCount).toBe(1)
    expect(result.publishedCount).toBe(1)
    expect(schedules.executions[0]?.outcome).toBe('abandoned')
  })

  test('a carência é quinze minutos — três batidas mais as três tentativas do trilho cabem nela', () => {
    expect(JOB_EXECUTION_PICKUP_GRACE_SECONDS).toBe(900)
  })

  test('o abandono é registrado com a contagem, e batida limpa não registra nada', async () => {
    const abandoned = await runCycle({ open: { leaseExpiresAt: new Date(NOW.getTime() - 1_000) } })
    const clean = await runCycle()

    expect(abandoned.logger.messages).toContainEqual({
      message: 'cron_tick_executions_abandoned',
      metadata: { abandonedCount: 1 },
    })
    expect(
      clean.logger.messages.some((entry) => entry.message === 'cron_tick_executions_abandoned'),
    ).toBe(false)
    expect(clean.result.abandonedCount).toBe(0)
  })

  test('linha já fechada não é varrida de novo — o desfecho da primeira permanece', async () => {
    const schedules = createJobScheduleDouble([scheduleRow()])
    const started = await schedules.start({
      correlationId: 'previous-tick',
      job: JOB,
      nextRunAt: NOW,
      startedAt: new Date(NOW.getTime() - 3_600_000),
    })
    if (started === undefined) throw new Error('OPEN_EXECUTION_NOT_STARTED')
    await schedules.finish({
      executionId: started.executionId,
      finishedAt: new Date(NOW.getTime() - 3_500_000),
      outcome: 'succeeded',
    })

    const result = await runTickCycle({
      correlationId: CORRELATION_ID,
      lock: createLockDouble(true),
      logger: createLoggerDouble(),
      newEventId: createEventIdFactory(),
      now: NOW,
      publisher: createPublisherDouble(),
      schedules,
    })

    expect(result.abandonedCount).toBe(0)
    expect(schedules.executions[0]?.outcome).toBe('succeeded')
  })

  test('sem o lock não se varre nada: duas instâncias abandonando a mesma linha é corrida', async () => {
    const { result, schedules } = await runCycle({
      granted: false,
      open: { leaseExpiresAt: new Date(NOW.getTime() - 1_000) },
    })

    expect(result).toEqual({
      abandonedCount: 0,
      acquiredLock: false,
      dueCount: 0,
      failedCount: 0,
      publishedCount: 0,
      skippedCount: 0,
    })
    expect(schedules.executions[0]?.outcome).toBeUndefined()
  })
})
