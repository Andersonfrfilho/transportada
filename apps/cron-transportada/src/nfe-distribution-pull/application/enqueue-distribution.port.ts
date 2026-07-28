/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DISTRIBUTION_AGGREGATE_TYPE,
  DISTRIBUTION_AUTOMATION_TRIGGER,
  DISTRIBUTION_IMPORT_INITIAL_STATUS,
  DISTRIBUTION_IMPORT_SOURCE,
  DISTRIBUTION_PULL_JOB,
  DISTRIBUTION_REQUESTED_EVENT_TYPE,
} from '../domain/distribution-pull.constant.js'

export type DistributionImportRow = {
  readonly id: string
  readonly companyId: string
  readonly source: typeof DISTRIBUTION_IMPORT_SOURCE
  readonly triggeredBy: typeof DISTRIBUTION_AUTOMATION_TRIGGER
  readonly automationJob: typeof DISTRIBUTION_PULL_JOB
  readonly requestedByUserId: string
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly requestFingerprint: string
  readonly status: typeof DISTRIBUTION_IMPORT_INITIAL_STATUS
  readonly receivedCount: bigint
}

export type DistributionOutboxRow = {
  readonly eventId: string
  readonly companyId: string
  readonly aggregateId: string
  readonly aggregateType: typeof DISTRIBUTION_AGGREGATE_TYPE
  readonly eventType: typeof DISTRIBUTION_REQUESTED_EVENT_TYPE
  readonly eventVersion: bigint
  readonly actorUserId: string
  readonly triggeredBy: typeof DISTRIBUTION_AUTOMATION_TRIGGER
  readonly automationJob: typeof DISTRIBUTION_PULL_JOB
  readonly correlationId: string
  readonly payload: { readonly importId: string }
}

export type DistributionEnqueuePlan = {
  readonly import: DistributionImportRow
  readonly outbox: DistributionOutboxRow
}

export type DistributionEnqueueGatewayPort = {
  persist(plan: DistributionEnqueuePlan): Promise<{ readonly enqueued: boolean }>
}
