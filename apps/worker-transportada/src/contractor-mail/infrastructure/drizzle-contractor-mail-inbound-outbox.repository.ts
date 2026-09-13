/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { contractorInboundEmailOutbox } from '../../database/contractor-mail.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const EMAIL_RECEIVED_EVENT = 'email.received'

export type ContractorMailInboundOutboxClaimedEntry = {
  readonly claimOwner: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly occurredAt: string
  readonly providerEmailId: string
}

/**
 * Molde de `DrizzleContractorMailOutboundOutboxRepository` (T009), sobre
 * `contractor_inbound_email_outbox`: `claimDueEntries` marca (`FOR UPDATE SKIP LOCKED`) e devolve
 * na mesma transação, `markPublished` fecha depois que o `publish` no broker responde sem erro.
 */
export class DrizzleContractorMailInboundOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly ContractorMailInboundOutboxClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          companyId: contractorInboundEmailOutbox.companyId,
          correlationId: contractorInboundEmailOutbox.correlationId,
          eventId: contractorInboundEmailOutbox.eventId,
          eventType: contractorInboundEmailOutbox.eventType,
          occurredAt: contractorInboundEmailOutbox.createdAt,
          providerEmailId: contractorInboundEmailOutbox.providerEmailId,
        })
        .from(contractorInboundEmailOutbox)
        .where(
          and(
            isNull(contractorInboundEmailOutbox.publishedAt),
            lte(contractorInboundEmailOutbox.nextAttemptAt, params.now),
            or(
              isNull(contractorInboundEmailOutbox.claimOwner),
              lte(contractorInboundEmailOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(contractorInboundEmailOutbox.createdAt), asc(contractorInboundEmailOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) return []

      await transaction
        .update(contractorInboundEmailOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(inOutboxRows(rows))

      return rows.map((row) => {
        if (row.eventType !== EMAIL_RECEIVED_EVENT) {
          throw new Error('Unsupported contractor mail inbound outbox record')
        }

        return {
          claimOwner: params.claimOwner,
          companyId: row.companyId,
          correlationId: row.correlationId,
          eventId: row.eventId,
          occurredAt: row.occurredAt.toISOString(),
          providerEmailId: row.providerEmailId,
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
      .update(contractorInboundEmailOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(contractorInboundEmailOutbox.companyId, params.companyId),
          eq(contractorInboundEmailOutbox.eventId, params.eventId),
          eq(contractorInboundEmailOutbox.claimOwner, params.claimOwner),
          isNull(contractorInboundEmailOutbox.publishedAt),
        ),
      )
  }
}

type OutboxRow = typeof contractorInboundEmailOutbox.$inferSelect

function inOutboxRows(rows: readonly Pick<OutboxRow, 'companyId' | 'eventId'>[]) {
  const [firstRow, ...otherRows] = rows
  if (firstRow === undefined) throw new Error('At least one outbox row is required')

  return or(
    and(
      eq(contractorInboundEmailOutbox.companyId, firstRow.companyId),
      eq(contractorInboundEmailOutbox.eventId, firstRow.eventId),
    ),
    ...otherRows.map((row) =>
      and(
        eq(contractorInboundEmailOutbox.companyId, row.companyId),
        eq(contractorInboundEmailOutbox.eventId, row.eventId),
      ),
    ),
  )
}
