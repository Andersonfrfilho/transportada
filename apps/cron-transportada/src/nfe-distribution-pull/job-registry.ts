/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Maps the configured CRON_JOB to its runner. A single registry keeps the
 * composition root closed to new jobs without touching main.ts.
 */
import type { CronJob } from '../config/cron.constant.js'
import type { DistributionPullCycleResult } from './application/run-cycle.js'
import { DISTRIBUTION_PULL_JOB } from './domain/distribution-pull.constant.js'
import {
  runNfeDistributionPullJob,
  type DistributionPullJobDependencies,
} from './nfe-distribution-pull.job.js'

export type CronJobRunner = (
  dependencies: DistributionPullJobDependencies,
) => Promise<DistributionPullCycleResult>

const JOB_REGISTRY: Readonly<Record<CronJob, CronJobRunner>> = {
  [DISTRIBUTION_PULL_JOB]: runNfeDistributionPullJob,
}

export function resolveCronJob(cronJob: CronJob): CronJobRunner {
  return JOB_REGISTRY[cronJob]
}
