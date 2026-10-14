/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'

import { deliveryProofOutbox } from '../../database/delivery-proof-processing.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const PROCESSING_REQUESTED_EVENT = 'delivery-proof.processing.requested'

export type DeliveryProofOutboxClaimedEntry = {
  readonly attachmentKey: string
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly objectKey: string
  readonly occurredAt: string
  readonly proofId: string
  readonly variant: 'original'
}

/**
 * O `payload jsonb` é lido aqui como no outbox do anexo: é referência de objeto escrita pela própria
 * API, sem texto de ninguém. `variant` diferente de `original` não é um pedido deste trilho.
 */
function parsePayload(
  value: unknown,
): { attachmentKey: string; objectKey: string; variant: 'original' } | null {
  if (typeof value !== 'object' || value === null) return null
  const { attachmentKey, objectKey, variant } = value as Record<string, unknown>
  if (typeof attachmentKey !== 'string') return null
  if (typeof objectKey !== 'string' || objectKey === '') return null
  if (variant !== 'original') return null
  return { attachmentKey, objectKey, variant }
}

export class DrizzleDeliveryProofOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly DeliveryProofOutboxClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          companyId: deliveryProofOutbox.companyId,
          correlationId: deliveryProofOutbox.correlationId,
          eventId: deliveryProofOutbox.eventId,
          eventType: deliveryProofOutbox.eventType,
          occurredAt: deliveryProofOutbox.createdAt,
          payload: deliveryProofOutbox.payload,
          proofId: deliveryProofOutbox.proofId,
        })
        .from(deliveryProofOutbox)
        .where(
          and(
            isNull(deliveryProofOutbox.publishedAt),
            lte(deliveryProofOutbox.nextAttemptAt, params.now),
            or(
              isNull(deliveryProofOutbox.claimOwner),
              lte(deliveryProofOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(deliveryProofOutbox.createdAt), asc(deliveryProofOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) return []

      await transaction
        .update(deliveryProofOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => {
        const payload = parsePayload(row.payload)
        if (row.eventType !== PROCESSING_REQUESTED_EVENT || payload === null) {
          throw new Error('Unsupported delivery proof outbox record')
        }

        return {
          attachmentKey: payload.attachmentKey,
          claimOwner: params.claimOwner,
          companyId: row.companyId,
          correlationId: row.correlationId,
          eventId: row.eventId,
          objectKey: payload.objectKey,
          occurredAt: row.occurredAt.toISOString(),
          proofId: row.proofId,
          variant: payload.variant,
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
      .update(deliveryProofOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(deliveryProofOutbox.companyId, params.companyId),
          eq(deliveryProofOutbox.eventId, params.eventId),
          eq(deliveryProofOutbox.claimOwner, params.claimOwner),
          isNull(deliveryProofOutbox.publishedAt),
        ),
      )
  }
}

type OutboxRow = typeof deliveryProofOutbox.$inferSelect

function inOutboxRows(rows: readonly Pick<OutboxRow, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows
  if (firstRow === undefined) throw new Error('At least one outbox row is required')

  return or(
    and(
      eq(deliveryProofOutbox.companyId, firstRow.companyId),
      eq(deliveryProofOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(
        eq(deliveryProofOutbox.companyId, row.companyId),
        eq(deliveryProofOutbox.eventId, row.eventId),
      ),
    ),
  )
}
