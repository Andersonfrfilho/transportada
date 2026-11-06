/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O passo que devolve ao trilho as buscas por chave em `waiting` dentro da rotina de NF-e: o que se
 * guarda aqui é a escolha (quantas cabem no orçamento, as mais antigas primeiro) e como o ciclo
 * conta e fecha a linha quando o passo funciona ou falha.
 */
import { describe, expect, test } from 'bun:test'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { createNfeDistributionPullRoutine } from '../../src/nfe-distribution-pull/application/nfe-distribution-pull.routine.js'
import { DISTRIBUTION_PULL_JOB } from '../../src/nfe-distribution-pull/domain/distribution-pull.constant.js'
import {
  computeRemainingBudget,
  selectLookupsToRequeue,
  type RequeueCandidate,
} from '../../src/nfe-access-key-lookup/domain/requeue-waiting-lookups.policy.js'

import { createLoggerDouble, type LoggedMessage } from './job-run.double.js'

const NOW = new Date('2026-11-06T12:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000
const FIRST_COMPANY = '4c3e6d1a-8b2f-4d5e-9a7c-1b2c3d4e5f60'
const SECOND_COMPANY = '5d4f7e2b-9c3a-4e6f-8b8d-2c3d4e5f6071'

function candidate(id: string, companyId = FIRST_COMPANY): RequeueCandidate {
  return { companyId, environment: 'production', id }
}

describe('computeRemainingBudget', () => {
  test('without a budget row the whole window is free', () => {
    expect(computeRemainingBudget({ inFlightCount: 0, now: NOW, row: undefined })).toBe(15)
  })

  test('counts what is left inside the open window', () => {
    const row = {
      blockedUntil: null,
      usedInWindow: 11,
      windowStartedAt: new Date(NOW.getTime() - 10 * 60_000),
    }

    expect(computeRemainingBudget({ inFlightCount: 0, now: NOW, row })).toBe(4)
  })

  test('an expired window is free again', () => {
    const row = {
      blockedUntil: null,
      usedInWindow: 15,
      windowStartedAt: new Date(NOW.getTime() - HOUR_MS),
    }

    expect(computeRemainingBudget({ inFlightCount: 0, now: NOW, row })).toBe(15)
  })

  test('lookups already queued or querying come out of what is left', () => {
    const row = {
      blockedUntil: null,
      usedInWindow: 11,
      windowStartedAt: new Date(NOW.getTime() - 10 * 60_000),
    }

    expect(computeRemainingBudget({ inFlightCount: 3, now: NOW, row })).toBe(1)
    expect(computeRemainingBudget({ inFlightCount: 9, now: NOW, row })).toBe(0)
    expect(computeRemainingBudget({ inFlightCount: 20, now: NOW, row: undefined })).toBe(0)
  })

  test('an open 656 block leaves nothing, a finished one does not matter', () => {
    const windowStartedAt = new Date(NOW.getTime() - 5 * 60_000)

    expect(
      computeRemainingBudget({
        inFlightCount: 0,
        now: NOW,
        row: { blockedUntil: new Date(NOW.getTime() + 60_000), usedInWindow: 0, windowStartedAt },
      }),
    ).toBe(0)
    expect(
      computeRemainingBudget({
        inFlightCount: 0,
        now: NOW,
        row: { blockedUntil: new Date(NOW.getTime() - 1), usedInWindow: 0, windowStartedAt },
      }),
    ).toBe(15)
  })
})

describe('selectLookupsToRequeue', () => {
  test('takes at most the remaining budget of each company, keeping the order it received', () => {
    const candidates = [
      candidate('a1'),
      candidate('b1', SECOND_COMPANY),
      candidate('a2'),
      candidate('a3'),
      candidate('b2', SECOND_COMPANY),
    ]

    const selected = selectLookupsToRequeue({
      candidates,
      remainingByScope: new Map([
        [`${FIRST_COMPANY}:production`, 2],
        [`${SECOND_COMPANY}:production`, 0],
      ]),
    })

    expect(selected.map((entry) => entry.id)).toEqual(['a1', 'a2'])
  })

  test('a scope without a known budget gets nothing', () => {
    expect(
      selectLookupsToRequeue({ candidates: [candidate('a1')], remainingByScope: new Map() }),
    ).toEqual([])
  })
})

type Fixture = {
  readonly logged: LoggedMessage[]
  readonly requeueCalls: Date[]
  readonly run: (isStopRequested?: boolean) => Promise<{
    readonly counters: Readonly<Record<string, number>>
    readonly outcome: string
  }>
}

function createFixture(requeue: () => Promise<{ readonly requeuedCount: number }>): Fixture {
  const logged: LoggedMessage[] = []
  const requeueCalls: Date[] = []
  const routine = createNfeDistributionPullRoutine({
    gateway: { persist: async () => ({ enqueued: true }) },
    identifiers: { nextEventId: () => 'event', nextImportId: () => 'import' },
    logger: createLoggerDouble(logged),
    now: () => NOW,
    requeue: {
      async requeueDueLookups(input) {
        requeueCalls.push(input.now)
        return requeue()
      },
    },
    source: { listCandidates: async () => [] },
  })
  return {
    logged,
    requeueCalls,
    run: (isStopRequested = false) =>
      routine.run({
        correlationId: 'tick',
        executionId: '7d8e9f0a-1b2c-4d3e-8f5a-6b7c8d9e0f1a',
        isStopRequested: () => isStopRequested,
        job: DISTRIBUTION_PULL_JOB,
        origin: 'schedule',
      } satisfies JobRoutineContext),
  }
}

describe('nfe distribution pull routine requeues waiting lookups', () => {
  test('runs the step with the cycle clock even when no company is eligible and counts it', async () => {
    const fixture = createFixture(async () => ({ requeuedCount: 3 }))

    const result = await fixture.run()

    expect(fixture.requeueCalls).toEqual([NOW])
    expect(result.counters).toEqual({
      eligible: 0,
      enqueued: 0,
      failed: 0,
      requeued: 3,
      skipped: 0,
    })
    expect(result.outcome).toBe('succeeded')
  })

  test('a failing step is logged without the cause details and closes the cycle as unexpected_error', async () => {
    const fixture = createFixture(async () => {
      throw new Error('boom with secret detail')
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('unexpected_error')
    expect(result.counters.failed).toBe(1)
    const entry = fixture.logged.find((item) => item.message === 'nfe_access_key_requeue_failed')
    expect(entry).toBeDefined()
    expect(JSON.stringify(fixture.logged)).not.toContain('secret detail')
  })

  test('does not run the step when a stop was requested', async () => {
    const fixture = createFixture(async () => ({ requeuedCount: 1 }))

    await fixture.run(true)

    expect(fixture.requeueCalls).toEqual([])
  })
})
