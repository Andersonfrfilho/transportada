/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.10 (RF5): o laço do alarme do retorno vencido — fila, tetos, parada, aviso depois do alerta,
 * falha de entrega contada sem refazer a transição, e o log só com ids e números.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ApplyContractorReplyAlertParams,
  ApplyContractorReplyAlertResult,
  DueContractorReply,
  ListDueContractorRepliesParams,
  NotifyContractorReplyAlertParams,
} from '../../src/occurrence-contractor-reply-alert/application/occurrence-contractor-reply-alert.port.js'
import { createOccurrenceContractorReplyAlertRoutine } from '../../src/occurrence-contractor-reply-alert/application/occurrence-contractor-reply-alert.routine.js'
import {
  OCCURRENCE_CONTRACTOR_REPLY_ALERT_BATCH_SIZE,
  OCCURRENCE_CONTRACTOR_REPLY_ALERT_JOB,
  OCCURRENCE_CONTRACTOR_REPLY_ALERT_MAX_PER_CYCLE,
} from '../../src/occurrence-contractor-reply-alert/domain/occurrence-contractor-reply-alert.constant.js'

const NOW = new Date('2026-10-12T12:00:00.000Z')

function buildReply(index: number): DueContractorReply {
  return {
    companyId: index % 2 === 0 ? 'company-a' : 'company-b',
    replyId: `reply-${String(index).padStart(3, '0')}`,
  }
}

const ALERTED: ApplyContractorReplyAlertResult = {
  alertNumber: 1,
  becomesOverdue: true,
  kind: 'alerted',
  recipient: { occurrenceLabel: 'NF 123/1', recipientUserId: 'user-1' },
}

type Harness = ReturnType<typeof buildHarness>

function buildHarness(input: {
  readonly apply?: (params: ApplyContractorReplyAlertParams) => ApplyContractorReplyAlertResult
  readonly notify?: (params: NotifyContractorReplyAlertParams) => void
  readonly replies: readonly DueContractorReply[]
  readonly stopAfterApplies?: number
}) {
  const listCalls: ListDueContractorRepliesParams[] = []
  const applied: ApplyContractorReplyAlertParams[] = []
  const notified: NotifyContractorReplyAlertParams[] = []
  const captured: unknown[] = []
  const logs: { message: string; metadata: unknown }[] = []

  const routine = createOccurrenceContractorReplyAlertRoutine({
    errorTracker: { captureException: (error: unknown) => captured.push(error) },
    logger: {
      error: (message, metadata) => logs.push({ message, metadata }),
      info: (message, metadata) => logs.push({ message, metadata }),
      warn: (message, metadata) => logs.push({ message, metadata }),
    },
    notifier: {
      async notify(params) {
        notified.push(params)
        input.notify?.(params)
      },
    },
    now: () => NOW,
    queue: {
      async listDue(params) {
        listCalls.push(params)
        const excluded = new Set(params.excludeReplyIds)
        return input.replies.filter((reply) => !excluded.has(reply.replyId)).slice(0, params.limit)
      },
    },
    store: {
      async applyAlert(params) {
        applied.push(params)
        return input.apply?.(params) ?? ALERTED
      },
    },
  })
  const context = {
    correlationId: 'correlation-1',
    executionId: 'execution-1',
    isStopRequested: () =>
      input.stopAfterApplies !== undefined && applied.length >= input.stopAfterApplies,
    job: OCCURRENCE_CONTRACTOR_REPLY_ALERT_JOB,
    origin: 'schedule',
  } as const
  return { applied, captured, listCalls, logs, notified, run: () => routine.run(context) }
}

