/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { NFSE_STATUS_PULL_JOB } from '../nfse-status-pull/domain/nfse-status-pull.constant.js'
import { NOTIFICATION_SCHEDULES_JOB } from '../notification-schedules/domain/notification-schedules.constant.js'

export const CRON_PROJECT_NAME = 'cron-transportada'
export const CRON_VERSION = '0.1.0'

export const CRON_JOBS = [
  'nfe.distribution.pull',
  NFSE_STATUS_PULL_JOB,
  NOTIFICATION_SCHEDULES_JOB,
] as const
export type CronJob = (typeof CRON_JOBS)[number]

export const CRON_FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export type CronFiscalEnvironment = (typeof CRON_FISCAL_ENVIRONMENTS)[number]

export const CRON_DEFAULT_PAGE_SIZE = 50
export const CRON_MAX_PAGE_SIZE = 50

// Must mirror the K8s CronJob schedule; it buckets the idempotency key so two
// cycles in the same window collapse to one enqueue per company.
export const CRON_DEFAULT_CADENCE_MINUTES = 60
export const CRON_MAX_CADENCE_MINUTES = 1440

// Espelha o teto do trilho de emissão: a prefeitura que não responde nesse tempo é falha de
// transporte, e a nota volta na próxima janela em vez de segurar o ciclo.
export const CRON_DEFAULT_PROVIDER_TIMEOUT_MILLISECONDS = 15_000
export const CRON_MAX_PROVIDER_TIMEOUT_MILLISECONDS = 60_000

// Mesmo teto do arquivamento de XML no worker: documento municipal acima disso é resposta torta
// da prefeitura, não nota fiscal.
export const CRON_MAX_FISCAL_DOCUMENT_BYTES = 25 * 1024 * 1024
