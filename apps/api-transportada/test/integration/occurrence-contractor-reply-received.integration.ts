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
  companyQuickReplies,
  contractorMailMessages,
  contractorMailOutbox,
  contractorMailThreads,
  contractors,
  identityUserProfiles,
  nfeDocuments,
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
  occurrenceContractorReplyEvents,
  occurrenceConversationAttachments,
  occurrenceConversations,
  occurrenceConversationMessages,
  storedObjects,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { createDrizzleContractorPortalConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-portal-conversation.repository.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { deliverContractorReplyToDriver } from '../../src/occurrence-conversation/infrastructure/contractor-reply-driver-delivery.support.js'
import { deliverConversationAttachmentToDriver } from '../../src/occurrence-conversation/infrastructure/conversation-attachment-driver-delivery.support.js'
import { tripOccurrenceResolutionEvents } from '../../src/database/occurrence-conversation.schema.js'
import { buildOccurrenceTimeline } from '../../src/trips/domain/occurrence-timeline.policy.js'
import { findTripOccurrenceTimelineSources } from '../../src/trips/infrastructure/trip-occurrence-timeline.query.js'
import { queueContractorReplyAcknowledgement } from '../../src/occurrence-conversation/infrastructure/contractor-reply-acknowledgement.support.js'
import { applyContractorReplyToMessage } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-contractor-reply.repository.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { extractPdfTextLayer } from '../../src/shared/pdf-text-layer.service.js'
import { buildBoletoPdf, buildNotePdf } from '../fixtures/boleto-pdf.fixture.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  seedCompany,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

type Mode = 'forward_after_approval' | 'forward_automatic'

async function openReply(
  database: TestDatabase,
  seeded: Seeded,
  mode: Mode,
  attachmentKind: 'boleto_pdf' | 'pdf' = 'pdf',
  resolveOnDelivery = false,
  acknowledgementQuickReplyId: null | string = null,
) {
  const { companyId } = seeded.company
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({
      contractorReplyAttachmentKind: attachmentKind,
      contractorReplyMode: mode,
      contractorReplyAcknowledgementQuickReplyId: acknowledgementQuickReplyId,
      contractorReplyResolveOnDelivery: resolveOnDelivery,
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
    readonly readDocumentText?: (storedObjectId: string) => Promise<string>
  },
) {
  return database.db.transaction((transaction) =>
    applyContractorReplyToMessage(transaction, { ...input, now: new Date() }),
  )
}

/** Spec 276 T2: the number of the note the seeded occurrence sits on, as the boleto prints it. */
async function noteNumberOf(database: TestDatabase, seeded: Seeded): Promise<string> {
  const [row] = await database.db
    .select({ number: nfeDocuments.number })
    .from(tripDocumentOccurrences)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .innerJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (row === undefined) throw new Error('EXPECTED_NOTE')
  return row.number
}

/** The PDF read by the same text reader the portal uses, keyed by the stored object of the attachment. */
async function documentTextReader(
  database: TestDatabase,
  attachmentId: string,
  pdf: Uint8Array,
): Promise<(storedObjectId: string) => Promise<string>> {
  const [attachment] = await database.db
    .select({ storedObjectId: occurrenceConversationAttachments.storedObjectId })
    .from(occurrenceConversationAttachments)
    .where(eq(occurrenceConversationAttachments.id, attachmentId))
  const text = await extractPdfTextLayer(pdf)
  return async (storedObjectId) => (storedObjectId === attachment?.storedObjectId ? text : '')
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

function resolutionEventsOf(database: TestDatabase, occurrenceId: string) {
  return database.db
    .select({
      actorKind: tripOccurrenceResolutionEvents.actorKind,
      caseEventId: tripOccurrenceResolutionEvents.caseEventId,
      contractorReplyId: tripOccurrenceResolutionEvents.contractorReplyId,
      kind: tripOccurrenceResolutionEvents.kind,
    })
    .from(tripOccurrenceResolutionEvents)
    .where(eq(tripOccurrenceResolutionEvents.documentOccurrenceId, occurrenceId))
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
    '"Solicitado" sem anexo mantém o retorno aguardando; o "Segue" com o PDF depois é o aceito',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_after_approval')
        const requested = await receiveReply(database, {
          companyId,
          contentTypes: [],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: requested.messageId })

        const waiting = await replyOf(database, companyId)
        expect(waiting).toMatchObject({
          reason: null,
          replyAttachmentId: null,
          replyMessageId: null,
          status: 'awaiting_contractor',
        })
        expect(await eventsOf(database, waiting.id)).toEqual([])

        const sent = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })
        await apply(database, { companyId, conversationId, messageId: sent.messageId })

        expect(await replyOf(database, companyId)).toMatchObject({
          reason: null,
          replyAttachmentId: sent.attachmentIds[0],
          replyMessageId: sent.messageId,
          status: 'awaiting_operator',
        })
      })
    },
    30_000,
  )

  testWithPostgres(
    'boleto conferido (spec 276): o PDF que traz a linha e o número da nota é o aceito',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(
          database,
          seeded,
          'forward_after_approval',
          'boleto_pdf',
        )
        const sent = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })
        const readDocumentText = await documentTextReader(
          database,
          sent.attachmentIds[0] ?? '',
          buildBoletoPdf(await noteNumberOf(database, seeded)),
        )

        await apply(database, {
          companyId,
          conversationId,
          messageId: sent.messageId,
          readDocumentText,
        })

        const reply = await replyOf(database, companyId)
        expect(reply).toMatchObject({
          reason: null,
          replyAttachmentId: sent.attachmentIds[0],
          replyMessageId: sent.messageId,
          status: 'awaiting_operator',
        })
        /** Spec 278 CA2: o acerto da conferência fica no histórico; o retorno não tem motivo. */
        expect(await eventsOf(database, reply.id)).toEqual([
          {
            actorKind: 'system',
            actorUserId: null,
            fromStatus: 'awaiting_contractor',
            reason: 'document_confirmed',
            toStatus: 'awaiting_operator',
          },
        ])
      })
    },
    30_000,
  )

  testWithPostgres(
    'boleto conferido (spec 276): o PDF da própria nota vai ao operador como documento não confirmado',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_automatic', 'boleto_pdf')
        const sent = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })
        const readDocumentText = await documentTextReader(
          database,
          sent.attachmentIds[0] ?? '',
          buildNotePdf(await noteNumberOf(database, seeded)),
        )

        const delivery = await apply(database, {
          companyId,
          conversationId,
          messageId: sent.messageId,
          readDocumentText,
        })

        expect(delivery).toBeUndefined()
        const reply = await replyOf(database, companyId)
        expect(reply).toMatchObject({
          reason: 'document_not_confirmed',
          replyAttachmentId: null,
          replyMessageId: sent.messageId,
          status: 'needs_operator',
        })
        expect(await eventsOf(database, reply.id)).toEqual([
          {
            actorKind: 'system',
            actorUserId: null,
            fromStatus: 'awaiting_contractor',
            reason: 'document_not_confirmed',
            toStatus: 'needs_operator',
          },
        ])
        const deliveries = await database.db
          .select({ id: occurrenceContractorReplyDeliveries.id })
          .from(occurrenceContractorReplyDeliveries)
          .where(eq(occurrenceContractorReplyDeliveries.replyId, reply.id))
        expect(deliveries).toEqual([])
      })
    },
    30_000,
  )

  testWithPostgres(
    'etapas (spec 276 T3): o retorno entra na linha do tempo e a ocorrência fica aguardando o operador',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_automatic', 'boleto_pdf')
        const sent = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })
        await apply(database, {
          companyId,
          conversationId,
          messageId: sent.messageId,
          readDocumentText: await documentTextReader(
            database,
            sent.attachmentIds[0] ?? '',
            buildNotePdf(await noteNumberOf(database, seeded)),
          ),
        })

        const sources = await findTripOccurrenceTimelineSources(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        const timeline = buildOccurrenceTimeline({ sources: sources ?? [] })

        expect(
          timeline.events
            .filter((event) => event.kind === 'contractor.reply')
            .map((event) => event.kind === 'contractor.reply' && [event.toStatus, event.reason]),
        ).toEqual([
          ['awaiting_contractor', null],
          ['needs_operator', 'document_not_confirmed'],
        ])
        expect(timeline.stages.map((stage) => stage.stage)).toEqual([
          'received',
          'awaiting_contractor',
          'awaiting_operator',
        ])
        expect(timeline.stages.at(-1)).toMatchObject({
          endedAt: null,
          reason: 'document_not_confirmed',
          terminal: false,
        })
        expect(timeline.timings.resolvedAt).toBeNull()

        const foreign = await findTripOccurrenceTimelineSources(database.db, {
          companyId: other.company.companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(foreign).toBeNull()
      })
    },
    30_000,
  )

  testWithPostgres(
    'boleto conferido (spec 276): sem leitor de texto, nada segue sozinho',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_automatic', 'boleto_pdf')
        const sent = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: sent.messageId })

        const reply = await replyOf(database, companyId)
        expect(reply).toMatchObject({
          reason: 'document_not_confirmed',
          status: 'needs_operator',
        })
        /** Spec 278 CA2: sem texto lido, o histórico diz isso; o retorno segue com o motivo da decisão. */
        expect((await eventsOf(database, reply.id)).map((event) => event.reason)).toEqual([
          'document_without_text',
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

        const applied = await apply(database, {
          companyId,
          conversationId,
          messageId: received.messageId,
        })

        expect(applied).toBeUndefined()
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

async function driverMessagesOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      automatic: occurrenceConversationMessages.automatic,
      bodyText: occurrenceConversationMessages.bodyText,
      channel: occurrenceConversationMessages.channel,
      direction: occurrenceConversationMessages.direction,
      id: occurrenceConversationMessages.id,
    })
    .from(occurrenceConversationMessages)
    .innerJoin(
      occurrenceConversations,
      and(
        eq(occurrenceConversations.companyId, occurrenceConversationMessages.companyId),
        eq(occurrenceConversations.id, occurrenceConversationMessages.conversationId),
      ),
    )
    .where(
      and(
        eq(occurrenceConversations.companyId, companyId),
        eq(occurrenceConversations.participant, 'driver'),
      ),
    )
}

