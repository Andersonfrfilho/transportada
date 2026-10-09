/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.5, contra Postgres real: a resposta da contratante que chega à conversa move o retorno.
 * Anexo aceito (PDF; confirmado pelos bytes, o tipo gravado) leva a `awaiting_operator` ou, no modo
 * automático, a `reply_received`; sem anexo aceito ou com mais de um vai ao operador com o motivo.
 * Resposta repetida e retorno de outra empresa não mudam nada (CA09). A entrega ao motorista é a T4.6.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  occurrenceContractorReplies,
  occurrenceContractorReplyEvents,
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  storedObjects,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { applyContractorReplyToMessage } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-contractor-reply.repository.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

type Mode = 'forward_after_approval' | 'forward_automatic'

async function openReply(database: TestDatabase, seeded: Seeded, mode: Mode) {
  const { companyId } = seeded.company
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({
      contractorReplyMode: mode,
      contractorReplyWaitHours: 6,
      driverReplyTemplate: 'Segue o boleto prorrogado.',
      emailsContractor: true,
    })
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''),
      ),
    )
  await createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  }).send({
    companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
  })
  const [reply] = await database.db
    .select({ conversationId: occurrenceContractorReplies.conversationId })
    .from(occurrenceContractorReplies)
    .where(eq(occurrenceContractorReplies.companyId, companyId))
  if (reply === undefined) throw new Error('EXPECTED_OPEN_REPLY')
  return reply.conversationId
}

/** The contractor's answer as the conversation keeps it: one inbound message and its attachments. */
async function receiveReply(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly contentTypes: readonly string[]
    readonly conversationId: string
  },
): Promise<{ readonly attachmentIds: readonly string[]; readonly messageId: string }> {
  const [message] = await database.db
    .insert(occurrenceConversationMessages)
    .values({
      bodyText: 'Segue o boleto.',
      channel: 'email',
      companyId: input.companyId,
      conversationId: input.conversationId,
      direction: 'inbound',
      senderAddress: 'compras@alfa.example.test',
    })
    .returning({ id: occurrenceConversationMessages.id })
  if (message === undefined) throw new Error('EXPECTED_MESSAGE')
  const attachmentIds: string[] = []
  for (const contentType of input.contentTypes) {
    const [object] = await database.db
      .insert(storedObjects)
      .values({
        bucket: 'bucket-privado',
        companyId: input.companyId,
        mimeType: contentType,
        objectKey: `occurrence-conversations/${crypto.randomUUID()}`,
        provider: 's3',
        purpose: 'occurrence_conversation_attachment',
        sha256: 'b'.repeat(64),
        sizeBytes: 12n,
        status: 'final',
      })
      .returning({ id: storedObjects.id })
    const [attachment] = await database.db
      .insert(occurrenceConversationAttachments)
      .values({
        companyId: input.companyId,
        contentType,
        fileName: 'boleto',
        messageId: message.id,
        sha256: 'b'.repeat(64),
        sizeBytes: 12,
        storedObjectId: object?.id ?? '',
      })
      .returning({ id: occurrenceConversationAttachments.id })
    attachmentIds.push(attachment?.id ?? '')
  }
  return { attachmentIds, messageId: message.id }
}

function apply(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly conversationId: string
    readonly messageId: string
  },
) {
  return database.db.transaction((transaction) =>
    applyContractorReplyToMessage(transaction, { ...input, now: new Date() }),
  )
}

async function replyOf(database: TestDatabase, companyId: string) {
  const [reply] = await database.db
    .select({
      id: occurrenceContractorReplies.id,
      reason: occurrenceContractorReplies.reason,
      replyAttachmentId: occurrenceContractorReplies.replyAttachmentId,
      replyMessageId: occurrenceContractorReplies.replyMessageId,
      status: occurrenceContractorReplies.status,
    })
    .from(occurrenceContractorReplies)
    .where(eq(occurrenceContractorReplies.companyId, companyId))
  if (reply === undefined) throw new Error('EXPECTED_REPLY')
  return reply
}

