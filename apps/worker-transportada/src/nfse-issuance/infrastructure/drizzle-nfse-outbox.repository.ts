/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { nfseIssuanceOutbox } from '../../database/processing.schema.js'
import {
  NFSE_PROCESSING_ATTEMPT_KIND,
  NFSE_PROCESSING_EVENT_TYPE,
  type NfseProcessingAttemptKind,
  type NfseProcessingEnvelopeV1,
} from '../../messaging/nfse-processing-envelope.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const NFSE_OUTBOX_AGGREGATE_TYPE = 'nfse_service_invoice'
const NFSE_OUTBOX_AGGREGATE_SUBTYPE = 'invoice'

type NfseOutboxEventType = NfseProcessingEnvelopeV1['type']

/**
 * A coluna `payload jsonb` da linha existe como registro do que a API gravou; ela não aparece aqui
 * de propósito. O envelope é montado das colunas tipadas, e é isso que impede o motivo do
 * cancelamento — texto livre do operador — de atravessar o broker (`security.md` §6).
 */
export type NfseOutboxClaimedEntry = {
  readonly actorId: string
  readonly aggregateId: string
  readonly attemptFingerprint: string
  readonly attemptId: string
  readonly attemptKind: NfseProcessingAttemptKind
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: NfseOutboxEventType
  readonly eventVersion: 1
  readonly invoiceId: string
  readonly occurredAt: string
  readonly status: string
}

function isNfseOutboxEventType(value: string): value is NfseOutboxEventType {
  return Object.values<string>(NFSE_PROCESSING_EVENT_TYPE).includes(value)
}

function isNfseOutboxAttemptKind(value: string): value is NfseProcessingAttemptKind {
  return NFSE_PROCESSING_ATTEMPT_KIND.includes(value as NfseProcessingAttemptKind)
}

export class DrizzleNfseOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly NfseOutboxClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          actorUserId: nfseIssuanceOutbox.actorUserId,
          aggregateId: nfseIssuanceOutbox.aggregateId,
          aggregateSubtype: nfseIssuanceOutbox.aggregateSubtype,
          aggregateType: nfseIssuanceOutbox.aggregateType,
          attemptFingerprint: nfseIssuanceOutbox.attemptFingerprint,
          attemptId: nfseIssuanceOutbox.attemptId,
          attemptKind: nfseIssuanceOutbox.attemptKind,
          companyId: nfseIssuanceOutbox.companyId,
          correlationId: nfseIssuanceOutbox.correlationId,
          eventId: nfseIssuanceOutbox.eventId,
          eventType: nfseIssuanceOutbox.eventType,
          eventVersion: nfseIssuanceOutbox.eventVersion,
          invoiceId: nfseIssuanceOutbox.invoiceId,
          occurredAt: nfseIssuanceOutbox.createdAt,
          status: nfseIssuanceOutbox.status,
        })
        .from(nfseIssuanceOutbox)
        .where(
          and(
            isNull(nfseIssuanceOutbox.publishedAt),
            lte(nfseIssuanceOutbox.nextAttemptAt, params.now),
            or(
              isNull(nfseIssuanceOutbox.claimOwner),
              lte(nfseIssuanceOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(nfseIssuanceOutbox.createdAt), asc(nfseIssuanceOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) {
        return []
      }

      await transaction
        .update(nfseIssuanceOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => {
        if (
          row.aggregateType !== NFSE_OUTBOX_AGGREGATE_TYPE ||
          row.aggregateSubtype !== NFSE_OUTBOX_AGGREGATE_SUBTYPE ||
          !isNfseOutboxEventType(row.eventType) ||
          !isNfseOutboxAttemptKind(row.attemptKind) ||
          row.eventVersion <= 0n
        ) {
          throw new Error('Unsupported NFS-e outbox record')
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
          invoiceId: row.invoiceId,
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
      .update(nfseIssuanceOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(nfseIssuanceOutbox.companyId, params.companyId),
          eq(nfseIssuanceOutbox.eventId, params.eventId),
          eq(nfseIssuanceOutbox.claimOwner, params.claimOwner),
          isNull(nfseIssuanceOutbox.publishedAt),
        ),
      )
  }
}

type NfseIssuanceOutboxRow = typeof nfseIssuanceOutbox.$inferSelect

function inOutboxRows(rows: readonly Pick<NfseIssuanceOutboxRow, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows

  if (firstRow === undefined) {
    throw new Error('At least one outbox row is required')
  }

  return or(
    and(
      eq(nfseIssuanceOutbox.companyId, firstRow.companyId),
      eq(nfseIssuanceOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(
        eq(nfseIssuanceOutbox.companyId, row.companyId),
        eq(nfseIssuanceOutbox.eventId, row.eventId),
      ),
    ),
  )
}
