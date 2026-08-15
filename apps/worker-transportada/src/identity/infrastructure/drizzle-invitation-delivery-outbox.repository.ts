/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'

import { invitationDeliveryOutbox } from '../../database/invitation-delivery.schema.js'
import { INVITATION_DELIVERY_EVENT_TYPE } from '../../messaging/invitation-delivery-envelope.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type InvitationDeliveryClaimedEntry = {
  readonly actorId: string
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: typeof INVITATION_DELIVERY_EVENT_TYPE.CODE_REQUESTED
  readonly eventVersion: 1
  readonly invitationId: string
  readonly occurredAt: string
  readonly userId: string
}

type OutboxPayload = { readonly invitationId: string; readonly userId: string }

function readPayload(value: unknown): OutboxPayload {
  if (typeof value !== 'object' || value === null)
    throw new Error('Unsupported invitation outbox payload')
  const { invitationId, userId } = value as Record<string, unknown>
  if (typeof invitationId !== 'string' || typeof userId !== 'string') {
    throw new Error('Unsupported invitation outbox payload')
  }

  return { invitationId, userId }
}

export class DrizzleInvitationDeliveryOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly InvitationDeliveryClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          actorUserId: invitationDeliveryOutbox.actorUserId,
          companyId: invitationDeliveryOutbox.companyId,
          correlationId: invitationDeliveryOutbox.correlationId,
          eventId: invitationDeliveryOutbox.eventId,
          eventType: invitationDeliveryOutbox.eventType,
          eventVersion: invitationDeliveryOutbox.eventVersion,
          invitationId: invitationDeliveryOutbox.invitationId,
          occurredAt: invitationDeliveryOutbox.createdAt,
          payload: invitationDeliveryOutbox.payload,
        })
        .from(invitationDeliveryOutbox)
        .where(
          and(
            isNull(invitationDeliveryOutbox.publishedAt),
            lte(invitationDeliveryOutbox.nextAttemptAt, params.now),
            or(
              isNull(invitationDeliveryOutbox.claimOwner),
              lte(invitationDeliveryOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(invitationDeliveryOutbox.createdAt), asc(invitationDeliveryOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) return []

      await transaction
        .update(invitationDeliveryOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => {
        if (
          row.eventType !== INVITATION_DELIVERY_EVENT_TYPE.CODE_REQUESTED ||
          row.eventVersion !== 1n
        ) {
          throw new Error('Unsupported invitation delivery outbox record')
        }

        return {
          actorId: row.actorUserId,
          claimOwner: params.claimOwner,
          companyId: row.companyId,
          correlationId: row.correlationId,
          eventId: row.eventId,
          eventType: INVITATION_DELIVERY_EVENT_TYPE.CODE_REQUESTED,
          eventVersion: 1 as const,
          invitationId: row.invitationId,
          occurredAt: row.occurredAt.toISOString(),
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
      .update(invitationDeliveryOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(invitationDeliveryOutbox.companyId, params.companyId),
          eq(invitationDeliveryOutbox.eventId, params.eventId),
          eq(invitationDeliveryOutbox.claimOwner, params.claimOwner),
          isNull(invitationDeliveryOutbox.publishedAt),
        ),
      )
  }
}

type OutboxRow = typeof invitationDeliveryOutbox.$inferSelect

function inOutboxRows(rows: readonly Pick<OutboxRow, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows

  if (firstRow === undefined) throw new Error('At least one outbox row is required')

  return or(
    and(
      eq(invitationDeliveryOutbox.companyId, firstRow.companyId),
      eq(invitationDeliveryOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(
        eq(invitationDeliveryOutbox.companyId, row.companyId),
        eq(invitationDeliveryOutbox.eventId, row.eventId),
      ),
    ),
  )
}
