/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267: as listas de responsáveis por ocorrências. Toda escrita grava `audit_logs` na mesma transação, com o
 * estado antes e depois (nunca endereço), e segura um advisory lock da lista para os tetos valerem sob concorrência.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import {
  auditLogs,
  companyOccurrenceWatchers,
  contractorOccurrenceWatchers,
} from '../../database/database.schema.js'
import type {
  OccurrenceWatcherRepositoryPort,
  OccurrenceWatcherRow,
  OccurrenceWatcherScope,
  OccurrenceWatcherWriteContext,
} from '../application/occurrence-watcher.port.js'
import {
  OCCURRENCE_WATCHER_MAX_ACTIVE,
  OCCURRENCE_WATCHER_MAX_TOTAL,
  type OccurrenceWatcherStatus,
} from '../domain/occurrence-watcher.constant.js'
import {
  OccurrenceWatcherListTooLongError,
  OccurrenceWatcherNotFoundError,
} from '../domain/occurrence-watcher.error.js'
import {
  loadEffectiveWatcherCandidates,
  readOccurrenceWatcherRows,
} from './occurrence-watcher-candidates.query.js'
import { findOccurrenceWatcherUsers } from './occurrence-watcher-directory.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type AuditVerb = 'activate' | 'add' | 'deactivate' | 'remove'

function whereScope(scope: OccurrenceWatcherScope) {
  return scope.kind === 'company'
    ? eq(companyOccurrenceWatchers.companyId, scope.companyId)
    : and(
        eq(contractorOccurrenceWatchers.companyId, scope.companyId),
        eq(contractorOccurrenceWatchers.contractorId, scope.contractorId),
      )
}

function whereRow(scope: OccurrenceWatcherScope, userId: string) {
  return scope.kind === 'company'
    ? and(whereScope(scope), eq(companyOccurrenceWatchers.userId, userId))
    : and(whereScope(scope), eq(contractorOccurrenceWatchers.userId, userId))
}

async function lockList(transaction: Transaction, scope: OccurrenceWatcherScope): Promise<void> {
  const key = JSON.stringify([
    'occurrence-watchers',
    scope.companyId,
    scope.kind === 'company' ? null : scope.contractorId,
  ])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}

async function writeAudit(
  transaction: Transaction,
  params: {
    readonly after: OccurrenceWatcherStatus | null
    readonly before: OccurrenceWatcherStatus | null
    readonly context: OccurrenceWatcherWriteContext
    readonly verb: AuditVerb
  },
): Promise<void> {
  const { context } = params
  const contractorId = context.scope.kind === 'contractor' ? context.scope.contractorId : null
  const snapshot = (status: OccurrenceWatcherStatus | null) =>
    status === null ? null : { contractorId, status, userId: context.userId }
  await transaction.insert(auditLogs).values({
    action: `occurrence_watchers.${context.scope.kind}.${params.verb}`,
    actorUserId: context.actorUserId,
    afterSnapshot: snapshot(params.after),
    beforeSnapshot: snapshot(params.before),
    companyId: context.scope.companyId,
    correlationId: context.correlationId,
    entityId: context.userId,
    entityType: 'occurrence_watcher',
    permission: 'settings.manage',
    targetId: context.userId,
    targetType: 'user',
  })
}

function assertRoom(
  rows: readonly OccurrenceWatcherRow[],
  becomesActive: boolean,
  isNewRow: boolean,
): void {
  if (isNewRow && rows.length >= OCCURRENCE_WATCHER_MAX_TOTAL) {
    throw new OccurrenceWatcherListTooLongError()
  }
  const activeCount = rows.filter((row) => row.status === 'active').length
  if (becomesActive && activeCount >= OCCURRENCE_WATCHER_MAX_ACTIVE) {
    throw new OccurrenceWatcherListTooLongError()
  }
}

export class DrizzleOccurrenceWatcherRepository implements OccurrenceWatcherRepositoryPort {
  private readonly database: Database

  public constructor(database: Database) {
    this.database = database
  }

  public async listWatcherRows(
    scope: OccurrenceWatcherScope,
  ): Promise<readonly OccurrenceWatcherRow[]> {
    return readOccurrenceWatcherRows(this.database, scope)
  }

  public findWatcherUsers(params: {
    readonly companyId: string
    readonly userIds?: readonly string[]
  }) {
    return findOccurrenceWatcherUsers(this.database, params)
  }

  public async addWatcher(context: OccurrenceWatcherWriteContext): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      await lockList(transaction, context.scope)
      const rows = await readOccurrenceWatcherRows(transaction, context.scope)
      if (rows.some((row) => row.userId === context.userId)) return false
      assertRoom(rows, true, true)
      const values = {
        companyId: context.scope.companyId,
        createdByUserId: context.actorUserId,
        updatedByUserId: context.actorUserId,
        userId: context.userId,
      }
      if (context.scope.kind === 'company') {
        await transaction.insert(companyOccurrenceWatchers).values(values)
      } else {
        await transaction
          .insert(contractorOccurrenceWatchers)
          .values({ ...values, contractorId: context.scope.contractorId })
      }
      await writeAudit(transaction, { after: 'active', before: null, context, verb: 'add' })
      return true
    })
  }

  public async setWatcherStatus(
    context: OccurrenceWatcherWriteContext & { readonly status: OccurrenceWatcherStatus },
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await lockList(transaction, context.scope)
      const rows = await readOccurrenceWatcherRows(transaction, context.scope)
      const current = rows.find((row) => row.userId === context.userId)
      if (current === undefined) throw new OccurrenceWatcherNotFoundError()
      if (current.status === context.status) return
      assertRoom(rows, context.status === 'active', false)
      const set = {
        status: context.status,
        updatedAt: new Date(),
        updatedByUserId: context.actorUserId,
      }
      if (context.scope.kind === 'company') {
        await transaction
          .update(companyOccurrenceWatchers)
          .set(set)
          .where(whereRow(context.scope, context.userId))
      } else {
        await transaction
          .update(contractorOccurrenceWatchers)
          .set(set)
          .where(whereRow(context.scope, context.userId))
      }
      await writeAudit(transaction, {
        after: context.status,
        before: current.status,
        context,
        verb: context.status === 'active' ? 'activate' : 'deactivate',
      })
    })
  }

  public async removeWatcher(context: OccurrenceWatcherWriteContext): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await lockList(transaction, context.scope)
      const rows = await readOccurrenceWatcherRows(transaction, context.scope)
      const current = rows.find((row) => row.userId === context.userId)
      if (current === undefined) throw new OccurrenceWatcherNotFoundError()
      if (context.scope.kind === 'company') {
        await transaction
          .delete(companyOccurrenceWatchers)
          .where(whereRow(context.scope, context.userId))
      } else {
        await transaction
          .delete(contractorOccurrenceWatchers)
          .where(whereRow(context.scope, context.userId))
      }
      await writeAudit(transaction, {
        after: null,
        before: current.status,
        context,
        verb: 'remove',
      })
    })
  }

  public loadEffectiveCandidates(params: {
    readonly companyId: string
    readonly contractorId: string
  }) {
    return loadEffectiveWatcherCandidates(this.database, params)
  }
}
