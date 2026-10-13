/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.4b (RF2): o laço do varredor — janela da fila, tetos, parada, falha contada sem derrubar
 * o resto, e o desfecho de execução quando a API some ou recusa o crachá. O log só leva ids e números.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceAutomaticMailApiPort } from '../../src/occurrence-automatic-mail-sweep/application/occurrence-automatic-mail-api.port.js'
import { OccurrenceAutomaticMailApiError } from '../../src/occurrence-automatic-mail-sweep/application/occurrence-automatic-mail-api.error.js'
import type {
  ListPendingAutomaticMailParams,
  OccurrenceAutomaticMailQueuePort,
  PendingAutomaticMailOccurrence,
} from '../../src/occurrence-automatic-mail-sweep/application/occurrence-automatic-mail-queue.port.js'
import { createOccurrenceAutomaticMailSweepRoutine } from '../../src/occurrence-automatic-mail-sweep/application/occurrence-automatic-mail-sweep.routine.js'
import {
  OCCURRENCE_AUTOMATIC_MAIL_BATCH_SIZE,
  OCCURRENCE_AUTOMATIC_MAIL_GRACE_MILLISECONDS,
  OCCURRENCE_AUTOMATIC_MAIL_LOOKBACK_MILLISECONDS,
  OCCURRENCE_AUTOMATIC_MAIL_MAX_PER_CYCLE,
  OCCURRENCE_AUTOMATIC_MAIL_SWEEP_JOB,
} from '../../src/occurrence-automatic-mail-sweep/domain/occurrence-automatic-mail-sweep.constant.js'

const NOW = new Date('2026-10-09T12:00:00.000Z')

function buildOccurrence(index: number): PendingAutomaticMailOccurrence {
  return {
    companyId: index % 2 === 0 ? 'company-a' : 'company-b',
    occurrenceId: `occurrence-${String(index).padStart(3, '0')}`,
  }
}

type SendResult = Awaited<ReturnType<OccurrenceAutomaticMailApiPort['send']>>
type SendBehavior = (input: { companyId: string; occurrenceId: string }) => SendResult

function buildHarness(input: {
  readonly occurrences: readonly PendingAutomaticMailOccurrence[]
  readonly send?: SendBehavior
  readonly stopAfterSends?: number
}) {
  const listCalls: ListPendingAutomaticMailParams[] = []
  const sent: { companyId: string; occurrenceId: string }[] = []
  const captured: unknown[] = []
  const logs: { message: string; metadata: unknown }[] = []

  const queue: OccurrenceAutomaticMailQueuePort = {
    async listPending(params) {
      listCalls.push(params)
      const excluded = new Set(params.excludeOccurrenceIds)
      return input.occurrences
        .filter((item) => !excluded.has(item.occurrenceId))
        .slice(0, params.limit)
    },
  }
  const mailApi: OccurrenceAutomaticMailApiPort = {
    async send(params) {
      sent.push(params)
      return input.send?.(params) ?? { outcome: 'sent' }
    },
  }
  const routine = createOccurrenceAutomaticMailSweepRoutine({
    errorTracker: { captureException: (error: unknown) => captured.push(error) },
    logger: {
      error: (message, metadata) => logs.push({ message, metadata }),
      info: (message, metadata) => logs.push({ message, metadata }),
      warn: (message, metadata) => logs.push({ message, metadata }),
    },
    mailApi,
    now: () => NOW,
    queue,
  })
  const context = {
    correlationId: 'correlation-1',
    executionId: 'execution-1',
    isStopRequested: () =>
      input.stopAfterSends !== undefined && sent.length >= input.stopAfterSends,
    job: OCCURRENCE_AUTOMATIC_MAIL_SWEEP_JOB,
    origin: 'schedule',
  } as const
  return { captured, listCalls, logs, routine, run: () => routine.run(context), sent }
}

