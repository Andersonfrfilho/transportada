/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do que o cron declarava antes da spec 052 — as apps não importam código umas das
 * outras. Estes valores são gravados em `nfe_imports` e em `processing_outbox`, e o consumidor de
 * distribuição os lê de volta: mudar um deles é migração de dado, não renomeação.
 */

export const DISTRIBUTION_PULL_JOB = 'nfe.distribution.pull' as const

export const DISTRIBUTION_AUTOMATION_TRIGGER = 'automation' as const

export const DISTRIBUTION_IMPORT_SOURCE = 'distribution' as const

export const DISTRIBUTION_IMPORT_INITIAL_STATUS = 'queued' as const

export const DISTRIBUTION_AGGREGATE_TYPE = 'nfe_import' as const

export const DISTRIBUTION_REQUESTED_EVENT_TYPE = 'transportada.nfe.distribution.requested' as const

export const DISTRIBUTION_EVENT_VERSION = 1n
