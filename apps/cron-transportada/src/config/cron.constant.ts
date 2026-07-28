/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const CRON_PROJECT_NAME = 'cron-transportada'
export const CRON_VERSION = '0.1.0'

export const CRON_JOBS = ['nfe.distribution.pull'] as const
export type CronJob = (typeof CRON_JOBS)[number]

export const CRON_FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export type CronFiscalEnvironment = (typeof CRON_FISCAL_ENVIRONMENTS)[number]

export const CRON_DEFAULT_PAGE_SIZE = 50
export const CRON_MAX_PAGE_SIZE = 50

// Must mirror the K8s CronJob schedule; it buckets the idempotency key so two
// cycles in the same window collapse to one enqueue per company.
export const CRON_DEFAULT_CADENCE_MINUTES = 60
export const CRON_MAX_CADENCE_MINUTES = 1440
