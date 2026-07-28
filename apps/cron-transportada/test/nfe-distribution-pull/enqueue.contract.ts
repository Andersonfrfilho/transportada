/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../src/nfe-distribution-pull/domain/system-distribution-actor.constant.js'
import { deriveDistributionIdempotencyKey } from '../../src/nfe-distribution-pull/domain/distribution-idempotency.policy.js'
import type {
  DistributionEnqueueGatewayPort,
  DistributionEnqueuePlan,
} from '../../src/nfe-distribution-pull/application/enqueue-distribution.port.js'
import { createEnqueueDistributionUseCase } from '../../src/nfe-distribution-pull/application/enqueue-distribution.use-case.js'
import type { EligibleCompany } from '../../src/nfe-distribution-pull/application/select-eligible-companies.use-case.js'

const NOW = new Date('2026-07-26T12:03:45.000Z')
const CADENCE_MINUTES = 60
const CORRELATION_ID = 'cron-trace-0001'
const COMPANY: EligibleCompany = {
  companyId: '00000000-0000-4000-8000-0000000000a1',
  environment: 'homologation',
}

function createIdentifiers(): { nextImportId(): string; nextEventId(): string } {
  let importSequence = 0
  let eventSequence = 0
  return {
    nextEventId: () => {
      eventSequence += 1
      return `00000000-0000-4000-8000-0000000000e${eventSequence}`
    },
    nextImportId: () => {
      importSequence += 1
      return `00000000-0000-4000-8000-0000000000d${importSequence}`
    },
  }
}

function createRecordingGateway(): DistributionEnqueueGatewayPort & {
  readonly plans: DistributionEnqueuePlan[]
} {
  const plans: DistributionEnqueuePlan[] = []
  const seen = new Set<string>()
  return {
    persist: (plan: DistributionEnqueuePlan) => {
      const key = `${plan.import.companyId}:${plan.import.idempotencyKey}`
      if (seen.has(key)) return Promise.resolve({ enqueued: false })
      seen.add(key)
      plans.push(plan)
      return Promise.resolve({ enqueued: true })
    },
    plans,
  }
}

describe('scheduled distribution enqueue', () => {
  test('writes an automation import and outbox event in one plan', async () => {
    const gateway = createRecordingGateway()
    const useCase = createEnqueueDistributionUseCase({
      gateway,
      identifiers: createIdentifiers(),
    })

    const result = await useCase.execute({
      cadenceMinutes: CADENCE_MINUTES,
      company: COMPANY,
      correlationId: CORRELATION_ID,
      now: NOW,
    })

    expect(result.enqueued).toBe(true)
    expect(gateway.plans).toHaveLength(1)
    const [plan] = gateway.plans
    expect(plan?.import).toMatchObject({
      automationJob: 'nfe.distribution.pull',
      companyId: COMPANY.companyId,
      correlationId: CORRELATION_ID,
      requestedByUserId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
      source: 'distribution',
      status: 'queued',
      triggeredBy: 'automation',
    })
    expect(plan?.outbox).toMatchObject({
      actorUserId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
      aggregateType: 'nfe_import',
      automationJob: 'nfe.distribution.pull',
      correlationId: CORRELATION_ID,
      eventType: 'transportada.nfe.distribution.requested',
      triggeredBy: 'automation',
    })
  })

  test('links the outbox aggregate and payload to the created import id', async () => {
    const gateway = createRecordingGateway()
    const useCase = createEnqueueDistributionUseCase({
      gateway,
      identifiers: createIdentifiers(),
    })

    const result = await useCase.execute({
      cadenceMinutes: CADENCE_MINUTES,
      company: COMPANY,
      correlationId: CORRELATION_ID,
      now: NOW,
    })

    const [plan] = gateway.plans
    expect(plan?.import.id).toBe(result.importId)
    expect(plan?.outbox.aggregateId).toBe(result.importId)
    expect(plan?.outbox.payload.importId).toBe(result.importId)
    expect(plan?.outbox.eventVersion).toBe(1n)
    expect(plan?.import.receivedCount).toBe(0n)
  })

  test('carries the fiscal environment into the derived idempotency key', async () => {
    const gateway = createRecordingGateway()
    const useCase = createEnqueueDistributionUseCase({
      gateway,
      identifiers: createIdentifiers(),
    })

    const result = await useCase.execute({
      cadenceMinutes: CADENCE_MINUTES,
      company: COMPANY,
      correlationId: CORRELATION_ID,
      now: NOW,
    })

    expect(result.idempotencyKey).toBe(
      deriveDistributionIdempotencyKey({
        cadenceMinutes: CADENCE_MINUTES,
        companyId: COMPANY.companyId,
        cycleInstant: NOW,
        environment: COMPANY.environment,
      }),
    )
    expect(gateway.plans[0]?.import.idempotencyKey).toBe(result.idempotencyKey)
  })

  test('blocks a duplicate enqueue in the same cadence bucket', async () => {
    const gateway = createRecordingGateway()
    const useCase = createEnqueueDistributionUseCase({
      gateway,
      identifiers: createIdentifiers(),
    })

    const first = await useCase.execute({
      cadenceMinutes: CADENCE_MINUTES,
      company: COMPANY,
      correlationId: CORRELATION_ID,
      now: NOW,
    })
    const laterSameBucket = await useCase.execute({
      cadenceMinutes: CADENCE_MINUTES,
      company: COMPANY,
      correlationId: CORRELATION_ID,
      now: new Date(NOW.getTime() + 5 * 60_000),
    })

    expect(first.enqueued).toBe(true)
    expect(laterSameBucket.enqueued).toBe(false)
    expect(first.idempotencyKey).toBe(laterSameBucket.idempotencyKey)
    expect(gateway.plans).toHaveLength(1)
  })

  test('derives a fresh idempotency key once the cadence bucket rolls over', () => {
    const bucketOne = deriveDistributionIdempotencyKey({
      cadenceMinutes: CADENCE_MINUTES,
      companyId: COMPANY.companyId,
      cycleInstant: NOW,
      environment: COMPANY.environment,
    })
    const nextBucket = deriveDistributionIdempotencyKey({
      cadenceMinutes: CADENCE_MINUTES,
      companyId: COMPANY.companyId,
      cycleInstant: new Date(NOW.getTime() + 60 * 60_000),
      environment: COMPANY.environment,
    })
    expect(bucketOne).not.toBe(nextBucket)
  })
})
