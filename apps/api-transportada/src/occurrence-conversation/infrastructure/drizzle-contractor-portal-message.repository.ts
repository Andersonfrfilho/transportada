/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T654 (RF21, D9): o envio da operação à contratante pelo canal Portal, no Postgres. Quem
 * lê pelo portal vem de `findContractorPortalAudience` (a fronteira da 164, no módulo dono dela):
 * a conversa não lê a tratativa por conta própria (D4). Tudo pela empresa do contexto.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { findContractorPortalAudience } from '../../contractor-portal/infrastructure/contractor-occurrence.query.js'
import {
  idempotencyRecords,
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../database/database.schema.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type {
  ContractorPortalMessageTransactionPort,
  ContractorPortalMessageUnitOfWorkPort,
} from '../application/contractor-portal-message.port.js'
import { initialOutboundStatus } from '../domain/message-status.policy.js'
import { describeOccurrenceLabel } from '../domain/occurrence-label.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

async function acquireAdvisoryLock(transaction: Transaction, fields: readonly string[]) {
  const encoded = new TextEncoder().encode(JSON.stringify(fields))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}

function createTransactionPort(transaction: Transaction): ContractorPortalMessageTransactionPort {
  return {
    async findAudience({ companyId, occurrenceId }) {
      const item = await findTripOccurrenceFeedItem(transaction, { companyId, occurrenceId })
      if (item === null) return { kind: 'not_found' }
      /** O portal só mostra ocorrência de nota (164). */
      if (item.source !== 'document') return { kind: 'unavailable' }
      const audience = await findContractorPortalAudience(transaction, { companyId, occurrenceId })
      if (audience === null) return { kind: 'unavailable' }
      return {
        audience: {
          contractorId: audience.contractorId,
          occurrenceKind: item.source,
          occurrenceLabel: describeOccurrenceLabel(item),
          userIds: audience.userIds,
        },
        kind: 'available',
      }
    },

    async findIdempotency({ companyId, idempotencyKey, operation }) {
      await acquireAdvisoryLock(transaction, [operation, companyId, idempotencyKey])
      const [row] = await transaction
        .select({
          fingerprint: idempotencyRecords.requestFingerprint,
          response: idempotencyRecords.response,
        })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.companyId, companyId),
            eq(idempotencyRecords.operation, operation),
            eq(idempotencyRecords.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1)
      return row === undefined ? null : { fingerprint: row.fingerprint, response: row.response }
    },

    async findOrCreateContractorConversation(input) {
      await transaction
        .insert(occurrenceConversations)
        .values({
          companyId: input.companyId,
          contractorId: input.contractorId,
          occurrenceId: input.occurrenceId,
          occurrenceKind: input.occurrenceKind,
          participant: 'contractor',
          publicRef: input.publicRef,
        })
        .onConflictDoNothing({
          target: [
            occurrenceConversations.companyId,
            occurrenceConversations.occurrenceKind,
            occurrenceConversations.occurrenceId,
            occurrenceConversations.participant,
          ],
        })
      const [row] = await transaction
        .select({ id: occurrenceConversations.id })
        .from(occurrenceConversations)
        .where(
          and(
            eq(occurrenceConversations.companyId, input.companyId),
            eq(occurrenceConversations.occurrenceKind, input.occurrenceKind),
            eq(occurrenceConversations.occurrenceId, input.occurrenceId),
            eq(occurrenceConversations.participant, 'contractor'),
          ),
        )
        .limit(1)
      if (row === undefined) throw new Error('OCCURRENCE_CONVERSATION_NOT_PERSISTED')
      return row
    },

    async insertPortalMessage(input) {
      const status = initialOutboundStatus('portal')
      const [message] = await transaction
        .insert(occurrenceConversationMessages)
        .values({
          authorUserId: input.actorUserId,
          bodyText: input.bodyText,
          channel: 'portal',
          companyId: input.companyId,
          conversationId: input.conversationId,
          createdAt: input.createdAt,
          direction: 'outbound',
          status,
          statusTimes: { [status]: input.createdAt.toISOString() },
        })
        .returning({ id: occurrenceConversationMessages.id })
      if (message === undefined) throw new Error('portal conversation message was not inserted')
      return message
    },

    async saveIdempotency({ companyId, fingerprint, idempotencyKey, operation, response }) {
      await transaction.insert(idempotencyRecords).values({
        companyId,
        idempotencyKey,
        operation,
        requestFingerprint: fingerprint,
        response: response as object,
        status: 'succeeded',
      })
    },
  }
}

export function createDrizzleContractorPortalMessageUnitOfWork(
  database: Database,
): ContractorPortalMessageUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createTransactionPort(transaction))),
  }
}
