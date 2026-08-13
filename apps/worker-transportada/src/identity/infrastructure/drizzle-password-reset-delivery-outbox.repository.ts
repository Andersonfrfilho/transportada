/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'

import { passwordResetDeliveryOutbox } from '../../database/password-reset-delivery.schema.js'
import { PASSWORD_RESET_DELIVERY_EVENT_TYPE } from '../../messaging/password-reset-delivery-envelope.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type PasswordResetDeliveryClaimedEntry = {
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: typeof PASSWORD_RESET_DELIVERY_EVENT_TYPE.CODE_REQUESTED
  readonly eventVersion: 1
  readonly occurredAt: string
  readonly requestId: string
  readonly userId: string
}

type OutboxPayload = { readonly requestId: string; readonly userId: string }

function readPayload(value: unknown): OutboxPayload {
  if (typeof value !== 'object' || value === null)
    throw new Error('Unsupported password reset outbox payload')
  const { requestId, userId } = value as Record<string, unknown>
  if (typeof requestId !== 'string' || typeof userId !== 'string') {
    throw new Error('Unsupported password reset outbox payload')
  }

  return { requestId, userId }
}

export class DrizzlePasswordResetDeliveryOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly PasswordResetDeliveryClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          companyId: passwordResetDeliveryOutbox.companyId,
          correlationId: passwordResetDeliveryOutbox.correlationId,
          eventId: passwordResetDeliveryOutbox.eventId,
          eventType: passwordResetDeliveryOutbox.eventType,
          eventVersion: passwordResetDeliveryOutbox.eventVersion,
          occurredAt: passwordResetDeliveryOutbox.createdAt,
          payload: passwordResetDeliveryOutbox.payload,
          requestId: passwordResetDeliveryOutbox.requestId,
        })
        .from(passwordResetDeliveryOutbox)
        .where(
          and(
            isNull(passwordResetDeliveryOutbox.publishedAt),
            lte(passwordResetDeliveryOutbox.nextAttemptAt, params.now),
            or(
              isNull(passwordResetDeliveryOutbox.claimOwner),
              lte(passwordResetDeliveryOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(passwordResetDeliveryOutbox.createdAt), asc(passwordResetDeliveryOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) return []

      await transaction
        .update(passwordResetDeliveryOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => {
        if (
          row.eventType !== PASSWORD_RESET_DELIVERY_EVENT_TYPE.CODE_REQUESTED ||
          row.eventVersion !== 1n
        ) {
          throw new Error('Unsupported password reset delivery outbox record')
        }

        return {
          claimOwner: params.claimOwner,
          companyId: row.companyId,
          correlationId: row.correlationId,
          eventId: row.eventId,
          eventType: PASSWORD_RESET_DELIVERY_EVENT_TYPE.CODE_REQUESTED,
          eventVersion: 1 as const,
          occurredAt: row.occurredAt.toISOString(),
          requestId: row.requestId,
          userId: readPayload(row.payload).userId,
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
      .update(passwordResetDeliveryOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(passwordResetDeliveryOutbox.companyId, params.companyId),
          eq(passwordResetDeliveryOutbox.eventId, params.eventId),
          eq(passwordResetDeliveryOutbox.claimOwner, params.claimOwner),
          isNull(passwordResetDeliveryOutbox.publishedAt),
        ),
      )
  }
}

type OutboxRow = typeof passwordResetDeliveryOutbox.$inferSelect

function inOutboxRows(rows: readonly Pick<OutboxRow, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows

  if (firstRow === undefined) throw new Error('At least one outbox row is required')

  return or(
    and(
      eq(passwordResetDeliveryOutbox.companyId, firstRow.companyId),
      eq(passwordResetDeliveryOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(
        eq(passwordResetDeliveryOutbox.companyId, row.companyId),
        eq(passwordResetDeliveryOutbox.eventId, row.eventId),
      ),
    ),
  )
}
