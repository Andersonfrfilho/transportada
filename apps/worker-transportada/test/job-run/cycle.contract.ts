/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ClaimJobExecutionParams,
  ClaimedJobExecution,
  FinishJobExecutionParams,
  JobExecutionPort,
} from '../../src/job-run/application/job-execution.port.js'
import type {
  JobRoutineContext,
  JobRoutineRegistry,
} from '../../src/job-run/application/job-routine.port.js'
import { JOB_RUN_LEASE_SECONDS, runJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type { JobRunEnvelopeV1 } from '../../src/messaging/job-run-envelope.schema.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

const EXECUTION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const NOW = new Date('2026-08-23T09:00:00.000Z')

const ENVELOPE: JobRunEnvelopeV1 = {
  correlationId: 'tick-2026-08-23T09:00:00.000Z',
  eventId: '0f7c4a3e-9b1d-4e2f-8a5c-6d7e8f9a0b1c',
  occurredAt: '2026-08-23T09:00:00.000Z',
  payload: { executionId: EXECUTION_ID, job: 'fuel.price.pull', origin: 'schedule' },
  type: 'transportada.job.run.requested',
  version: 1,
}

type LoggedMessage = { readonly message: string; readonly metadata: unknown }

type CycleFixture = {
  readonly claims: ClaimJobExecutionParams[]
  readonly finishes: FinishJobExecutionParams[]
  readonly logged: LoggedMessage[]
  readonly run: (routines: JobRoutineRegistry) => ReturnType<typeof runJobCycle>
}

type FixtureParams = {
  readonly claimable?: boolean
  readonly claimed?: ClaimedJobExecution
}

const DEFAULT_CLAIMED: ClaimedJobExecution = { job: 'fuel.price.pull', origin: 'schedule' }

function createFixture({
  claimable = true,
  claimed = DEFAULT_CLAIMED,
}: FixtureParams = {}): CycleFixture {
  const claims: ClaimJobExecutionParams[] = []
  const finishes: FinishJobExecutionParams[] = []
  const logged: LoggedMessage[] = []

  const executions: JobExecutionPort = {
    claim: async (params) => {
      claims.push(params)
      return claimable ? claimed : undefined
    },
    finish: async (params) => {
      finishes.push(params)
    },
  }

  const logger = {
    debug: () => {},
    error: (message: string, metadata: unknown) => logged.push({ message, metadata }),
    info: (message: string, metadata: unknown) => logged.push({ message, metadata }),
    warn: (message: string, metadata: unknown) => logged.push({ message, metadata }),
  } as unknown as WorkerLogger

  return {
    claims,
    finishes,
    logged,
    run: (routines) =>
      runJobCycle({
        dependencies: { executions, logger, now: () => NOW, routines },
        envelope: ENVELOPE,
      }),
  }
}

function createRoutine(result: {
  readonly counters: Record<string, number>
  readonly outcome: string
}) {
  const contexts: JobRoutineContext[] = []
  return {
    contexts,
    routine: {
      run: async (context: JobRoutineContext) => {
        contexts.push(context)
        return result as never
      },
    },
  }
}

describe('job run cycle', () => {
  test('reivindica a execução, roda a rotina e fecha a linha com o que ela devolveu', async () => {
    const fixture = createFixture()
    const { contexts, routine } = createRoutine({
      counters: { statesWritten: 27 },
      outcome: 'succeeded',
    })

    const result = await fixture.run({ 'fuel.price.pull': routine })

    expect(result).toEqual({ claimed: true, outcome: 'succeeded' })
    expect(contexts).toEqual([
      {
        correlationId: ENVELOPE.correlationId,
        executionId: EXECUTION_ID,
        job: 'fuel.price.pull',
        origin: 'schedule',
      },
    ])
    expect(fixture.finishes).toEqual([
      {
        counters: { statesWritten: 27 },
        executionId: EXECUTION_ID,
        finishedAt: NOW,
        outcome: 'succeeded',
      },
    ])
  })

  test('o lease sai da batida, não do relógio do processo', async () => {
    const fixture = createFixture()
    const { routine } = createRoutine({ counters: {}, outcome: 'succeeded' })

    await fixture.run({ 'fuel.price.pull': routine })

    expect(fixture.claims).toEqual([
      {
        executionId: EXECUTION_ID,
        leaseExpiresAt: new Date(NOW.getTime() + JOB_RUN_LEASE_SECONDS * 1000),
        now: NOW,
      },
    ])
  })

  test('linha já fechada ou com lease vivo não roda de novo — a reentrega é engolida', async () => {
    const fixture = createFixture({ claimable: false })
    const { contexts, routine } = createRoutine({ counters: {}, outcome: 'succeeded' })

    const result = await fixture.run({ 'fuel.price.pull': routine })

    expect(result).toEqual({ claimed: false, outcome: undefined })
    expect(contexts).toEqual([])
    expect(fixture.finishes).toEqual([])
  })

  test('rotina sem implementação registrada fecha a linha em vez de deixá-la aberta', async () => {
    const fixture = createFixture()

    const result = await fixture.run({})

    expect(result).toEqual({ claimed: true, outcome: 'unexpected_error' })
    expect(fixture.finishes[0]?.outcome).toBe('unexpected_error')
    expect(fixture.finishes[0]?.counters).toEqual({})
    expect(fixture.logged.some((entry) => entry.message === 'job_run_routine_missing')).toBe(true)
  })

  test('rotina que estoura fecha a linha em unexpected_error e não derruba a mensagem', async () => {
    const fixture = createFixture()
    const routine = {
      run: async () => {
        throw new Error('anp fora do ar')
      },
    }

    const result = await fixture.run({ 'fuel.price.pull': routine as never })

    expect(result).toEqual({ claimed: true, outcome: 'unexpected_error' })
    expect(fixture.finishes[0]?.outcome).toBe('unexpected_error')
    expect(fixture.logged.some((entry) => entry.message === 'job_run_routine_failed')).toBe(true)
  })

  test('o código de falha da própria rotina é preservado', async () => {
    const fixture = createFixture()
    const { routine } = createRoutine({ counters: { attempts: 1 }, outcome: 'anp_unreachable' })

    const result = await fixture.run({ 'fuel.price.pull': routine })

    expect(result.outcome).toBe('anp_unreachable')
    expect(fixture.finishes[0]?.outcome).toBe('anp_unreachable')
  })

  test('código fora do vocabulário da rotina vira unexpected_error, e os contadores ficam', async () => {
    const fixture = createFixture()
    const { routine } = createRoutine({
      counters: { statesWritten: 3 },
      outcome: 'provider_unreachable',
    })

    const result = await fixture.run({ 'fuel.price.pull': routine })

    expect(result.outcome).toBe('unexpected_error')
    expect(fixture.finishes[0]?.counters).toEqual({ statesWritten: 3 })
    expect(fixture.logged.some((entry) => entry.message === 'job_run_outcome_unknown')).toBe(true)
  })

  test('quem escolhe a rotina é a linha do banco, não o envelope', async () => {
    const fixture = createFixture({ claimed: { job: 'nfse.status.pull', origin: 'manual' } })
    const fuel = createRoutine({ counters: {}, outcome: 'succeeded' })
    const nfse = createRoutine({ counters: { invoicesSettled: 2 }, outcome: 'succeeded' })

    await fixture.run({
      'fuel.price.pull': fuel.routine,
      'nfse.status.pull': nfse.routine,
    })

    expect(fuel.contexts).toEqual([])
    expect(nfse.contexts[0]?.job).toBe('nfse.status.pull')
    expect(nfse.contexts[0]?.origin).toBe('manual')
  })
})
