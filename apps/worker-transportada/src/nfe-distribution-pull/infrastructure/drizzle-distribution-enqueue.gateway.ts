/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Grava um pedido de automação: a linha de `nfe_imports` mais o evento de `processing_outbox`, na
 * mesma transação — quem publica é o relay que já existia. Repetição dentro da mesma janela de
 * cadência bate na unique `(company_id, idempotency_key)`, e isso é **pulo idempotente**, não falha:
 * o ciclo conta como `skipped` e segue.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { nfeImports } from '../../database/nfe.schema.js'
import { processingOutbox } from '../../database/processing.schema.js'
import type {
  DistributionEnqueueGatewayPort,
  DistributionEnqueuePlan,
} from '../application/enqueue-distribution.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const UNIQUE_VIOLATION_CODE = '23505'
const MAXIMUM_CAUSE_DEPTH = 3

export function createDrizzleDistributionEnqueueGateway(dependencies: {
  readonly database: Database
}): DistributionEnqueueGatewayPort {
  return {
    async persist(plan) {
      try {
        await insertEnqueuePlan(dependencies.database, plan)
        return { enqueued: true }
      } catch (error: unknown) {
        if (isUniqueViolation(error)) return { enqueued: false }
        throw error
      }
    },
  }
}

async function insertEnqueuePlan(
  database: Database,
  plan: DistributionEnqueuePlan,
): Promise<void> {
  await database.transaction(async (transaction) => {
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

/** O código do Postgres pode vir embrulhado pelo driver — daí a descida pelo `cause`, com fundo. */
function isUniqueViolation(error: unknown, depth = 0): boolean {
  if (depth > MAXIMUM_CAUSE_DEPTH || typeof error !== 'object' || error === null) return false
  const candidate = error as { readonly cause?: unknown; readonly code?: unknown }
  if (candidate.code === UNIQUE_VIOLATION_CODE) return true
  return isUniqueViolation(candidate.cause, depth + 1)
}