describe('o boleto volta ao motorista com o anexo (spec 248 T4.6, RF7/RF9)', () => {
  testWithPostgres(
    'modo automático: a resposta aceita vira mensagem no chat do motorista com o mesmo objeto do bucket',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const driverUserId = await linkDriverMembership(
          database,
          seeded.company,
          seeded.company.firstDriverId,
        )
        const conversationId = await openReply(database, seeded, 'forward_automatic')
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        const delivery = await apply(database, {
          companyId,
          conversationId,
          messageId: received.messageId,
        })

        expect((await replyOf(database, companyId)).status).toBe('delivered')
        const [message] = await driverMessagesOf(database, companyId)
        expect(delivery).toMatchObject({
          driverMessageId: message?.id,
          driverUserId,
          kind: 'delivered',
          occurrenceId: seeded.occurrenceId,
        })
        expect(delivery?.protocol).toMatch(/^[0-9]{6}-[2-9A-HJKMNP-Z]{4}$/u)
        expect(message).toMatchObject({
          automatic: true,
          bodyText: 'Segue o boleto prorrogado.',
          channel: 'app',
          direction: 'outbound',
        })
        const [source] = await database.db
          .select({ storedObjectId: occurrenceConversationAttachments.storedObjectId })
          .from(occurrenceConversationAttachments)
          .where(eq(occurrenceConversationAttachments.id, received.attachmentIds[0] ?? ''))
        const delivered = await database.db
          .select({ storedObjectId: occurrenceConversationAttachments.storedObjectId })
          .from(occurrenceConversationAttachments)
          .where(eq(occurrenceConversationAttachments.messageId, message?.id ?? ''))
        expect(delivered).toEqual([{ storedObjectId: source?.storedObjectId ?? '' }])
        const deliveries = await database.db
          .select({
            status: occurrenceContractorReplyDeliveries.status,
            target: occurrenceContractorReplyDeliveries.target,
            trigger: occurrenceContractorReplyDeliveries.trigger,
          })
          .from(occurrenceContractorReplyDeliveries)
          .where(eq(occurrenceContractorReplyDeliveries.companyId, companyId))
        expect(deliveries).toEqual([
          { status: 'sent', target: 'driver_app_chat', trigger: 'automatic' },
        ])

        const repeated = await apply(database, {
          companyId,
          conversationId,
          messageId: received.messageId,
        })
        expect(repeated).toBeUndefined()
        expect(await driverMessagesOf(database, companyId)).toHaveLength(1)
        expect(await resolutionEventsOf(database, seeded.occurrenceId)).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'fechar sozinha (spec 276 T3b): a entrega ao motorista deixa a ocorrência solucionada, uma vez',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await linkDriverMembership(database, seeded.company, seeded.company.firstDriverId)
        const conversationId = await openReply(database, seeded, 'forward_automatic', 'pdf', true)
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        const delivery = await apply(database, {
          companyId,
          conversationId,
          messageId: received.messageId,
        })

        expect(delivery).toMatchObject({ kind: 'delivered', resolvedOccurrence: true })
        const { id: replyId } = await replyOf(database, companyId)
        expect(await resolutionEventsOf(database, seeded.occurrenceId)).toEqual([
          { actorKind: 'system', caseEventId: null, contractorReplyId: replyId, kind: 'resolved' },
        ])

        const again = await database.db.transaction((transaction) =>
          deliverContractorReplyToDriver(transaction, {
            actorUserId: null,
            companyId,
            now: new Date(),
            replyId,
            trigger: 'automatic',
          }),
        )
        expect(again).toEqual({ kind: 'already_delivered' })
        expect(await resolutionEventsOf(database, seeded.occurrenceId)).toHaveLength(1)

        const sources = await findTripOccurrenceTimelineSources(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        const timeline = buildOccurrenceTimeline({ sources: sources ?? [] })
        expect(timeline.stages.map((stage) => stage.stage).slice(-2)).toEqual([
          'delivered',
          'resolved',
        ])
        expect(timeline.timings.resolvedAt).not.toBeNull()
        expect(timeline.events.at(-1)).toMatchObject({
          kind: 'resolution.resolved',
          phraseKey: 'contractor_reply_delivered',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'pelo adaptador do portal: devolve o necessário ao aviso, com o rótulo da ocorrência',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const driverUserId = await linkDriverMembership(
          database,
          seeded.company,
          seeded.company.firstDriverId,
        )
        const conversationId = await openReply(database, seeded, 'forward_automatic')
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        const delivery = await createDrizzleContractorPortalConversationUnitOfWork(
          database.db,
        ).execute((transaction) =>
          transaction.applyContractorReply({
            companyId,
            conversationId,
            messageId: received.messageId,
            now: new Date(),
          }),
        )

        const [message] = await driverMessagesOf(database, companyId)
        expect(delivery).toMatchObject({
          messageId: message?.id,
          occurrenceId: seeded.occurrenceId,
          recipientUserId: driverUserId,
        })
        expect(delivery?.occurrenceLabel).not.toBe('')
      })
    },
    60_000,
  )

  testWithPostgres(
    'com aprovação: o operador entrega uma vez; repetir não manda de novo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await linkDriverMembership(database, seeded.company, seeded.company.firstDriverId)
        const conversationId = await openReply(database, seeded, 'forward_after_approval')
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })
        const applied = await apply(database, {
          companyId,
          conversationId,
          messageId: received.messageId,
        })
        expect(applied).toBeUndefined()
        const reply = await replyOf(database, companyId)
        expect(reply.status).toBe('awaiting_operator')
        expect(await driverMessagesOf(database, companyId)).toEqual([])

        const deliver = () =>
          database.db.transaction((transaction) =>
            deliverContractorReplyToDriver(transaction, {
              actorUserId: seeded.company.userId,
              companyId,
              now: new Date(),
              replyId: reply.id,
              trigger: 'operator',
            }),
          )
        expect((await deliver()).kind).toBe('delivered')
        expect((await deliver()).kind).toBe('already_delivered')

        expect((await replyOf(database, companyId)).status).toBe('delivered')
        const messages = await driverMessagesOf(database, companyId)
        expect(messages).toHaveLength(1)
        expect(messages[0]).toMatchObject({ automatic: false, channel: 'app' })
      })
    },
    60_000,
  )

  testWithPostgres(
    'motorista sem conta: a entrega fica registrada como pulada e o retorno não muda',
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
        expect(await driverMessagesOf(database, companyId)).toEqual([])
        const deliveries = await database.db
          .select({
            reason: occurrenceContractorReplyDeliveries.reason,
            status: occurrenceContractorReplyDeliveries.status,
          })
          .from(occurrenceContractorReplyDeliveries)
          .where(eq(occurrenceContractorReplyDeliveries.companyId, companyId))
        expect(deliveries).toEqual([{ reason: 'driver_without_account', status: 'skipped' }])
      })
    },
    60_000,
  )

  testWithPostgres(
    'sem retorno: o arquivo escolhido vai ao motorista uma vez, com o mesmo objeto, sem linha de entrega',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await linkDriverMembership(database, seeded.company, seeded.company.firstDriverId)
        const [contractor] = await database.db
          .select({ id: contractors.id })
          .from(contractors)
          .where(eq(contractors.companyId, companyId))
        const [conversation] = await database.db
          .insert(occurrenceConversations)
          .values({
            companyId,
            contractorId: contractor?.id ?? '',
            occurrenceId: seeded.occurrenceId,
            occurrenceKind: 'document',
            participant: 'contractor',
            publicRef: crypto.randomUUID().replaceAll('-', ''),
          })
          .returning({ id: occurrenceConversations.id })
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId: conversation?.id ?? '',
        })
        const attachmentId = received.attachmentIds[0] ?? ''

        const deliver = (occurrenceId: string) =>
          database.db.transaction((transaction) =>
            deliverConversationAttachmentToDriver(transaction, {
              actorUserId: seeded.company.userId,
              attachmentId,
              bodyText: 'Segue a requisição: Devolução',
              companyId,
              now: new Date(),
              occurrenceId,
            }),
          )
        expect(await deliver(crypto.randomUUID())).toEqual({
          kind: 'skipped',
          reason: 'attachment_not_found',
        })
        expect((await deliver(seeded.occurrenceId)).kind).toBe('delivered')
        expect((await deliver(seeded.occurrenceId)).kind).toBe('already_delivered')

        const messages = await driverMessagesOf(database, companyId)
        expect(messages).toHaveLength(1)
        expect(messages[0]).toMatchObject({
          automatic: false,
          bodyText: 'Segue a requisição: Devolução',
          channel: 'app',
          direction: 'outbound',
        })
        const [source] = await database.db
          .select({ storedObjectId: occurrenceConversationAttachments.storedObjectId })
          .from(occurrenceConversationAttachments)
          .where(eq(occurrenceConversationAttachments.id, attachmentId))
        const delivered = await database.db
          .select({ storedObjectId: occurrenceConversationAttachments.storedObjectId })
          .from(occurrenceConversationAttachments)
          .where(eq(occurrenceConversationAttachments.messageId, messages[0]?.id ?? ''))
        expect(delivered).toEqual([{ storedObjectId: source?.storedObjectId ?? '' }])
        expect(
          await database.db
            .select({ id: occurrenceContractorReplyDeliveries.id })
            .from(occurrenceContractorReplyDeliveries)
            .where(eq(occurrenceContractorReplyDeliveries.companyId, companyId)),
        ).toEqual([])
      })
    },
    60_000,
  )
})

