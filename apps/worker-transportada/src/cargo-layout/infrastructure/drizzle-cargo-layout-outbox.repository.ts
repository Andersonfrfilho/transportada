/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { tripCargoLayoutOutbox } from '../../database/trip-cargo-layout-outbox.schema.js'
import { CARGO_LAYOUT_EVENT_TYPE } from '../../messaging/cargo-layout-envelope.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type CargoLayoutOutboxClaimedEntry = {
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly inputHash: string
  readonly layoutId: string
  readonly occurredAt: string
}

/**
 * Do `payload jsonb` só sai o `inputHash`: a planta vem da coluna tipada, e um payload cujo
 * `layoutId` diverge dela é linha corrompida — recusada em vez de publicar o pedido de outra planta.
 */
function parseInputHash(params: { readonly layoutId: string; readonly value: unknown }) {
  if (typeof params.value !== 'object' || params.value === null) return null
  const { inputHash, layoutId } = params.value as Record<string, unknown>
  if (typeof inputHash !== 'string' || inputHash === '') return null
  if (layoutId !== params.layoutId) return null
  return inputHash
}

export class DrizzleCargoLayoutOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly CargoLayoutOutboxClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          companyId: tripCargoLayoutOutbox.companyId,
          correlationId: tripCargoLayoutOutbox.correlationId,
          eventId: tripCargoLayoutOutbox.eventId,
          eventType: tripCargoLayoutOutbox.eventType,
          layoutId: tripCargoLayoutOutbox.layoutId,
          occurredAt: tripCargoLayoutOutbox.createdAt,
          payload: tripCargoLayoutOutbox.payload,
        })
        .from(tripCargoLayoutOutbox)
        .where(
          and(
            isNull(tripCargoLayoutOutbox.publishedAt),
            lte(tripCargoLayoutOutbox.nextAttemptAt, params.now),
            or(
              isNull(tripCargoLayoutOutbox.claimOwner),
              lte(tripCargoLayoutOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(tripCargoLayoutOutbox.createdAt), asc(tripCargoLayoutOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) return []

      await transaction
        .update(tripCargoLayoutOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => {
        const inputHash = parseInputHash({ layoutId: row.layoutId, value: row.payload })
        if (row.eventType !== CARGO_LAYOUT_EVENT_TYPE.REQUESTED || inputHash === null) {
          throw new Error('Unsupported cargo layout outbox record')
        }

        return {
          claimOwner: params.claimOwner,
          companyId: row.companyId,
          correlationId: row.correlationId,
          eventId: row.eventId,
          inputHash,
          layoutId: row.layoutId,
          occurredAt: row.occurredAt.toISOString(),
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
      .update(tripCargoLayoutOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(tripCargoLayoutOutbox.companyId, params.companyId),
          eq(tripCargoLayoutOutbox.eventId, params.eventId),
          eq(tripCargoLayoutOutbox.claimOwner, params.claimOwner),
          isNull(tripCargoLayoutOutbox.publishedAt),
        ),
      )
  }
}

type OutboxRow = typeof tripCargoLayoutOutbox.$inferSelect

function inOutboxRows(rows: readonly Pick<OutboxRow, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows
  if (firstRow === undefined) throw new Error('At least one outbox row is required')

  return or(
    and(
      eq(tripCargoLayoutOutbox.companyId, firstRow.companyId),
      eq(tripCargoLayoutOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(
        eq(tripCargoLayoutOutbox.companyId, row.companyId),
        eq(tripCargoLayoutOutbox.eventId, row.eventId),
      ),
    ),
  )
}
