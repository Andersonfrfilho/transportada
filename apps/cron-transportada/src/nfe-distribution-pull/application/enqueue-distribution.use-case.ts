/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DISTRIBUTION_AGGREGATE_TYPE,
  DISTRIBUTION_AUTOMATION_TRIGGER,
  DISTRIBUTION_EVENT_VERSION,
  DISTRIBUTION_IMPORT_INITIAL_STATUS,
  DISTRIBUTION_IMPORT_SOURCE,
  DISTRIBUTION_PULL_JOB,
  DISTRIBUTION_REQUESTED_EVENT_TYPE,
} from '../domain/distribution-pull.constant.js'
import { deriveDistributionIdempotencyKey } from '../domain/distribution-idempotency.policy.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../domain/system-distribution-actor.constant.js'
import type { DistributionEnqueueGatewayPort } from './enqueue-distribution.port.js'
import type { EligibleCompany } from './select-eligible-companies.use-case.js'

export type DistributionEnqueueIdentifiers = {
  nextImportId(): string
  nextEventId(): string
}

export type EnqueueDistributionResult = {
  readonly enqueued: boolean
  readonly idempotencyKey: string
  readonly importId: string
}

export type EnqueueDistributionUseCase = {
  execute(input: {
    readonly cadenceMinutes: number
    readonly company: EligibleCompany
    readonly correlationId: string
    readonly now: Date
  }): Promise<EnqueueDistributionResult>
}

export function createEnqueueDistributionUseCase(dependencies: {
  readonly gateway: DistributionEnqueueGatewayPort
  readonly identifiers: DistributionEnqueueIdentifiers
}): EnqueueDistributionUseCase {
  return {
    async execute({ cadenceMinutes, company, correlationId, now }) {
      const idempotencyKey = deriveDistributionIdempotencyKey({
        cadenceMinutes,
        companyId: company.companyId,
        cycleInstant: now,
        environment: company.environment,
      })
      const importId = dependencies.identifiers.nextImportId()
      const { enqueued } = await dependencies.gateway.persist({
        import: {
          automationJob: DISTRIBUTION_PULL_JOB,
          companyId: company.companyId,
          correlationId,
          id: importId,
          idempotencyKey,
          receivedCount: 0n,
          requestFingerprint: idempotencyKey,
          requestedByUserId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
          source: DISTRIBUTION_IMPORT_SOURCE,
          status: DISTRIBUTION_IMPORT_INITIAL_STATUS,
          triggeredBy: DISTRIBUTION_AUTOMATION_TRIGGER,
        },
        outbox: {
          actorUserId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
          aggregateId: importId,
          aggregateType: DISTRIBUTION_AGGREGATE_TYPE,
          automationJob: DISTRIBUTION_PULL_JOB,
          companyId: company.companyId,
          correlationId,
          eventId: dependencies.identifiers.nextEventId(),
          eventType: DISTRIBUTION_REQUESTED_EVENT_TYPE,
          eventVersion: DISTRIBUTION_EVENT_VERSION,
          payload: { importId },
          triggeredBy: DISTRIBUTION_AUTOMATION_TRIGGER,
        },
      })
      return { enqueued, idempotencyKey, importId }
    },
  }
}
