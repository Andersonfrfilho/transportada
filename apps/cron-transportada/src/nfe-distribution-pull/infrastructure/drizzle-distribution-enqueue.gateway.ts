/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Persists one automation enqueue: an nfe_imports row plus the matching
 * processing_outbox event in a single transaction (the outbox relay then
 * publishes it). A duplicate within the same cadence bucket trips the
 * (company_id, idempotency_key) unique index — caught as an idempotent skip
 * rather than an error so the cycle counts it as skipped, not failed.
 */
import { nfeImports } from '../../database/nfe.schema.js'
import { processingOutbox } from '../../database/processing.schema.js'
import type { CronDatabase } from '../../database/cron-database.types.js'
import type {
  DistributionEnqueueGatewayPort,
  DistributionEnqueuePlan,
} from '../application/enqueue-distribution.port.js'

const UNIQUE_VIOLATION_CODE = '23505'

export function createDrizzleDistributionEnqueueGateway(dependencies: {
  readonly db: CronDatabase
}): DistributionEnqueueGatewayPort {
  return {
    async persist(plan) {
      try {
        await insertEnqueuePlan(dependencies.db, plan)
        return { enqueued: true }
      } catch (error) {
        if (isUniqueViolation(error)) return { enqueued: false }
        throw error
      }
    },
  }
}

async function insertEnqueuePlan(db: CronDatabase, plan: DistributionEnqueuePlan): Promise<void> {
  await db.transaction(async (transaction) => {
    await transaction.insert(nfeImports).values({
      automationJob: plan.import.automationJob,
      companyId: plan.import.companyId,
      correlationId: plan.import.correlationId,
      id: plan.import.id,
      idempotencyKey: plan.import.idempotencyKey,
      receivedCount: plan.import.receivedCount,
      requestFingerprint: plan.import.requestFingerprint,
      requestedByUserId: plan.import.requestedByUserId,
      source: plan.import.source,
      status: plan.import.status,
      triggeredBy: plan.import.triggeredBy,
    })
    await transaction.insert(processingOutbox).values({
      actorUserId: plan.outbox.actorUserId,
      aggregateId: plan.outbox.aggregateId,
      aggregateType: plan.outbox.aggregateType,
      automationJob: plan.outbox.automationJob,
      companyId: plan.outbox.companyId,
      correlationId: plan.outbox.correlationId,
      eventId: plan.outbox.eventId,
      eventType: plan.outbox.eventType,
      eventVersion: plan.outbox.eventVersion,
      payload: plan.outbox.payload,
      triggeredBy: plan.outbox.triggeredBy,
    })
  })
}

function isUniqueViolation(error: unknown, depth = 0): boolean {
  if (depth > 3 || typeof error !== 'object' || error === null) return false
  const candidate = error as { readonly code?: unknown; readonly cause?: unknown }
  if (candidate.code === UNIQUE_VIOLATION_CODE) return true
  return isUniqueViolation(candidate.cause, depth + 1)
}
