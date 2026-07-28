/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Shared literals for the scheduled distribution pull enqueue. Values mirror the
 * API request-nfe-import flow so the existing outbox relay and distribution
 * consumer process automation rows unchanged.
 */
export const DISTRIBUTION_PULL_JOB = 'nfe.distribution.pull' as const
export const DISTRIBUTION_AUTOMATION_TRIGGER = 'automation' as const
export const DISTRIBUTION_IMPORT_SOURCE = 'distribution' as const
export const DISTRIBUTION_IMPORT_INITIAL_STATUS = 'queued' as const
export const DISTRIBUTION_AGGREGATE_TYPE = 'nfe_import' as const
export const DISTRIBUTION_REQUESTED_EVENT_TYPE = 'transportada.nfe.distribution.requested' as const
export const DISTRIBUTION_EVENT_VERSION = 1n