describe('occurrence contractor reply alert routine', () => {
  test('runs the alert under the reply own company and notifies the dispatcher with the alert number', async () => {
    const harness = buildHarness({ replies: [buildReply(0), buildReply(1)] })

    const result = await harness.run()

    expect(harness.applied).toEqual([
      { companyId: 'company-a', now: NOW, replyId: 'reply-000' },
      { companyId: 'company-b', now: NOW, replyId: 'reply-001' },
    ])
    expect(harness.notified).toEqual([
      {
        alertNumber: 1,
        companyId: 'company-a',
        recipient: { occurrenceLabel: 'NF 123/1', recipientUserId: 'user-1' },
        replyId: 'reply-000',
      },
      {
        alertNumber: 1,
        companyId: 'company-b',
        recipient: { occurrenceLabel: 'NF 123/1', recipientUserId: 'user-1' },
        replyId: 'reply-001',
      },
    ])
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({
      alerted: 2,
      becameOverdue: 2,
      notified: 2,
      repliesSeen: 2,
    })
  })

  test('a reply the policy skips sends no notification, and a trip without dispatch only gets the badge', async () => {
    const harness = buildHarness({
      apply: ({ replyId }) => {
        if (replyId === 'reply-000') return { kind: 'skipped', reason: 'conflict' }
        return { ...ALERTED, becomesOverdue: false, recipient: null }
      },
      replies: [buildReply(0), buildReply(1)],
    })

    const result = await harness.run()

    expect(harness.notified).toEqual([])
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({
      alerted: 1,
      becameOverdue: 0,
      skipped: 1,
      withoutRecipient: 1,
    })
  })

  test('does not list the same reply twice in a cycle and stops when the batch comes back short', async () => {
    const replies = Array.from(
      { length: OCCURRENCE_CONTRACTOR_REPLY_ALERT_BATCH_SIZE + 3 },
      (_, i) => buildReply(i),
    )
    const harness = buildHarness({ replies })

    await harness.run()

    expect(harness.listCalls).toHaveLength(2)
    expect(harness.listCalls[1]?.excludeReplyIds).toHaveLength(
      OCCURRENCE_CONTRACTOR_REPLY_ALERT_BATCH_SIZE,
    )
    expect(harness.applied).toHaveLength(replies.length)
  })

  test('caps the replies per cycle', async () => {
    const replies = Array.from(
      { length: OCCURRENCE_CONTRACTOR_REPLY_ALERT_MAX_PER_CYCLE + 20 },
      (_, i) => buildReply(i),
    )
    const harness = buildHarness({ replies })

    await harness.run()

    expect(harness.applied).toHaveLength(OCCURRENCE_CONTRACTOR_REPLY_ALERT_MAX_PER_CYCLE)
  })

  test('stops at the unit boundary when a stop is requested', async () => {
    const harness = buildHarness({
      replies: Array.from({ length: 5 }, (_, i) => buildReply(i)),
      stopAfterApplies: 2,
    })

    await harness.run()

    expect(harness.applied).toHaveLength(2)
  })

  test('a delivery failure keeps the alert counted and closes the cycle as notification_failed', async () => {
    const harness = buildHarness({
      notify: ({ replyId }) => {
        if (replyId === 'reply-000') throw new Error('boom')
      },
      replies: [buildReply(0), buildReply(1)],
    })

    const result = await harness.run()

    expect(harness.applied).toHaveLength(2)
    expect(harness.notified).toHaveLength(2)
    expect(harness.captured).toHaveLength(1)
    expect(result.outcome).toBe('notification_failed')
    expect(result.counters).toMatchObject({ alerted: 2, notificationFailures: 1, notified: 1 })
  })

  test('a failing reply is isolated, reported to the tracker and counted', async () => {
    const harness = buildHarness({
      apply: ({ replyId }) => {
        if (replyId === 'reply-000') throw new Error('database down')
        return ALERTED
      },
      replies: [buildReply(0), buildReply(1)],
    })

    const result = await harness.run()

    expect(harness.applied).toHaveLength(2)
    expect(harness.captured).toHaveLength(1)
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ alerted: 1, unexpectedErrors: 1 })
  })

  test('logs only ids and numbers: never the label, the recipient or an address', async () => {
    const harness: Harness = buildHarness({ replies: [buildReply(0)] })

    await harness.run()

    const logged = JSON.stringify(harness.logs)
    expect(logged).toContain('occurrence_contractor_reply_alert_cycle_finished')
    expect(logged).not.toContain('NF 123')
    expect(logged).not.toContain('user-1')
    expect(logged).not.toContain('@')
  })
})
