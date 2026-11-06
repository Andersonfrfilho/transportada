/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, count, eq, inArray, isNotNull, lte, or } from 'drizzle-orm'

import { nfeAccessKeyLookupBudgets, nfeAccessKeyLookups } from '../../database/nfe.schema.js'
import { processingOutbox } from '../../database/processing.schema.js'
import { NFE_ACCESS_KEY_EVENT_TYPE } from '../../messaging/nfe-access-key-envelope.schema.js'
import type { NfeWriteTransaction } from '../../nfe-documents/types/nfe-write-transaction.types.js'
import type { AccessKeyLookupRequeuePort } from '../application/requeue-waiting-lookups.port.js'
import {
  buildBudgetScopeKey,
  computeRemainingBudget,
  selectLookupsToRequeue,
} from '../domain/requeue-waiting-lookups.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const IMPORT_AGGREGATE_TYPE = 'nfe_import' as const
const EVENT_VERSION = 1n
const REQUEUE_BATCH_LIMIT = 200
// Janela já vencida: a linha criada só para ser travada não pode encurtar a hora de quem ainda vai reservar
const EXPIRED_WINDOW_START = new Date(0)

const lookups = nfeAccessKeyLookups
const budgets = nfeAccessKeyLookupBudgets

type DueLookup = {
  readonly companyId: string
  readonly correlationId: string
  readonly environment: 'homologation' | 'production'
  readonly id: string
  readonly importId: string | null
  readonly requestedByUserId: string
}

async function selectDueLookups(tx: NfeWriteTransaction, now: Date): Promise<DueLookup[]> {
  // `skip locked`: dois workers na mesma rotina nunca devolvem a mesma busca duas vezes
  return tx
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
      and(eq(lookups.status, 'waiting'), lte(lookups.notBefore, now), isNotNull(lookups.importId)),
    )
    .orderBy(asc(lookups.createdAt), asc(lookups.id))
    .limit(REQUEUE_BATCH_LIMIT)
    .for('update', { skipLocked: true })
}

/** Trava as linhas de orçamento dos escopos devidos, em ordem fixa: duas rotinas somam o resto, nunca o dobram. */
async function lockBudgetRows(tx: NfeWriteTransaction, due: readonly DueLookup[], now: Date) {
  const scopes = [...new Map(due.map((row) => [buildBudgetScopeKey(row), row])).values()].sort(
    (left, right) => buildBudgetScopeKey(left).localeCompare(buildBudgetScopeKey(right)),
  )
  await tx
    .insert(budgets)
    .values(
      scopes.map((scope) => ({
        companyId: scope.companyId,
        environment: scope.environment,
        updatedAt: now,
        usedInWindow: 0,
        windowStartedAt: EXPIRED_WINDOW_START,
      })),
    )
    .onConflictDoNothing()
  return tx
    .select()
    .from(budgets)
    .where(
      or(
        ...scopes.map((scope) =>
          and(eq(budgets.companyId, scope.companyId), eq(budgets.environment, scope.environment)),
        ),
      ),
    )
    .orderBy(asc(budgets.companyId), asc(budgets.environment))
    .for('update')
}

async function countInFlightByScope(tx: NfeWriteTransaction, due: readonly DueLookup[]) {
  const rows = await tx
    .select({
      companyId: lookups.companyId,
      environment: lookups.environment,
      total: count(),
    })
    .from(lookups)
    .where(
      and(
        inArray(lookups.status, ['queued', 'querying']),
        inArray(lookups.companyId, [...new Set(due.map((row) => row.companyId))]),
      ),
    )
    .groupBy(lookups.companyId, lookups.environment)
  return new Map(rows.map((row) => [buildBudgetScopeKey(row), row.total]))
}

async function enqueueLookup(tx: NfeWriteTransaction, row: DueLookup, now: Date): Promise<void> {
  if (row.importId === null) return
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
    eventType: NFE_ACCESS_KEY_EVENT_TYPE.REQUESTED,
    eventVersion: EVENT_VERSION,
    payload: { companyId: row.companyId, importId: row.importId, lookupId: row.id },
  })
}

export function createDrizzleAccessKeyLookupRequeue(dependencies: {
  readonly database: Database
}): AccessKeyLookupRequeuePort {
  return {
    async requeueDueLookups({ now }) {
      return dependencies.database.transaction(async (tx) => {
        const due = await selectDueLookups(tx, now)
        if (due.length === 0) return { requeuedCount: 0 }

        const budgetRows = await lockBudgetRows(tx, due, now)
        const inFlightByScope = await countInFlightByScope(tx, due)
        const budgetByScope = new Map(budgetRows.map((row) => [buildBudgetScopeKey(row), row]))
        const remainingByScope = new Map(
          due.map((row) => {
            const key = buildBudgetScopeKey(row)
            const remaining = computeRemainingBudget({
              inFlightCount: inFlightByScope.get(key) ?? 0,
              now,
              row: budgetByScope.get(key),
            })
            return [key, remaining] as const
          }),
        )
        const selectedIds = new Set(
          selectLookupsToRequeue({ candidates: due, remainingByScope }).map((entry) => entry.id),
        )
        const toRequeue = due.filter((row) => selectedIds.has(row.id))
        for (const row of toRequeue) await enqueueLookup(tx, row, now)
        return { requeuedCount: toRequeue.length }
      })
    },
  }
}