async function seedQuickReply(
  database: TestDatabase,
  companyId: string,
  overrides: { readonly active?: boolean; readonly audience?: 'contractor' | 'driver' } = {},
): Promise<string> {
  const [row] = await database.db
    .insert(companyQuickReplies)
    .values({
      active: overrides.active ?? true,
      audience: overrides.audience ?? 'contractor',
      bodyText: 'Recebido, obrigado.',
      companyId,
      position: 0,
    })
    .returning({ id: companyQuickReplies.id })
  if (row === undefined) throw new Error('EXPECTED_QUICK_REPLY')
  return row.id
}

function acknowledgementsOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      address: occurrenceContractorReplyDeliveries.address,
      mailMessageId: occurrenceContractorReplyDeliveries.mailMessageId,
      status: occurrenceContractorReplyDeliveries.status,
      trigger: occurrenceContractorReplyDeliveries.trigger,
    })
    .from(occurrenceContractorReplyDeliveries)
    .where(
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, companyId),
        eq(occurrenceContractorReplyDeliveries.target, 'contractor_acknowledgement'),
      ),
    )
}

describe('a resposta automática à contratante (spec 276 T5)', () => {
  testWithPostgres(
    'documento entregue ao motorista: a contratante recebe a resposta rápida do tipo, uma vez, na mesma thread',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await linkDriverMembership(database, seeded.company, seeded.company.firstDriverId)
        const quickReplyId = await seedQuickReply(database, companyId)
        const conversationId = await openReply(
          database,
          seeded,
          'forward_automatic',
          'pdf',
          false,
          quickReplyId,
        )
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        const delivery = await apply(database, {
          companyId,
          conversationId,
          messageId: received.messageId,
        })

        expect(delivery).toMatchObject({ kind: 'delivered' })
        const [acknowledgement, ...others] = await acknowledgementsOf(database, companyId)
        expect(others).toEqual([])
        expect(acknowledgement).toMatchObject({ status: 'queued', trigger: 'automatic' })
        const [mail] = await database.db
          .select({
            bodyText: contractorMailMessages.bodyText,
            direction: contractorMailMessages.direction,
            threadId: contractorMailMessages.threadId,
            toAddresses: contractorMailMessages.toAddresses,
          })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.id, acknowledgement?.mailMessageId ?? ''))
        expect(mail?.direction).toBe('outbound')
        expect(mail?.toAddresses).toEqual(['compras@alfa.example.test'])
        expect(mail?.bodyText.startsWith('Recebido, obrigado.')).toBe(true)
        const threadMessages = await database.db
          .select({ id: contractorMailMessages.id })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.threadId, mail?.threadId ?? ''))
        expect(threadMessages.length).toBeGreaterThan(1)
        const outbox = await database.db
          .select({ eventType: contractorMailOutbox.eventType })
          .from(contractorMailOutbox)
          .where(eq(contractorMailOutbox.messageId, acknowledgement?.mailMessageId ?? ''))
        expect(outbox).toEqual([{ eventType: 'message.send.requested' }])
        const chat = await database.db
          .select({
            automatic: occurrenceConversationMessages.automatic,
            bodyText: occurrenceConversationMessages.bodyText,
            channel: occurrenceConversationMessages.channel,
          })
          .from(occurrenceConversationMessages)
          .where(
            and(
              eq(occurrenceConversationMessages.conversationId, conversationId),
              eq(
                occurrenceConversationMessages.mailMessageId,
                acknowledgement?.mailMessageId ?? '',
              ),
            ),
          )
        expect(chat).toEqual([
          { automatic: true, bodyText: 'Recebido, obrigado.', channel: 'email' },
        ])

        const { id: replyId } = await replyOf(database, companyId)
        const again = await database.db.transaction((transaction) =>
          queueContractorReplyAcknowledgement(transaction, { companyId, replyId }),
        )
        expect(again).toEqual({ kind: 'already_queued' })
        expect(await acknowledgementsOf(database, companyId)).toHaveLength(1)
      })
    },
    60_000,
  )

  testWithPostgres(
    'desligada, ou com a resposta rápida desativada, nada sai para a contratante',
    async () => {
      for (const quickReply of ['off', 'inactive'] as const) {
        await withConversationDatabase(async (database) => {
          const seeded = await seedMailScenario(database)
          const { companyId } = seeded.company
          await linkDriverMembership(database, seeded.company, seeded.company.firstDriverId)
          const quickReplyId =
            quickReply === 'off'
              ? null
              : await seedQuickReply(database, companyId, { active: false })
          const conversationId = await openReply(
            database,
            seeded,
            'forward_automatic',
            'pdf',
            false,
            quickReplyId,
          )
          const received = await receiveReply(database, {
            companyId,
            contentTypes: ['application/pdf'],
            conversationId,
          })

          const delivery = await apply(database, {
            companyId,
            conversationId,
            messageId: received.messageId,
          })

          expect(delivery).toMatchObject({ kind: 'delivered' })
          expect(await acknowledgementsOf(database, companyId)).toEqual([])
        })
      }
    },
    60_000,
  )

  testWithPostgres(
    'aguardando o operador aprovar, a contratante não recebe nada ainda',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await linkDriverMembership(database, seeded.company, seeded.company.firstDriverId)
        const quickReplyId = await seedQuickReply(database, companyId)
        const conversationId = await openReply(
          database,
          seeded,
          'forward_after_approval',
          'pdf',
          false,
          quickReplyId,
        )
        const received = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: received.messageId })

        expect((await replyOf(database, companyId)).status).toBe('awaiting_operator')
        expect(await acknowledgementsOf(database, companyId)).toEqual([])
      })
    },
    60_000,
  )
})

