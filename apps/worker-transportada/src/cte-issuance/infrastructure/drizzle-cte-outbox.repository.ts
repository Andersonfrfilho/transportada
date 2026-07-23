/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { cteIssuanceOutbox } from '../../database/processing.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type CteOutboxEventType = 'transportada.cte.item.issue.requested'

type CteOutboxClaimedEntry = {
  readonly actorId: string
  readonly attemptFingerprint: string
  readonly attemptId: string
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: CteOutboxEventType
  readonly aggregateId: string
  readonly batchId: string
  readonly batchItemId: string
  readonly attemptKind: 'issue' | 'reprocess'
  readonly aggregateType: 'cte_batch'
  readonly aggregateSubtype: 'item'
  readonly eventVersion: 1
  readonly occurredAt: string
  readonly payload: {
    readonly batchItemId: string
    readonly batchId: string
    readonly attemptKind: 'issue' | 'reprocess'
    readonly status: string
    readonly attemptFingerprint: string
    readonly attemptId: string
  }
}

export class DrizzleCteOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly CteOutboxClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          actorUserId: cteIssuanceOutbox.actorUserId,
          attemptFingerprint: cteIssuanceOutbox.attemptFingerprint,
          attemptId: cteIssuanceOutbox.attemptId,
          claimOwner: cteIssuanceOutbox.claimOwner,
          companyId: cteIssuanceOutbox.companyId,
          correlationId: cteIssuanceOutbox.correlationId,
          eventId: cteIssuanceOutbox.eventId,
          eventType: cteIssuanceOutbox.eventType,
          aggregateId: cteIssuanceOutbox.aggregateId,
          batchId: cteIssuanceOutbox.batchId,
          batchItemId: cteIssuanceOutbox.batchItemId,
          attemptKind: cteIssuanceOutbox.attemptKind,
          aggregateType: cteIssuanceOutbox.aggregateType,
          aggregateSubtype: cteIssuanceOutbox.aggregateSubtype,
          eventVersion: cteIssuanceOutbox.eventVersion,
          occurredAt: cteIssuanceOutbox.createdAt,
          payload: cteIssuanceOutbox.payload,
        })
        .from(cteIssuanceOutbox)
        .where(
          and(
            isNull(cteIssuanceOutbox.publishedAt),
            lte(cteIssuanceOutbox.nextAttemptAt, params.now),
            or(
              isNull(cteIssuanceOutbox.claimOwner),
              lte(cteIssuanceOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(cteIssuanceOutbox.createdAt), asc(cteIssuanceOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) {
        return []
      }

      await transaction
        .update(cteIssuanceOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => {
        if (
          row.aggregateType !== 'cte_batch' ||
          row.aggregateSubtype !== 'item' ||
          row.eventType !== 'transportada.cte.item.issue.requested' ||
          (row.attemptKind !== 'issue' && row.attemptKind !== 'reprocess') ||
          row.eventVersion <= 0n
        ) {
          throw new Error('Unsupported CT-e outbox record')
        }

        return {
          actorId: row.actorUserId,
          attemptFingerprint: row.attemptFingerprint,
          attemptId: row.attemptId,
          claimOwner: params.claimOwner,
          companyId: row.companyId,
          correlationId: row.correlationId,
          eventId: row.eventId,
          eventType: row.eventType,
          aggregateId: row.aggregateId,
          batchId: row.batchId,
          batchItemId: row.batchItemId,
          attemptKind: row.attemptKind,
          aggregateType: row.aggregateType,
          aggregateSubtype: row.aggregateSubtype,
          eventVersion: 1 as const,
          occurredAt: row.occurredAt.toISOString(),
          payload: row.payload as CteOutboxClaimedEntry['payload'],
        }
      })
    })
  }

  async markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void> {
    await this.#database
      .update(cteIssuanceOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(cteIssuanceOutbox.companyId, params.companyId),
          eq(cteIssuanceOutbox.eventId, params.eventId),
          eq(cteIssuanceOutbox.claimOwner, params.claimOwner),
          isNull(cteIssuanceOutbox.publishedAt),
        ),
      )
  }
}

type CteIssuanceOutboxRow = typeof cteIssuanceOutbox.$inferSelect

function inOutboxRows(rows: readonly Pick<CteIssuanceOutboxRow, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows

  if (firstRow === undefined) {
    throw new Error('At least one outbox row is required')
  }

  return or(
    and(
      eq(cteIssuanceOutbox.companyId, firstRow.companyId),
      eq(cteIssuanceOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(
        eq(cteIssuanceOutbox.companyId, row.companyId),
        eq(cteIssuanceOutbox.eventId, row.eventId),
      ),
    ),
  )
}
