/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T654 (RF21, D9): o envio da operação à contratante pelo canal Portal, no Postgres. Quem
 * lê pelo portal vem de `findContractorPortalAudience` (a fronteira da 164, no módulo dono dela):
 * a conversa não lê a tratativa por conta própria (D4). Tudo pela empresa do contexto.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { findContractorPortalAudience } from '../../contractor-portal/infrastructure/contractor-occurrence.query.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import {
  idempotencyRecords,
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../database/database.schema.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type {
  ContractorPortalChatAudienceReaderPort,
  ContractorPortalMessageTransactionPort,
  ContractorPortalMessageUnitOfWorkPort,
} from '../application/contractor-portal-message.port.js'
import { initialOutboundStatus } from '../domain/message-status.policy.js'
import { describeOccurrenceLabel } from '../domain/occurrence-label.policy.js'
import { createConversationAttachmentTransactionPort } from './drizzle-conversation-attachment.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

async function acquireAdvisoryLock(transaction: Transaction, fields: readonly string[]) {
  const encoded = new TextEncoder().encode(JSON.stringify(fields))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}

/** O público do portal desta ocorrência (com o e-mail de cada conta, T274 D2), pela fronteira da 164. */
async function findPortalAudience(
  queryable: Parameters<typeof findTripOccurrenceFeedItem>[0],
  { companyId, occurrenceId }: { readonly companyId: string; readonly occurrenceId: string },
) {
  const item = await findTripOccurrenceFeedItem(queryable, { companyId, occurrenceId })
  if (item === null) return { kind: 'not_found' as const }
  /** O portal só mostra ocorrência de nota (164). */
  if (item.source !== 'document') return { kind: 'unavailable' as const }
  const audience = await findContractorPortalAudience(queryable, { companyId, occurrenceId })
  if (audience === null) return { kind: 'unavailable' as const }
  /** A fronteira da 164 não lê perfil (contrato): o e-mail das contas é lido aqui, do lado da conversa. */
  const profiles =
    audience.userIds.length === 0
      ? []
      : await queryable
          .select({
            contactAddress: identityUserProfiles.contactAddress,
            contactChannel: identityUserProfiles.contactChannel,
            email: identityUserProfiles.email,
            userId: identityUserProfiles.userId,
          })
          .from(identityUserProfiles)
          .where(inArray(identityUserProfiles.userId, [...audience.userIds]))
  const emailByUser = new Map(
    profiles.map((profile) => [
      profile.userId,
      (profile.email.trim() !== ''
        ? profile.email
        : profile.contactChannel === 'email'
          ? profile.contactAddress
          : ''
      )
        .trim()
        .toLowerCase(),
    ]),
  )
  return {
    audience: {
      contractorId: audience.contractorId,
      occurrenceKind: item.source,
      occurrenceLabel: describeOccurrenceLabel(item),
      userIds: audience.userIds,
      users: audience.userIds.map((userId) => ({ email: emailByUser.get(userId) ?? '', userId })),
    },
    kind: 'available' as const,
  }
}

/** Spec 274 T3.7 (D2): quem o portal alcança, lido fora da transação do envio (o aviso sai depois do commit). */
export function createDrizzleContractorPortalChatAudienceReader(
  database: Database,
): ContractorPortalChatAudienceReaderPort {
  return {
    async find(input) {
      const found = await findPortalAudience(database, input)
      if (found.kind !== 'available') return null
      return {
        occurrenceLabel: found.audience.occurrenceLabel,
        users: found.audience.users,
      }
    },
  }
}

function createTransactionPort(transaction: Transaction): ContractorPortalMessageTransactionPort {
  return {
    attachments: createConversationAttachmentTransactionPort(transaction),
    findAudience: (input) => findPortalAudience(transaction, input),

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

    async forwardDriverAttachments({ attachmentIds, companyId, messageId, occurrenceId }) {
      /**
       * Spec 183 T702d: o mesmo objeto do bucket, uma linha nova de anexo. Só entra anexo cuja
       * mensagem é da conversa do **motorista** desta ocorrência, nesta empresa — o resto não conta,
       * e o caso de uso desfaz a mensagem inteira pela diferença.
       */
      const rows = await transaction.execute(sql`
        insert into occurrence_conversation_attachments
          (company_id, message_id, stored_object_id, sha256, size_bytes, content_type, file_name, duration_ms)
        select source.company_id, ${messageId}::uuid, source.stored_object_id, source.sha256,
               source.size_bytes, source.content_type, source.file_name, source.duration_ms
          from occurrence_conversation_attachments source
          join occurrence_conversation_messages message
            on message.company_id = source.company_id and message.id = source.message_id
          join occurrence_conversations conversation
            on conversation.company_id = message.company_id and conversation.id = message.conversation_id
         where source.company_id = ${companyId}::uuid
           and source.id in (${sql.join(
             attachmentIds.map((id) => sql`${id}::uuid`),
             sql`, `,
           )})
           and conversation.occurrence_id = ${occurrenceId}::uuid
           and conversation.participant = 'driver'
        returning id
      `)
      return rows.length
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