/** Spec 278: o motorista com nome no cadastro, como a linha do tempo o mostra. */
async function linkNamedDriver(database: TestDatabase, seeded: Seeded): Promise<string> {
  const userId = await linkDriverMembership(database, seeded.company, seeded.company.firstDriverId)
  await database.db.insert(identityUserProfiles).values({
    contactAddress: 'motorista@example.test',
    contactChannel: 'email',
    email: 'motorista@example.test',
    name: 'Motorista Sintético',
    phone: '',
    taxId: '',
    userId,
    username: `motorista-${userId.slice(0, 8)}`,
  })
  return userId
}

/** Spec 278 D6: o e-mail "Solicitado" como o worker o grava — a mensagem da 143 e a da conversa, sem anexo. */
async function receiveMailWithoutAttachment(
  database: TestDatabase,
  seeded: Seeded,
  conversationId: string,
): Promise<string> {
  const { companyId } = seeded.company
  const [thread] = await database.db
    .select({ id: contractorMailThreads.id })
    .from(contractorMailThreads)
    .where(
      and(
        eq(contractorMailThreads.companyId, companyId),
        eq(contractorMailThreads.subjectId, seeded.occurrenceId),
      ),
    )
  if (thread === undefined) throw new Error('EXPECTED_MAIL_THREAD')
  const [mail] = await database.db
    .insert(contractorMailMessages)
    .values({
      bodyText: 'Solicitado',
      companyId,
      direction: 'inbound',
      fromAddress: 'compras@alfa.example.test',
      interpretation: 'message',
      subject: 'RE: ocorrência',
      threadId: thread.id,
      toAddresses: ['ocorrencias@example.test'],
    })
    .returning({ id: contractorMailMessages.id })
  if (mail === undefined) throw new Error('EXPECTED_MAIL')
  const [message] = await database.db
    .insert(occurrenceConversationMessages)
    .values({
      bodyText: 'Solicitado',
      channel: 'email',
      companyId,
      conversationId,
      direction: 'inbound',
      mailMessageId: mail.id,
      senderAddress: 'compras@alfa.example.test',
    })
    .returning({ id: occurrenceConversationMessages.id })
  if (message === undefined) throw new Error('EXPECTED_MESSAGE')
  return message.id
}

