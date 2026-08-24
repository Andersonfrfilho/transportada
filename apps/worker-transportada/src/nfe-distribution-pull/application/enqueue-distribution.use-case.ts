/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeFiscalEnvironment } from '../../database/nfe.schema.js'
import { deriveDistributionIdempotencyKey } from '../domain/distribution-idempotency.policy.js'
import {
  DISTRIBUTION_AGGREGATE_TYPE,
  DISTRIBUTION_AUTOMATION_TRIGGER,
  DISTRIBUTION_EVENT_VERSION,
  DISTRIBUTION_IMPORT_INITIAL_STATUS,
  DISTRIBUTION_IMPORT_SOURCE,
  DISTRIBUTION_PULL_JOB,
  DISTRIBUTION_REQUESTED_EVENT_TYPE,
} from '../domain/distribution-pull.constant.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../domain/system-distribution-actor.constant.js'

import type {
  DistributionEnqueueGatewayPort,
  DistributionEnqueueIdentifiers,
} from './enqueue-distribution.port.js'

export type EnqueueDistributionResult = {
  readonly enqueued: boolean
  readonly idempotencyKey: string
  readonly importId: string
}

export type EnqueueDistributionDependencies = {
  readonly cadenceMinutes: number
  readonly gateway: DistributionEnqueueGatewayPort
  readonly identifiers: DistributionEnqueueIdentifiers
}

type EnqueueDistributionParams = {
  readonly companyId: string
  readonly correlationId: string
  readonly cycleInstant: Date
  readonly environment: NfeFiscalEnvironment
}

export async function enqueueDistribution(
  dependencies: EnqueueDistributionDependencies,
  params: EnqueueDistributionParams,
): Promise<EnqueueDistributionResult> {
  const idempotencyKey = deriveDistributionIdempotencyKey({
    cadenceMinutes: dependencies.cadenceMinutes,
    companyId: params.companyId,
    cycleInstant: params.cycleInstant,
    environment: params.environment,
  })

  const importId = dependencies.identifiers.nextImportId()

  const { enqueued } = await dependencies.gateway.persist({
    import: {
      automationJob: DISTRIBUTION_PULL_JOB,
      companyId: params.companyId,
      correlationId: params.correlationId,
      id: importId,
      idempotencyKey,
      receivedCount: 0n,
      // A digital do pedido é a própria chave: a automação não tem arquivo para resumir.
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
      companyId: params.companyId,
      correlationId: params.correlationId,
      eventId: dependencies.identifiers.nextEventId(),
      eventType: DISTRIBUTION_REQUESTED_EVENT_TYPE,
      eventVersion: DISTRIBUTION_EVENT_VERSION,
      payload: { importId },
      triggeredBy: DISTRIBUTION_AUTOMATION_TRIGGER,
    },
  })

  return { enqueued, idempotencyKey, importId }
}