describe('occurrence automatic mail sweep routine', () => {
  test('asks the queue only for occurrences older than 10 minutes and younger than the lookback', async () => {
    const harness = buildHarness({ occurrences: [] })

    await harness.run()

    expect(OCCURRENCE_AUTOMATIC_MAIL_GRACE_MILLISECONDS).toBe(10 * 60_000)
    expect(harness.listCalls[0]?.createdBefore).toEqual(
      new Date(NOW.getTime() - OCCURRENCE_AUTOMATIC_MAIL_GRACE_MILLISECONDS),
    )
    expect(harness.listCalls[0]?.createdAfter).toEqual(
      new Date(NOW.getTime() - OCCURRENCE_AUTOMATIC_MAIL_LOOKBACK_MILLISECONDS),
    )
    expect(OCCURRENCE_AUTOMATIC_MAIL_LOOKBACK_MILLISECONDS).toBeGreaterThan(
      OCCURRENCE_AUTOMATIC_MAIL_GRACE_MILLISECONDS,
    )
  })

  test('sends each candidate under its own company and counts sent, already sent and skipped apart', async () => {
    const occurrences = [buildOccurrence(0), buildOccurrence(1), buildOccurrence(2)]
    const harness = buildHarness({
      occurrences,
      send: ({ occurrenceId }) => {
        if (occurrenceId === 'occurrence-001') return { outcome: 'already_sent' }
        if (occurrenceId === 'occurrence-002') return { outcome: 'skipped' }
        return { outcome: 'sent' }
      },
    })

    const result = await harness.run()

    expect(harness.sent).toEqual(occurrences)
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({
      alreadySent: 1,
      occurrencesSeen: 3,
      sent: 1,
      skipped: 1,
    })
  })

  test('does not list the same occurrence twice in a cycle and stops when the batch comes back short', async () => {
    const occurrences = Array.from({ length: OCCURRENCE_AUTOMATIC_MAIL_BATCH_SIZE + 3 }, (_, i) =>
      buildOccurrence(i),
    )
    const harness = buildHarness({ occurrences })

    await harness.run()

    expect(harness.listCalls).toHaveLength(2)
    expect(harness.listCalls[1]?.excludeOccurrenceIds).toHaveLength(
      OCCURRENCE_AUTOMATIC_MAIL_BATCH_SIZE,
    )
    expect(harness.sent).toHaveLength(occurrences.length)
  })

  test('caps the occurrences per cycle', async () => {
    const occurrences = Array.from(
      { length: OCCURRENCE_AUTOMATIC_MAIL_MAX_PER_CYCLE + 20 },
      (_, i) => buildOccurrence(i),
    )
    const harness = buildHarness({ occurrences })

    await harness.run()

    expect(harness.sent).toHaveLength(OCCURRENCE_AUTOMATIC_MAIL_MAX_PER_CYCLE)
  })

  test('stops at the unit boundary when a stop is requested', async () => {
    const harness = buildHarness({
      occurrences: Array.from({ length: 5 }, (_, i) => buildOccurrence(i)),
      stopAfterSends: 2,
    })

    const result = await harness.run()

    expect(harness.sent).toHaveLength(2)
    expect(result.outcome).toBe('succeeded')
  })

  test('a rejected request is counted and the rest of the batch goes on', async () => {
    const harness = buildHarness({
      occurrences: [buildOccurrence(0), buildOccurrence(1)],
      send: ({ occurrenceId }) => {
        if (occurrenceId === 'occurrence-000') {
          throw new OccurrenceAutomaticMailApiError('request_rejected', 404)
        }
        return { outcome: 'sent' }
      },
    })

    const result = await harness.run()

    expect(harness.sent).toHaveLength(2)
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ requestRejected: 1, sent: 1 })
  })

  test('an unexpected failure is isolated, reported to the tracker and counted', async () => {
    const harness = buildHarness({
      occurrences: [buildOccurrence(0), buildOccurrence(1)],
      send: ({ occurrenceId }) => {
        if (occurrenceId === 'occurrence-000') throw new Error('boom')
        return { outcome: 'sent' }
      },
    })

    const result = await harness.run()

    expect(harness.sent).toHaveLength(2)
    expect(harness.captured).toHaveLength(1)
    expect(result.counters).toMatchObject({ sent: 1, unexpectedErrors: 1 })
  })

  test('an unreachable API ends the cycle with that outcome instead of burning the whole batch', async () => {
    const harness = buildHarness({
      occurrences: Array.from({ length: 5 }, (_, i) => buildOccurrence(i)),
      send: () => {
        throw new OccurrenceAutomaticMailApiError('api_unreachable', 503)
      },
    })

    const result = await harness.run()

    expect(result.outcome).toBe('api_unreachable')
    expect(harness.sent).toHaveLength(1)
    expect(result.counters).toMatchObject({ apiUnreachable: 1 })
  })

  test('a refused credential ends the cycle as api_unauthorized and reaches the tracker', async () => {
    const harness = buildHarness({
      occurrences: Array.from({ length: 5 }, (_, i) => buildOccurrence(i)),
      send: () => {
        throw new OccurrenceAutomaticMailApiError('api_unauthorized', 401)
      },
    })

    const result = await harness.run()

    expect(result.outcome).toBe('api_unauthorized')
    expect(harness.sent).toHaveLength(1)
    expect(harness.captured).toHaveLength(1)
  })

  test('logs only opaque ids and numbers', async () => {
    const harness = buildHarness({
      occurrences: [buildOccurrence(0)],
      send: () => {
        throw new OccurrenceAutomaticMailApiError('request_rejected', 404)
      },
    })

    await harness.run()

    const serialized = JSON.stringify(harness.logs)
    expect(serialized).toContain('occurrence_automatic_mail_sweep_cycle_finished')
    expect(serialized).not.toContain('@')
  })
})