function eventsOf(database: TestDatabase, replyId: string) {
  return database.db
    .select({
      actorKind: occurrenceContractorReplyEvents.actorKind,
      actorUserId: occurrenceContractorReplyEvents.actorUserId,
      fromStatus: occurrenceContractorReplyEvents.fromStatus,
      reason: occurrenceContractorReplyEvents.reason,
      toStatus: occurrenceContractorReplyEvents.toStatus,
    })
    .from(occurrenceContractorReplyEvents)
    .where(eq(occurrenceContractorReplyEvents.replyId, replyId))
}

describe('a resposta da contratante move o retorno (spec 248 T4.5, CA02)', () => {
  testWithPostgres(
    'PDF no modo com aprovação: awaiting_operator com o anexo e o evento do sistema',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_after_approval')
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: received.messageId })

        const reply = await replyOf(database, companyId)
        expect(reply).toMatchObject({
          reason: null,
          replyAttachmentId: received.attachmentIds[0],
          replyMessageId: received.messageId,
          status: 'awaiting_operator',
        })
        expect(await eventsOf(database, reply.id)).toEqual([
          {
            actorKind: 'system',
            actorUserId: null,
            fromStatus: 'awaiting_contractor',
            reason: null,
            toStatus: 'awaiting_operator',
          },
        ])
      })
    },
    30_000,
  )

  testWithPostgres(
    'PDF no modo automático: reply_received, pronto para a entrega',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_automatic')
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: received.messageId })

        expect((await replyOf(database, companyId)).status).toBe('reply_received')
      })
    },
    30_000,
  )

  testWithPostgres(
    'sem anexo aceito e com mais de um vão ao operador com o motivo; o anexo não é escolhido',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_automatic')
        const photoOnly = await receiveReply(database, {
          companyId,
          contentTypes: ['image/jpeg'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: photoOnly.messageId })

        const reply = await replyOf(database, companyId)
        expect(reply).toMatchObject({
          reason: 'no_accepted_attachment',
          replyAttachmentId: null,
          replyMessageId: photoOnly.messageId,
          status: 'needs_operator',
        })
        expect(await eventsOf(database, reply.id)).toMatchObject([
          { reason: 'no_accepted_attachment', toStatus: 'needs_operator' },
        ])
      })

      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_automatic')
        const two = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf', 'application/pdf'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: two.messageId })

        expect(await replyOf(database, companyId)).toMatchObject({
          reason: 'multiple_attachments',
          replyAttachmentId: null,
          status: 'needs_operator',
        })
      })
    },
    30_000,
  )

  testWithPostgres(
    'segunda resposta não muda nada: a primeira decide e o histórico tem uma linha',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_after_approval')
        const first = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })
        const second = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: first.messageId })
        await apply(database, { companyId, conversationId, messageId: second.messageId })
        await apply(database, { companyId, conversationId, messageId: first.messageId })

        const reply = await replyOf(database, companyId)
        expect(reply.replyMessageId).toBe(first.messageId)
        expect(reply.replyAttachmentId).toBe(first.attachmentIds[0] ?? null)
        expect(await eventsOf(database, reply.id)).toHaveLength(1)
      })
    },
    30_000,
  )

  testWithPostgres(
    'CA09: outra empresa não move o retorno, nem por conversa nem por mensagem alheias',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedCompany(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_after_approval')
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        await apply(database, {
          companyId: other.companyId,
          conversationId,
          messageId: received.messageId,
        })

        const reply = await replyOf(database, companyId)
        expect(reply.status).toBe('awaiting_contractor')
        expect(await eventsOf(database, reply.id)).toEqual([])
      })
    },
    30_000,
  )

  testWithPostgres(
    'retorno que ninguém abriu (modo desligado) deixa a mensagem só na conversa',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_after_approval')
        await database.db
          .delete(occurrenceContractorReplies)
          .where(eq(occurrenceContractorReplies.companyId, companyId))
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: received.messageId })

        expect(
          await database.db
            .select({ id: occurrenceContractorReplies.id })
            .from(occurrenceContractorReplies)
            .where(eq(occurrenceContractorReplies.companyId, companyId)),
        ).toEqual([])
      })
    },
    30_000,
  )
})
