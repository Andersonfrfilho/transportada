/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T651 (RF21, D9): a conversa da contratante pelo portal, no Postgres. Toda leitura filtra
 * pela empresa do contexto e pela mesma fronteira da listagem da 164 (ocorrência de nota, tratativa
 * visível, nota do recorte), que vem pronta de `buildContractorVisibleOccurrenceCondition` — a
 * conversa não lê a tratativa por conta própria (D4). A conversa ainda precisa ser **com** uma contratante do recorte: quem só recebe a nota
 * vê a ocorrência, mas não a conversa que a transportadora tem com o emitente.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, count, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import {
  contractors,
  idempotencyRecords,
  nfeParticipants,
  occurrenceConversationMessages,
  occurrenceConversationReads,
  occurrenceConversations,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../database/database.schema.js'
import { buildContractorVisibleOccurrenceCondition } from '../../contractor-portal/infrastructure/contractor-occurrence.query.js'
import type {
  ContractorPortalConversationTransactionPort,
  ContractorPortalConversationUnitOfWorkPort,
} from '../application/contractor-portal-conversation.port.js'
import { applyMessageStatus } from '../domain/message-status.policy.js'
import { markOccurrenceConversationRead } from './occurrence-conversation.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** O teto da leitura do fio no portal, o mesmo da leitura do operador. */
const PORTAL_MESSAGE_LIMIT = 200

async function acquireAdvisoryLock(transaction: Transaction, fields: readonly string[]) {
  const encoded = new TextEncoder().encode(JSON.stringify(fields))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}

/**
 * A mensagem da transportadora que esta conta do portal ainda não leu: depois da última lida dela
 * (`occurrence_conversation_reads`, por conta), na ordem `(created_at, id)` do fio.
 */
function unreadByUser(userId: string) {
  return and(
    eq(occurrenceConversationMessages.direction, 'outbound'),
    sql`not exists (
              select 1
              from ${occurrenceConversationReads} as portal_read
              join ${occurrenceConversationMessages} as portal_last_read
                on portal_last_read.company_id = portal_read.company_id
                and portal_last_read.id = portal_read.last_read_message_id
              where portal_read.company_id = ${occurrenceConversationMessages.companyId}
                and portal_read.conversation_id = ${occurrenceConversationMessages.conversationId}
                and portal_read.user_id = ${userId}
                and (portal_last_read.created_at, portal_last_read.id)
                  >= (${occurrenceConversationMessages.createdAt}, ${occurrenceConversationMessages.id})
            )`,
  )
}

function createTransactionPort(
  transaction: Transaction,
): ContractorPortalConversationTransactionPort {
  return {
    async ensureConversationRefs({ companyId, newRef, occurrenceIds, scope, userId }) {
      if (occurrenceIds.length === 0 || scope.contractorIds.length === 0) return new Map()

      /** A contratante da conversa é o emitente da nota (T203), e ela tem de estar no recorte. */
      const candidates = await transaction
        .select({
          contractorId: contractors.id,
          occurrenceId: tripDocumentOccurrences.id,
        })
        .from(tripDocumentOccurrences)
        .innerJoin(
          tripDocuments,
          and(
            eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
            eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
          ),
        )
        .innerJoin(
          nfeParticipants,
          and(
            eq(nfeParticipants.companyId, tripDocuments.companyId),
            eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
            eq(nfeParticipants.role, 'emitter'),
          ),
        )
        .innerJoin(
          contractors,
          and(
            eq(contractors.companyId, nfeParticipants.companyId),
            eq(contractors.taxId, nfeParticipants.taxId),
          ),
        )
        .where(
          and(
            eq(tripDocumentOccurrences.companyId, companyId),
            inArray(tripDocumentOccurrences.id, [...occurrenceIds]),
            inArray(contractors.id, [...scope.contractorIds]),
            buildContractorVisibleOccurrenceCondition(transaction, {
              companyId: tripDocumentOccurrences.companyId,
              occurrenceId: tripDocumentOccurrences.id,
              scope,
            }),
          ),
        )
      if (candidates.length === 0) return new Map()

      await transaction
        .insert(occurrenceConversations)
        .values(
          candidates.map((candidate) => ({
            companyId,
            contractorId: candidate.contractorId,
            occurrenceId: candidate.occurrenceId,
            occurrenceKind: 'document' as const,
            participant: 'contractor' as const,
            publicRef: newRef(),
          })),
        )
        .onConflictDoNothing({
          target: [
            occurrenceConversations.companyId,
            occurrenceConversations.occurrenceKind,
            occurrenceConversations.occurrenceId,
            occurrenceConversations.participant,
          ],
        })

      const rows = await transaction
        .select({
          id: occurrenceConversations.id,
          occurrenceId: occurrenceConversations.occurrenceId,
          publicRef: occurrenceConversations.publicRef,
        })
        .from(occurrenceConversations)
        .where(
          and(
            eq(occurrenceConversations.companyId, companyId),
            eq(occurrenceConversations.occurrenceKind, 'document'),
            eq(occurrenceConversations.participant, 'contractor'),
            inArray(
              occurrenceConversations.occurrenceId,
              candidates.map((candidate) => candidate.occurrenceId),
            ),
            inArray(occurrenceConversations.contractorId, [...scope.contractorIds]),
          ),
        )
      if (rows.length === 0) return new Map()

      /** Spec 183 T653: as não lidas desta conta, numa consulta só para a página inteira. */
      const unread = await transaction
        .select({
          conversationId: occurrenceConversationMessages.conversationId,
          total: count(),
        })
        .from(occurrenceConversationMessages)
        .where(
          and(
            eq(occurrenceConversationMessages.companyId, companyId),
            inArray(
              occurrenceConversationMessages.conversationId,
              rows.map((row) => row.id),
            ),
            unreadByUser(userId),
          ),
        )
        .groupBy(occurrenceConversationMessages.conversationId)
      const unreadByConversation = new Map(unread.map((row) => [row.conversationId, row.total]))

      return new Map(
        rows.flatMap((row) =>
          row.publicRef === null
            ? []
            : [
                [
                  row.occurrenceId,
                  { ref: row.publicRef, unreadCount: unreadByConversation.get(row.id) ?? 0 },
                ] as const,
              ],
        ),
      )
    },

    async findConversation({ companyId, ref, scope }) {
      if (scope.contractorIds.length === 0) return null
      const [row] = await transaction
        .select({ id: occurrenceConversations.id })
        .from(occurrenceConversations)
        .where(
          and(
            eq(occurrenceConversations.companyId, companyId),
            eq(occurrenceConversations.publicRef, ref),
            eq(occurrenceConversations.participant, 'contractor'),
            eq(occurrenceConversations.occurrenceKind, 'document'),
            inArray(occurrenceConversations.contractorId, [...scope.contractorIds]),
            buildContractorVisibleOccurrenceCondition(transaction, {
              companyId: occurrenceConversations.companyId,
              occurrenceId: occurrenceConversations.occurrenceId,
              scope,
            }),
          ),
        )
        .limit(1)
      return row ?? null
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

    async insertPortalMessage(input) {
      const [message] = await transaction
        .insert(occurrenceConversationMessages)
        .values({
          authorUserId: input.authorUserId,
          bodyText: input.bodyText,
          channel: 'portal',
          companyId: input.companyId,
          conversationId: input.conversationId,
          createdAt: input.createdAt,
          direction: 'inbound',
          status: null,
          statusTimes: {},
        })
        .returning({ createdAt: occurrenceConversationMessages.createdAt })
      if (message === undefined) throw new Error('portal conversation message was not inserted')
      return message
    },

    async listMessages({ companyId, conversationId }) {
      return transaction
        .select({
          authorUserId: occurrenceConversationMessages.authorUserId,
          bodyText: occurrenceConversationMessages.bodyText,
          channel: occurrenceConversationMessages.channel,
          createdAt: occurrenceConversationMessages.createdAt,
          direction: occurrenceConversationMessages.direction,
        })
        .from(occurrenceConversationMessages)
        .where(
          and(
            eq(occurrenceConversationMessages.companyId, companyId),
            eq(occurrenceConversationMessages.conversationId, conversationId),
          ),
        )
        .orderBy(
          asc(occurrenceConversationMessages.createdAt),
          asc(occurrenceConversationMessages.id),
        )
        .limit(PORTAL_MESSAGE_LIMIT)
    },

    async markRead({ at, companyId, conversationId, userId }) {
      await markOccurrenceConversationRead(transaction, { companyId, conversationId, userId })
      /** T654: só o canal `portal` sabe "lida" pela contratante; e-mail e WhatsApp têm a deles. */
      const rows = await transaction
        .select({
          id: occurrenceConversationMessages.id,
          status: occurrenceConversationMessages.status,
          statusTimes: occurrenceConversationMessages.statusTimes,
        })
        .from(occurrenceConversationMessages)
        .where(
          and(
            eq(occurrenceConversationMessages.companyId, companyId),
            eq(occurrenceConversationMessages.conversationId, conversationId),
            eq(occurrenceConversationMessages.direction, 'outbound'),
            eq(occurrenceConversationMessages.channel, 'portal'),
            isNotNull(occurrenceConversationMessages.status),
          ),
        )
        .for('update', { of: occurrenceConversationMessages })
      for (const row of rows) {
        if (row.status === null) continue
        const result = applyMessageStatus({
          at: at.toISOString(),
          channel: 'portal',
          current: { status: row.status, statusTimes: row.statusTimes },
          incoming: 'read',
        })
        if (!result.changed) continue
        await transaction
          .update(occurrenceConversationMessages)
          .set({ status: result.status, statusTimes: { ...result.statusTimes } })
          .where(
            and(
              eq(occurrenceConversationMessages.companyId, companyId),
              eq(occurrenceConversationMessages.id, row.id),
            ),
          )
      }
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

    async unreadCount({ companyId, conversationId, userId }) {
      const [row] = await transaction
        .select({ total: count() })
        .from(occurrenceConversationMessages)
        .where(
          and(
            eq(occurrenceConversationMessages.companyId, companyId),
            eq(occurrenceConversationMessages.conversationId, conversationId),
            unreadByUser(userId),
          ),
        )
      return row?.total ?? 0
    },
  }
}

export function createDrizzleContractorPortalConversationUnitOfWork(
  database: Database,
): ContractorPortalConversationUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createTransactionPort(transaction))),
  }
}
