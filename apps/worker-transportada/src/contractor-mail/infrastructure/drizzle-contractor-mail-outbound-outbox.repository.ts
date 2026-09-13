/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { contractorMailOutbox } from '../../database/contractor-mail.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const MESSAGE_SEND_REQUESTED_EVENT = 'message.send.requested'

export type ContractorMailOutboundOutboxClaimedEntry = {
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly messageId: string
  readonly occurredAt: string
  readonly replyToAddress: string
  readonly toAddress: string
}

function parsePayload(value: unknown): { replyToAddress: string; toAddress: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  const { replyToAddress, toAddress } = candidate
  if (typeof replyToAddress !== 'string' || replyToAddress === '') return null
  if (typeof toAddress !== 'string' || toAddress === '') return null
  return { replyToAddress, toAddress }
}

/**
 * Molde de `DrizzleAggregateAttachmentOutboxRepository`: `claimDueEntries` marca (`FOR UPDATE SKIP
 * LOCKED`) e devolve na mesma transação, `markPublished` fecha depois que o `publish` no broker
 * responde sem erro.
 */
export class DrizzleContractorMailOutboundOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly ContractorMailOutboundOutboxClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          companyId: contractorMailOutbox.companyId,
          correlationId: contractorMailOutbox.correlationId,
          eventId: contractorMailOutbox.eventId,
          eventType: contractorMailOutbox.eventType,
          messageId: contractorMailOutbox.messageId,
          occurredAt: contractorMailOutbox.createdAt,
          payload: contractorMailOutbox.payload,
        })
        .from(contractorMailOutbox)
        .where(
          and(
            isNull(contractorMailOutbox.publishedAt),
            lte(contractorMailOutbox.nextAttemptAt, params.now),
            or(
              isNull(contractorMailOutbox.claimOwner),
              lte(contractorMailOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(contractorMailOutbox.createdAt), asc(contractorMailOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) return []

      await transaction
        .update(contractorMailOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => {
        const payload = parsePayload(row.payload)
        if (row.eventType !== MESSAGE_SEND_REQUESTED_EVENT || payload === null) {
          throw new Error('Unsupported contractor mail outbound outbox record')
        }

        return {
          claimOwner: params.claimOwner,
          companyId: row.companyId,
          correlationId: row.correlationId,
          eventId: row.eventId,
          messageId: row.messageId,
          occurredAt: row.occurredAt.toISOString(),
          replyToAddress: payload.replyToAddress,
          toAddress: payload.toAddress,
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
      .update(contractorMailOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(contractorMailOutbox.companyId, params.companyId),
          eq(contractorMailOutbox.eventId, params.eventId),
          eq(contractorMailOutbox.claimOwner, params.claimOwner),
          isNull(contractorMailOutbox.publishedAt),
        ),
      )
  }
}

type OutboxRow = typeof contractorMailOutbox.$inferSelect

function inOutboxRows(rows: readonly Pick<OutboxRow, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows
  if (firstRow === undefined) throw new Error('At least one outbox row is required')

  return or(
    and(
      eq(contractorMailOutbox.companyId, firstRow.companyId),
      eq(contractorMailOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(
        eq(contractorMailOutbox.companyId, row.companyId),
        eq(contractorMailOutbox.eventId, row.eventId),
      ),
    ),
  )
}
