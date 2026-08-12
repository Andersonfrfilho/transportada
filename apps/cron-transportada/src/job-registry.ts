/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Mapeia o `CRON_JOB` configurado para o seu runner. O registro vive na raiz porque já não pertence
 * a um trilho só: a composição fica fechada a job novo sem tocar no `main.ts`.
 */
import type { CronJob } from './config/cron.constant.js'
import type { CronCycleResult, CronJobDependencies } from './config/cron.types.js'
import { DISTRIBUTION_PULL_JOB } from './nfe-distribution-pull/domain/distribution-pull.constant.js'
import { runNfeDistributionPullJob } from './nfe-distribution-pull/nfe-distribution-pull.job.js'
import { NFSE_STATUS_PULL_JOB } from './nfse-status-pull/domain/nfse-status-pull.constant.js'
import { runNfseStatusPullJob } from './nfse-status-pull/nfse-status-pull.job.js'

export type CronJobRunner = (dependencies: CronJobDependencies) => Promise<CronCycleResult>

const JOB_REGISTRY: Readonly<Record<CronJob, CronJobRunner>> = {
  [DISTRIBUTION_PULL_JOB]: runNfeDistributionPullJob,
  [NFSE_STATUS_PULL_JOB]: runNfseStatusPullJob,
}

export function resolveCronJob(cronJob: CronJob): CronJobRunner {
  return JOB_REGISTRY[cronJob]
}
