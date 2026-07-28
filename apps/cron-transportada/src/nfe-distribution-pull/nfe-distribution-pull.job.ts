/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Composition of the scheduled NF-e distribution pull: wires the Drizzle
 * adapters into the pure cycle orchestrator. One instance holds the advisory
 * lock, selects eligible companies and enqueues an automation import each.
 */
import type { CronEnvironment, CronLogger } from '../config/cron.types.js'
import type { CronDatabase } from '../database/cron-database.types.js'
import { createEnqueueDistributionUseCase } from './application/enqueue-distribution.use-case.js'
import { runDistributionPullCycle } from './application/run-cycle.js'
import type { DistributionPullCycleResult } from './application/run-cycle.js'
import { createSelectEligibleCompaniesUseCase } from './application/select-eligible-companies.use-case.js'
import { createCryptoIdentifiers } from './infrastructure/crypto-identifiers.js'
import { createDrizzleAdvisoryLock } from './infrastructure/drizzle-advisory-lock.js'
import { createDrizzleDistributionCandidateSource } from './infrastructure/drizzle-distribution-candidate.source.js'
import { createDrizzleDistributionEnqueueGateway } from './infrastructure/drizzle-distribution-enqueue.gateway.js'

export type DistributionPullJobDependencies = {
  readonly config: CronEnvironment
  readonly correlationId: string
  readonly db: CronDatabase
  readonly logger: CronLogger
  readonly now: Date
}

export function runNfeDistributionPullJob(
  dependencies: DistributionPullJobDependencies,
): Promise<DistributionPullCycleResult> {
  const selectEligibleUseCase = createSelectEligibleCompaniesUseCase({
    source: createDrizzleDistributionCandidateSource({
      db: dependencies.db,
      logger: dependencies.logger,
    }),
  })
  const enqueueUseCase = createEnqueueDistributionUseCase({
    gateway: createDrizzleDistributionEnqueueGateway({ db: dependencies.db }),
    identifiers: createCryptoIdentifiers(),
  })

  return runDistributionPullCycle({
    cadenceMinutes: dependencies.config.cadenceMinutes,
    correlationId: dependencies.correlationId,
    enqueueUseCase,
    environment: dependencies.config.fiscalEnvironment,
    jobId: dependencies.config.cronJob,
    lock: createDrizzleAdvisoryLock({ db: dependencies.db }),
    logger: dependencies.logger,
    now: dependencies.now,
    selectEligibleUseCase,
  })
}
