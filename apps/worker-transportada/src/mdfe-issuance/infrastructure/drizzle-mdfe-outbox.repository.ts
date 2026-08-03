/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { mdfeIssuanceOutbox } from '../../database/processing.schema.js'
import {
  MDFE_PROCESSING_ATTEMPT_KIND,
  MDFE_PROCESSING_EVENT_TYPE,
  type MdfeProcessingAttemptKind,
  type MdfeProcessingEnvelopeV1,
} from '../../messaging/mdfe-processing-envelope.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const MDFE_OUTBOX_AGGREGATE_TYPE = 'mdfe_manifest'
const MDFE_OUTBOX_AGGREGATE_SUBTYPE = 'manifest'

type MdfeOutboxEventType = MdfeProcessingEnvelopeV1['type']

export type MdfeOutboxClaimedEntry = {
  readonly actorId: string
  readonly aggregateId: string
  readonly attemptFingerprint: string
  readonly attemptId: string
  readonly attemptKind: MdfeProcessingAttemptKind
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: MdfeOutboxEventType
  readonly eventVersion: 1
  readonly manifestId: string
  readonly occurredAt: string
  readonly status: string
}

function isMdfeOutboxEventType(value: string): value is MdfeOutboxEventType {
  return Object.values<string>(MDFE_PROCESSING_EVENT_TYPE).includes(value)
}

function isMdfeOutboxAttemptKind(value: string): value is MdfeProcessingAttemptKind {
  return MDFE_PROCESSING_ATTEMPT_KIND.includes(value as MdfeProcessingAttemptKind)
}

export class DrizzleMdfeOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly MdfeOutboxClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          actorUserId: mdfeIssuanceOutbox.actorUserId,
          aggregateId: mdfeIssuanceOutbox.aggregateId,
          aggregateSubtype: mdfeIssuanceOutbox.aggregateSubtype,
          aggregateType: mdfeIssuanceOutbox.aggregateType,
          attemptFingerprint: mdfeIssuanceOutbox.attemptFingerprint,
          attemptId: mdfeIssuanceOutbox.attemptId,
          attemptKind: mdfeIssuanceOutbox.attemptKind,
          companyId: mdfeIssuanceOutbox.companyId,
          correlationId: mdfeIssuanceOutbox.correlationId,
          eventId: mdfeIssuanceOutbox.eventId,
          eventType: mdfeIssuanceOutbox.eventType,
          eventVersion: mdfeIssuanceOutbox.eventVersion,
          manifestId: mdfeIssuanceOutbox.manifestId,
          occurredAt: mdfeIssuanceOutbox.createdAt,
          status: mdfeIssuanceOutbox.status,
        })
        .from(mdfeIssuanceOutbox)
        .where(
          and(
            isNull(mdfeIssuanceOutbox.publishedAt),
            lte(mdfeIssuanceOutbox.nextAttemptAt, params.now),
            or(
              isNull(mdfeIssuanceOutbox.claimOwner),
              lte(mdfeIssuanceOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(mdfeIssuanceOutbox.createdAt), asc(mdfeIssuanceOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) {
        return []
      }

      await transaction
        .update(mdfeIssuanceOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => {
        if (
          row.aggregateType !== MDFE_OUTBOX_AGGREGATE_TYPE ||
          row.aggregateSubtype !== MDFE_OUTBOX_AGGREGATE_SUBTYPE ||
          !isMdfeOutboxEventType(row.eventType) ||
          !isMdfeOutboxAttemptKind(row.attemptKind) ||
          row.eventVersion <= 0n
        ) {
          throw new Error('Unsupported MDF-e outbox record')
        }

        return {
          actorId: row.actorUserId,
          aggregateId: row.aggregateId,
          attemptFingerprint: row.attemptFingerprint,
          attemptId: row.attemptId,
          attemptKind: row.attemptKind,
          claimOwner: params.claimOwner,
          companyId: row.companyId,
          correlationId: row.correlationId,
          eventId: row.eventId,
          eventType: row.eventType,
          eventVersion: 1 as const,
          manifestId: row.manifestId,
          occurredAt: row.occurredAt.toISOString(),
          status: row.status,
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
      .update(mdfeIssuanceOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(mdfeIssuanceOutbox.companyId, params.companyId),
          eq(mdfeIssuanceOutbox.eventId, params.eventId),
          eq(mdfeIssuanceOutbox.claimOwner, params.claimOwner),
          isNull(mdfeIssuanceOutbox.publishedAt),
        ),
      )
  }
}

type MdfeIssuanceOutboxRow = typeof mdfeIssuanceOutbox.$inferSelect

function inOutboxRows(rows: readonly Pick<MdfeIssuanceOutboxRow, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows

  if (firstRow === undefined) {
    throw new Error('At least one outbox row is required')
  }

  return or(
    and(
      eq(mdfeIssuanceOutbox.companyId, firstRow.companyId),
      eq(mdfeIssuanceOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(
        eq(mdfeIssuanceOutbox.companyId, row.companyId),
        eq(mdfeIssuanceOutbox.eventId, row.eventId),
      ),
    ),
  )
}
