/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { aggregateAttachmentOutbox } from '../../database/aggregate-attachment.schema.js'
import {
  AGGREGATE_ATTACHMENT_TYPES,
  type AggregateAttachmentType,
} from '../../messaging/aggregate-attachment-envelope.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const EXTRACTION_REQUESTED_EVENT = 'attachment.extraction.requested'

export type AggregateAttachmentOutboxClaimedEntry = {
  readonly attachmentId: string
  readonly bucket: string
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly objectKey: string
  readonly occurredAt: string
  readonly type: AggregateAttachmentType
}

/**
 * O `payload jsonb` **é** lido aqui, ao contrário do outbox da NFS-e: ali o envelope se monta de
 * colunas tipadas para o motivo do cancelamento — texto livre do operador — não atravessar o broker.
 * Aqui o payload é referência de objeto, escrita pela própria API, e não há texto de ninguém nele.
 */
function parsePayload(
  value: unknown,
): { bucket: string; objectKey: string; type: AggregateAttachmentType } | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  const { bucket, objectKey, type } = candidate
  if (typeof bucket !== 'string' || bucket === '') return null
  if (typeof objectKey !== 'string' || objectKey === '') return null
  if (typeof type !== 'string') return null
  if (!AGGREGATE_ATTACHMENT_TYPES.includes(type as AggregateAttachmentType)) return null
  return { bucket, objectKey, type: type as AggregateAttachmentType }
}

export class DrizzleAggregateAttachmentOutboxRepository {
  readonly #database: Database
  readonly #outbox: typeof aggregateAttachmentOutbox

  /** A fila da ficha do motorista (spec 091) tem a mesma forma e outra tabela: só ela muda aqui. */
  constructor(
    database: Database,
    outbox: typeof aggregateAttachmentOutbox = aggregateAttachmentOutbox,
  ) {
    this.#database = database
    this.#outbox = outbox
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly AggregateAttachmentOutboxClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          attachmentId: this.#outbox.attachmentId,
          companyId: this.#outbox.companyId,
          correlationId: this.#outbox.correlationId,
          eventId: this.#outbox.eventId,
          eventType: this.#outbox.eventType,
          occurredAt: this.#outbox.createdAt,
          payload: this.#outbox.payload,
        })
        .from(this.#outbox)
        .where(
          and(
            isNull(this.#outbox.publishedAt),
            lte(this.#outbox.nextAttemptAt, params.now),
            or(isNull(this.#outbox.claimOwner), lte(this.#outbox.claimExpiresAt, params.now)),
          ),
        )
        .orderBy(asc(this.#outbox.createdAt), asc(this.#outbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) return []

      await transaction
        .update(this.#outbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(this.#outbox, rows))

      return rows.map((row) => {
        const payload = parsePayload(row.payload)
        if (row.eventType !== EXTRACTION_REQUESTED_EVENT || payload === null) {
          throw new Error('Unsupported aggregate attachment outbox record')
        }

        return {
          attachmentId: row.attachmentId,
          bucket: payload.bucket,
          claimOwner: params.claimOwner,
          companyId: row.companyId,
          correlationId: row.correlationId,
          eventId: row.eventId,
          objectKey: payload.objectKey,
          occurredAt: row.occurredAt.toISOString(),
          type: payload.type,
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
      .update(this.#outbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(this.#outbox.companyId, params.companyId),
          eq(this.#outbox.eventId, params.eventId),
          eq(this.#outbox.claimOwner, params.claimOwner),
          isNull(this.#outbox.publishedAt),
        ),
      )
  }
}

type OutboxRow = typeof aggregateAttachmentOutbox.$inferSelect

function inOutboxRows(
  outbox: typeof aggregateAttachmentOutbox,
  rows: readonly Pick<OutboxRow, 'companyId' | 'eventId'>[],
) {
  const [firstRow, ...otherRows] = rows
  if (firstRow === undefined) throw new Error('At least one outbox row is required')

  return or(
    and(eq(outbox.companyId, firstRow.companyId), eq(outbox.eventId, firstRow.eventId)),
    ...otherRows.map((row) =>
      and(eq(outbox.companyId, row.companyId), eq(outbox.eventId, row.eventId)),
    ),
  )
}
