/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A rotina que devolve a busca automática de NF-e ao relógio. O que se guarda aqui é o **ciclo**: o
 * que ele grava, o que ele conta, com que código ele fecha a linha e o que ele deixa de fazer quando
 * pedem para parar. Quem fala com a SEFAZ é o consumidor de `nfe-distribution.v1` — a rotina só
 * enfileira, e é por isso que a espera anti-`cStat 656` continua sendo a da elegibilidade.
 */
import { describe, expect, test } from 'bun:test'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { runJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type {
  ClaimedJobExecution,
  FinishJobExecutionParams,
  JobExecutionPort,
} from '../../src/job-run/application/job-execution.port.js'
import type { JobRunEnvelopeV1 } from '../../src/messaging/job-run-envelope.schema.js'
import type {
  DistributionEnqueueGatewayPort,
  DistributionEnqueuePlan,
} from '../../src/nfe-distribution-pull/application/enqueue-distribution.port.js'
import { createNfeDistributionPullRoutine } from '../../src/nfe-distribution-pull/application/nfe-distribution-pull.routine.js'
import type { DistributionCandidate } from '../../src/nfe-distribution-pull/application/select-eligible-companies.port.js'
import { DISTRIBUTION_PULL_JOB } from '../../src/nfe-distribution-pull/domain/distribution-pull.constant.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../src/nfe-distribution-pull/domain/system-distribution-actor.constant.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

import { createLoggerDouble, createManualScheduler, type LoggedMessage } from './job-run.double.js'

const NOW = new Date('2026-08-24T09:00:00.000Z')
const EXECUTION_ID = '7d8e9f0a-1b2c-4d3e-8f5a-6b7c8d9e0f1a'
const CORRELATION_ID = 'tick-2026-08-24T09:00:00.000Z'
const FIRST_COMPANY_ID = '4c3e6d1a-8b2f-4d5e-9a7c-1b2c3d4e5f60'
const SECOND_COMPANY_ID = '5d4f7e2b-9c3a-4e6f-8b8d-2c3d4e5f6071'

const ELIGIBLE: DistributionCandidate = {
  certificate: {
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
  },
  companyId: FIRST_COMPANY_ID,
  companyStatus: 'active',
  environment: 'production',
  hasSyntheticMembership: true,
  nextAllowedAt: undefined,
  scheduledDistributionEnabled: true,
}

type RoutineFixture = {
  readonly logged: LoggedMessage[]
  readonly plans: DistributionEnqueuePlan[]
  readonly run: () => Promise<{
    readonly counters: Readonly<Record<string, number>>
    readonly outcome: string
  }>
}

type FixtureParams = {
  readonly candidates?: readonly DistributionCandidate[]
  readonly enqueued?: boolean
  readonly persist?: (plan: DistributionEnqueuePlan) => Promise<{ readonly enqueued: boolean }>
  readonly stopAfter?: number
}

function createFixture({
  candidates = [ELIGIBLE],
  enqueued = true,
  persist,
  stopAfter,
}: FixtureParams = {}): RoutineFixture {
  const logged: LoggedMessage[] = []
  const plans: DistributionEnqueuePlan[] = []
  let eventIndex = 0
  let importIndex = 0

  const gateway: DistributionEnqueueGatewayPort = {
    persist: async (plan) => {
      plans.push(plan)
      return persist === undefined ? { enqueued } : persist(plan)
    },
  }

  const routine = createNfeDistributionPullRoutine({
    gateway,
    identifiers: {
      nextEventId: () => `event-${(eventIndex += 1)}`,
      nextImportId: () => `import-${(importIndex += 1)}`,
    },
    logger: createLoggerDouble(logged),
    now: () => NOW,
    source: { listCandidates: async () => candidates },
  })

  const context: JobRoutineContext = {
    correlationId: CORRELATION_ID,
    executionId: EXECUTION_ID,
    isStopRequested: () => stopAfter !== undefined && plans.length >= stopAfter,
    job: DISTRIBUTION_PULL_JOB,
    origin: 'schedule',
  }

  return { logged, plans, run: () => routine.run(context) }
}

function planAt(plans: readonly DistributionEnqueuePlan[], index: number): DistributionEnqueuePlan {
  const plan = plans[index]
  if (plan === undefined) throw new Error(`NO_PLAN_AT_INDEX_${index}`)
  return plan
}

function withCompany(
  candidate: DistributionCandidate,
  companyId: string,
): DistributionCandidate {
  return { ...candidate, companyId }
}

describe('nfe distribution pull routine', () => {
  test('grava a importação e o evento do outbox de cada empresa elegível', async () => {
    const fixture = createFixture()

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({ eligible: 1, enqueued: 1, failed: 0, skipped: 0 })
    expect(fixture.plans).toHaveLength(1)

    const plan = planAt(fixture.plans, 0)
    expect(plan.import).toMatchObject({
      automationJob: DISTRIBUTION_PULL_JOB,
      companyId: FIRST_COMPANY_ID,
      correlationId: CORRELATION_ID,
      receivedCount: 0n,
      requestedByUserId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
      source: 'distribution',
      status: 'queued',
      triggeredBy: 'automation',
    })
    // A digital do pedido é a própria chave: a automação não tem arquivo para resumir.
    expect(plan.import.requestFingerprint).toBe(plan.import.idempotencyKey)
  })

  test('o evento leva referência, nunca dado de nota', async () => {
    const fixture = createFixture()

    await fixture.run()

    const plan = planAt(fixture.plans, 0)
    expect(plan.outbox).toMatchObject({
      actorUserId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
      aggregateType: 'nfe_import',
      automationJob: DISTRIBUTION_PULL_JOB,
      companyId: FIRST_COMPANY_ID,
      eventType: 'transportada.nfe.distribution.requested',
      eventVersion: 1n,
      triggeredBy: 'automation',
    })
    expect(plan.outbox.aggregateId).toBe(plan.import.id)
    expect(plan.outbox.payload).toEqual({ importId: plan.import.id })
  })

  test('a mesma janela repetida é pulo idempotente, não falha do ciclo', async () => {
    const fixture = createFixture({ enqueued: false })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({ eligible: 1, enqueued: 0, failed: 0, skipped: 1 })
  })

  test('ciclo inteiro em espera fecha a linha em `cooldown_active`', async () => {
    const fixture = createFixture({
      candidates: [{ ...ELIGIBLE, nextAllowedAt: new Date('2026-08-24T09:30:00.000Z') }],
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('cooldown_active')
    expect(result.counters).toEqual({
      cooldown_active: 1,
      eligible: 0,
      enqueued: 0,
      failed: 0,
      skipped: 0,
    })
    expect(fixture.plans).toHaveLength(0)
  })

  test('a razão que o operador resolve vence a espera na hora de fechar a linha', async () => {
    const fixture = createFixture({
      candidates: [
        {
          ...ELIGIBLE,
          certificate: undefined,
        },
        {
          ...withCompany(ELIGIBLE, SECOND_COMPANY_ID),
          nextAllowedAt: new Date('2026-08-24T09:30:00.000Z'),
        },
      ],
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('certificate_missing')
    expect(result.counters).toEqual({
      certificate_missing: 1,
      cooldown_active: 1,
      eligible: 0,
      enqueued: 0,
      failed: 0,
      skipped: 0,
    })
  })

  test('trabalho feito é `succeeded` mesmo com empresa de fora, e o contador diz quantas', async () => {
    const fixture = createFixture({
      candidates: [
        ELIGIBLE,
        { ...withCompany(ELIGIBLE, SECOND_COMPANY_ID), scheduledDistributionEnabled: false },
      ],
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({
      eligible: 1,
      enqueued: 1,
      failed: 0,
      not_opted_in: 1,
      skipped: 0,
    })
  })

  test('falha de gravação fecha em `unexpected_error` e não vaza nada da empresa', async () => {
    const fixture = createFixture({
      persist: async () => {
        throw new TypeError('connection terminated')
      },
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('unexpected_error')
    expect(result.counters).toMatchObject({ enqueued: 0, failed: 1 })

    const failure = fixture.logged.find(
      (entry) => entry.message === 'nfe_distribution_pull_company_enqueue_failed',
    )
    expect(failure?.metadata).toEqual({
      companyId: FIRST_COMPANY_ID,
      correlationId: CORRELATION_ID,
      reason: 'TypeError',
    })
  })

  test('uma empresa que falha não impede as outras, e o ciclo continua falho', async () => {
    const fixture = createFixture({
      candidates: [ELIGIBLE, withCompany(ELIGIBLE, SECOND_COMPANY_ID)],
      persist: async (plan) => {
        if (plan.import.companyId === FIRST_COMPANY_ID) throw new Error('boom')
        return { enqueued: true }
      },
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('unexpected_error')
    expect(result.counters).toMatchObject({ eligible: 2, enqueued: 1, failed: 1 })
  })

  test('parada pedida entre duas empresas guarda o que a primeira gravou', async () => {
    const fixture = createFixture({
      candidates: [ELIGIBLE, withCompany(ELIGIBLE, SECOND_COMPANY_ID)],
      stopAfter: 1,
    })

    const result = await fixture.run()

    // `succeeded` de propósito: quem traduz parada em `cancelled` é o invólucro, e só de cima disto.
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ eligible: 2, enqueued: 1, skipped: 0 })
    expect(fixture.plans).toHaveLength(1)
    expect(planAt(fixture.plans, 0).import.companyId).toBe(FIRST_COMPANY_ID)
  })

  test('parada pedida antes da primeira empresa não grava nada', async () => {
    const fixture = createFixture({ candidates: [ELIGIBLE], stopAfter: 0 })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(fixture.plans).toHaveLength(0)
  })

  test('empresa sem cadência própria: a chave carrega o ambiente do perfil dela', async () => {
    const fixture = createFixture({
      candidates: [
        ELIGIBLE,
        { ...withCompany(ELIGIBLE, SECOND_COMPANY_ID), environment: 'homologation' },
      ],
    })

    await fixture.run()

    expect(planAt(fixture.plans, 0).import.idempotencyKey).toContain(':production:')
    expect(planAt(fixture.plans, 1).import.idempotencyKey).toContain(':homologation:')
  })
})

describe('nfe distribution pull registration', () => {
  test('a rotina registrada fecha a linha com o código dela, não com `job_run_routine_missing`', async () => {
    const finishes: FinishJobExecutionParams[] = []
    const logged: LoggedMessage[] = []
    const claimed: ClaimedJobExecution = { job: DISTRIBUTION_PULL_JOB, origin: 'schedule' }

    const executions: JobExecutionPort = {
      claim: async () => claimed,
      finish: async (params) => {
        finishes.push(params)
      },
      renew: async () => ({ cancelRequestedAt: undefined }),
    }

    const envelope: JobRunEnvelopeV1 = {
      correlationId: CORRELATION_ID,
      eventId: '0f7c4a3e-9b1d-4e2f-8a5c-6d7e8f9a0b1c',
      occurredAt: '2026-08-24T09:00:00.000Z',
      payload: { executionId: EXECUTION_ID, job: DISTRIBUTION_PULL_JOB, origin: 'schedule' },
      type: 'transportada.job.run.requested',
      version: 1,
    }

    const logger: WorkerLogger = createLoggerDouble(logged)

    const result = await runJobCycle({
      dependencies: {
        executions,
        logger,
        now: () => NOW,
        routines: {
          [DISTRIBUTION_PULL_JOB]: createNfeDistributionPullRoutine({
            gateway: { persist: async () => ({ enqueued: true }) },
            identifiers: { nextEventId: () => 'event-1', nextImportId: () => 'import-1' },
            logger,
            now: () => NOW,
            source: { listCandidates: async () => [ELIGIBLE] },
          }),
        },
        scheduleInterval: createManualScheduler().scheduler,
      },
      envelope,
    })

    expect(result).toEqual({ claimed: true, outcome: 'succeeded' })
    expect(finishes).toEqual([
      {
        counters: { eligible: 1, enqueued: 1, failed: 0, skipped: 0 },
        executionId: EXECUTION_ID,
        finishedAt: NOW,
        outcome: 'succeeded',
      },
    ])
    expect(logged.map((entry) => entry.message)).not.toContain('job_run_routine_missing')
  })
})
