/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CronLogger } from '../../src/config/cron.types.js'
import type {
  DistributionCandidate,
  DistributionCandidateSourcePort,
} from '../../src/nfe-distribution-pull/application/select-eligible-companies.port.js'
import { createSelectEligibleCompaniesUseCase } from '../../src/nfe-distribution-pull/application/select-eligible-companies.use-case.js'
import type {
  DistributionEnqueueGatewayPort,
  DistributionEnqueuePlan,
} from '../../src/nfe-distribution-pull/application/enqueue-distribution.port.js'
import { createEnqueueDistributionUseCase } from '../../src/nfe-distribution-pull/application/enqueue-distribution.use-case.js'
import type { AdvisoryLockPort } from '../../src/nfe-distribution-pull/application/advisory-lock.port.js'
import { runDistributionPullCycle } from '../../src/nfe-distribution-pull/application/run-cycle.js'

const NOW = new Date('2026-07-26T12:00:00.000Z')
const JOB_ID = 'nfe.distribution.pull'

function eligibleCandidate(companyId: string): DistributionCandidate {
  return {
    certificate: {
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      status: 'active',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    },
    companyId,
    companyStatus: 'active',
    hasSyntheticMembership: true,
    nextAllowedAt: undefined,
    scheduledDistributionEnabled: true,
  }
}

function createSource(
  candidates: readonly DistributionCandidate[],
): DistributionCandidateSourcePort {
  return { listCandidates: () => Promise.resolve(candidates) }
}

function createIdentifiers(): { nextImportId(): string; nextEventId(): string } {
  let sequence = 0
  return {
    nextEventId: () => {
      sequence += 1
      return `00000000-0000-4000-8000-00000000e${sequence}0`
    },
    nextImportId: () => {
      sequence += 1
      return `00000000-0000-4000-8000-00000000d${sequence}0`
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

function createSharedLock(): AdvisoryLockPort & { readonly acquiredKeys: string[] } {
  const acquiredKeys: string[] = []
  let held = false
  return {
    acquiredKeys,
    release: () => {
      held = false
      return Promise.resolve()
    },
    tryAcquire: ({ lockKey }: { readonly lockKey: string }) => {
      if (held) return Promise.resolve(false)
      held = true
      acquiredKeys.push(lockKey)
      return Promise.resolve(true)
    },
  }
}

const SILENT_LOGGER: CronLogger = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

function buildCycleDependencies(input: {
  readonly candidates: readonly DistributionCandidate[]
  readonly gateway: DistributionEnqueueGatewayPort
  readonly lock: AdvisoryLockPort
}) {
  return {
    cadenceMinutes: 60,
    correlationId: 'cron-trace-cycle',
    enqueueUseCase: createEnqueueDistributionUseCase({
      gateway: input.gateway,
      identifiers: createIdentifiers(),
    }),
    environment: 'homologation' as const,
    jobId: JOB_ID,
    lock: input.lock,
    logger: SILENT_LOGGER,
    now: NOW,
    selectEligibleUseCase: createSelectEligibleCompaniesUseCase({
      logger: SILENT_LOGGER,
      source: createSource(input.candidates),
    }),
  }
}

describe('scheduled distribution cycle concurrency', () => {
  test('only one of two concurrent cycles acquires the advisory lock', async () => {
    const gateway = createRecordingGateway()
    const lock = createSharedLock()
    const candidates = [eligibleCandidate('00000000-0000-4000-8000-0000000000a1')]

    const [first, second] = await Promise.all([
      runDistributionPullCycle(buildCycleDependencies({ candidates, gateway, lock })),
      runDistributionPullCycle(buildCycleDependencies({ candidates, gateway, lock })),
    ])

    const acquired = [first, second].filter((cycle) => cycle.acquiredLock)
    const rejected = [first, second].filter((cycle) => !cycle.acquiredLock)
    expect(acquired).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.enqueuedCount).toBe(0)
    expect(rejected[0]?.eligibleCount).toBe(0)
    expect(gateway.plans).toHaveLength(1)
    expect(lock.acquiredKeys).toEqual([`cron:${JOB_ID}`])
  })

  test('releases the lock so a later cycle can acquire it', async () => {
    const gateway = createRecordingGateway()
    const lock = createSharedLock()
    const candidates = [eligibleCandidate('00000000-0000-4000-8000-0000000000a1')]

    const first = await runDistributionPullCycle(
      buildCycleDependencies({ candidates, gateway, lock }),
    )
    const second = await runDistributionPullCycle(
      buildCycleDependencies({ candidates, gateway, lock }),
    )

    expect(first.acquiredLock).toBe(true)
    expect(second.acquiredLock).toBe(true)
    expect(first.enqueuedCount).toBe(1)
    // Same cadence bucket → the second cycle is a no-op duplicate, not a new row.
    expect(second.enqueuedCount).toBe(0)
    expect(second.skippedCount).toBe(1)
  })

  test('counts enqueued companies and isolates a per-company failure', async () => {
    const lock = createSharedLock()
    const candidates = [
      eligibleCandidate('00000000-0000-4000-8000-0000000000a1'),
      eligibleCandidate('00000000-0000-4000-8000-0000000000a2'),
    ]
    const failingGateway: DistributionEnqueueGatewayPort = {
      persist: (plan: DistributionEnqueuePlan) => {
        if (plan.import.companyId.endsWith('a2')) {
          return Promise.reject(new Error('persist failed'))
        }
        return Promise.resolve({ enqueued: true })
      },
    }

    const result = await runDistributionPullCycle(
      buildCycleDependencies({ candidates, gateway: failingGateway, lock }),
    )

    expect(result.acquiredLock).toBe(true)
    expect(result.eligibleCount).toBe(2)
    expect(result.enqueuedCount).toBe(1)
    expect(result.failedCount).toBe(1)
  })
})
