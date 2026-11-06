/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm'

import { nfeAccessKeyLookupBudgets, nfeAccessKeyLookups } from '../../database/nfe.schema.js'
import { processingOutbox } from '../../database/processing.schema.js'
import type { AccessKeyLookupRequeuePort } from '../application/requeue-waiting-lookups.port.js'
import {
  buildBudgetScopeKey,
  computeRemainingBudget,
  selectLookupsToRequeue,
} from '../domain/requeue-waiting-lookups.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const REQUESTED_EVENT_TYPE = 'transportada.nfe.access-key.requested' as const
const IMPORT_AGGREGATE_TYPE = 'nfe_import' as const
const EVENT_VERSION = 1n
const REQUEUE_BATCH_LIMIT = 200

const lookups = nfeAccessKeyLookups

export function createDrizzleAccessKeyLookupRequeue(dependencies: {
  readonly database: Database
}): AccessKeyLookupRequeuePort {
  return {
    async requeueDueLookups({ now }) {
      return dependencies.database.transaction(async (tx) => {
        // `skip locked`: dois workers na mesma rotina nunca devolvem a mesma busca duas vezes
        const due = await tx
          .select({
            companyId: lookups.companyId,
            correlationId: lookups.correlationId,
            environment: lookups.environment,
            id: lookups.id,
            importId: lookups.importId,
            requestedByUserId: lookups.requestedByUserId,
          })
          .from(lookups)
          .where(
            and(
              eq(lookups.status, 'waiting'),
              lte(lookups.notBefore, now),
              isNotNull(lookups.importId),
            ),
          )
          .orderBy(asc(lookups.createdAt), asc(lookups.id))
          .limit(REQUEUE_BATCH_LIMIT)
          .for('update', { skipLocked: true })
        if (due.length === 0) return { requeuedCount: 0 }

        const budgets = await tx.select().from(nfeAccessKeyLookupBudgets)
        const budgetByScope = new Map(budgets.map((row) => [buildBudgetScopeKey(row), row]))
        const remainingByScope = new Map(
          due.map((row) => {
            const key = buildBudgetScopeKey(row)
            return [key, computeRemainingBudget({ now, row: budgetByScope.get(key) })] as const
          }),
        )
        const selected = selectLookupsToRequeue({ candidates: due, remainingByScope })
        if (selected.length === 0) return { requeuedCount: 0 }

        const selectedIds = new Set(selected.map((entry) => entry.id))
        const toRequeue = due.filter((row) => selectedIds.has(row.id))
        for (const row of toRequeue) {
          if (row.importId === null) continue
          await tx
            .update(lookups)
            .set({ notBefore: null, status: 'queued', updatedAt: now })
            .where(and(eq(lookups.companyId, row.companyId), eq(lookups.id, row.id)))
          await tx.insert(processingOutbox).values({
            actorUserId: row.requestedByUserId,
            aggregateId: row.importId,
            aggregateType: IMPORT_AGGREGATE_TYPE,
            companyId: row.companyId,
            correlationId: row.correlationId,
            eventId: crypto.randomUUID(),
            eventType: REQUESTED_EVENT_TYPE,
            eventVersion: EVENT_VERSION,
            payload: { companyId: row.companyId, importId: row.importId, lookupId: row.id },
          })
        }
        return { requeuedCount: toRequeue.length }
      })
    },
  }
}