async function timelineOf(database: TestDatabase, companyId: string, occurrenceId: string) {
  const sources = await findTripOccurrenceTimelineSources(database.db, { companyId, occurrenceId })
  return buildOccurrenceTimeline({ sources: sources ?? [] })
}

describe('a linha do tempo mostra o automático (spec 278 CA4)', () => {
  testWithPostgres(
    'boleto conferido, entregue ao motorista pelo app e lido por ele',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedMailScenario(database)
        const { companyId } = seeded.company
        await linkNamedDriver(database, seeded)
        const conversationId = await openReply(database, seeded, 'forward_automatic', 'boleto_pdf')
        const noteNumber = await noteNumberOf(database, seeded)
        const requestedMessageId = await receiveMailWithoutAttachment(
          database,
          seeded,
          conversationId,
        )
        await apply(database, { companyId, conversationId, messageId: requestedMessageId })
        const sent = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })
        const delivered = await apply(database, {
          companyId,
          conversationId,
          messageId: sent.messageId,
          readDocumentText: await documentTextReader(
            database,
            sent.attachmentIds[0] ?? '',
            buildBoletoPdf(noteNumber),
          ),
        })
        expect(delivered?.kind).toBe('delivered')
        // Depois da entrega gravada agora: data fixa vira bomba-relógio quando o relógio passa dela.
        const readAt = new Date(Date.now() + 60_000).toISOString()
        await database.db
          .update(occurrenceConversationMessages)
          .set({ status: 'read', statusTimes: { queued: readAt, read: readAt } })
          .where(eq(occurrenceConversationMessages.id, delivered?.driverMessageId ?? ''))

        const timeline = await timelineOf(database, companyId, seeded.occurrenceId)

        const received = timeline.events.find((event) => event.kind === 'contractor.mail.received')
        expect(received).toMatchObject({ attachmentCount: 0, awaitingAttachment: true })
        const check = timeline.events.find((event) => event.kind === 'contractor.reply.document')
        expect(check).toMatchObject({
          actor: { kind: 'system', name: null },
          invoiceNumber: noteNumber,
          isKey: true,
          result: 'confirmed',
          toStatus: 'reply_received',
        })
        const delivery = timeline.events.find((event) => event.kind === 'contractor.reply.delivery')
        expect(delivery).toMatchObject({
          actor: { kind: 'system', name: null },
          attempt: 1,
          channel: 'app_chat',
          documentKind: 'boleto',
          driverName: 'Motorista Sintético',
          isKey: true,
          reason: null,
          status: 'sent',
        })
        const read = timeline.events.find((event) => event.kind === 'contractor.reply.driver_read')
        expect(read).toMatchObject({
          actor: { kind: 'driver', name: 'Motorista Sintético' },
          documentKind: 'boleto',
          occurredAt: readAt,
        })
        const automatic = timeline.events
          .map((event) => event.kind)
          .filter((kind) => kind.startsWith('contractor.reply.'))
        expect(automatic).toEqual([
          'contractor.reply.document',
          'contractor.reply.delivery',
          'contractor.reply.driver_read',
        ])
        expect(JSON.stringify(timeline)).not.toContain('example.test')

        expect(
          await findTripOccurrenceTimelineSources(database.db, {
            companyId: other.company.companyId,
            occurrenceId: seeded.occurrenceId,
          }),
        ).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'motorista sem conta: a entrega falha com o motivo e a tentativa; nada de leitura',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_automatic')
        const sent = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: sent.messageId })

        const timeline = await timelineOf(database, companyId, seeded.occurrenceId)
        expect(
          timeline.events.filter((event) => event.kind === 'contractor.reply.delivery'),
        ).toMatchObject([
          {
            attempt: 1,
            documentKind: 'document',
            driverName: null,
            isKey: false,
            reason: 'driver_without_account',
            status: 'skipped',
          },
        ])
        expect(timeline.events.some((event) => event.kind === 'contractor.reply.document')).toBe(
          false,
        )
        expect(timeline.events.some((event) => event.kind === 'contractor.reply.driver_read')).toBe(
          false,
        )
      })
    },
    60_000,
  )

  testWithPostgres(
    'PDF sem texto: "boleto não conferido" sem texto, e a etapa diz o motivo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const conversationId = await openReply(database, seeded, 'forward_automatic', 'boleto_pdf')
        const sent = await receiveReply(database, {
          companyId,
          contentTypes: ['application/pdf'],
          conversationId,
        })

        await apply(database, { companyId, conversationId, messageId: sent.messageId })

        const timeline = await timelineOf(database, companyId, seeded.occurrenceId)
        expect(
          timeline.events.filter((event) => event.kind === 'contractor.reply.document'),
        ).toMatchObject([{ isKey: false, result: 'without_text', toStatus: 'needs_operator' }])
        expect(timeline.stages.at(-1)).toMatchObject({
          reason: 'document_without_text',
          stage: 'awaiting_operator',
        })
      })
    },
    60_000,
  )
})
