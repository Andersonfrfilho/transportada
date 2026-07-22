/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm'

import { processedMessages, processingOutbox } from '../../database/processing.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type ClaimedOutboxEntry = {
  readonly actorId: string
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType:
    | 'transportada.nfe.import.requested'
    | 'transportada.nfe.distribution.requested'
  readonly importId: string
  readonly occurredAt: string
  readonly version: 1
}

type RunOnceResult = {
  readonly type: 'ack'
}

export class DrizzleOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly ClaimedOutboxEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          actorId: processingOutbox.actorUserId,
          companyId: processingOutbox.companyId,
          correlationId: processingOutbox.correlationId,
          eventId: processingOutbox.eventId,
          eventType: processingOutbox.eventType,
          importId: processingOutbox.aggregateId,
          occurredAt: processingOutbox.createdAt,
        })
        .from(processingOutbox)
        .where(
          and(
            isNull(processingOutbox.publishedAt),
            lte(processingOutbox.nextAttemptAt, params.now),
            or(
              isNull(processingOutbox.claimOwner),
              lte(processingOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(processingOutbox.createdAt), asc(processingOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) {
        return []
      }

      await transaction
        .update(processingOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => ({
        actorId: row.actorId,
        claimOwner: params.claimOwner,
        companyId: row.companyId,
        correlationId: row.correlationId,
        eventId: row.eventId,
        eventType: row.eventType as ClaimedOutboxEntry['eventType'],
        importId: row.importId,
        occurredAt: row.occurredAt.toISOString(),
        version: 1 as const,
      }))
    })
  }

  async markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void> {
    await this.#database
      .update(processingOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(processingOutbox.companyId, params.companyId),
          eq(processingOutbox.eventId, params.eventId),
          eq(processingOutbox.claimOwner, params.claimOwner),
          isNull(processingOutbox.publishedAt),
        ),
      )
  }

  async hasProcessed(params: {
    readonly companyId: string
    readonly consumerName: string
    readonly eventId: string
  }): Promise<boolean> {
    const [row] = await this.#database
      .select({ id: processedMessages.id })
      .from(processedMessages)
      .where(
        and(
          eq(processedMessages.companyId, params.companyId),
          eq(processedMessages.consumerName, params.consumerName),
          eq(processedMessages.eventId, params.eventId),
        ),
      )
      .limit(1)

    return row !== undefined
  }

  async markProcessed(params: {
    readonly companyId: string
    readonly consumerName: string
    readonly eventId: string
    readonly result: string
  }): Promise<void> {
    await this.#database.insert(processedMessages).values({
      companyId: params.companyId,
      consumerName: params.consumerName,
      eventId: params.eventId,
      id: crypto.randomUUID(),
      processedAt: new Date(),
      result: params.result,
    })
  }

  async runWithProcessingLock(params: {
    readonly companyId: string
    readonly consumerName: string
    readonly eventId: string
    readonly operation: () => Promise<RunOnceResult>
  }): Promise<RunOnceResult> {
    const lockKey = `${params.companyId}:${params.consumerName}:${params.eventId}`

    return this.#database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)

      return params.operation()
    })
  }
}

function inOutboxRows(rows: readonly Pick<ClaimedOutboxEntry, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows

  if (firstRow === undefined) {
    throw new Error('At least one outbox row is required')
  }

  return or(
    and(
      eq(processingOutbox.companyId, firstRow.companyId),
      eq(processingOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(eq(processingOutbox.companyId, row.companyId), eq(processingOutbox.eventId, row.eventId)),
    ),
  )
}
