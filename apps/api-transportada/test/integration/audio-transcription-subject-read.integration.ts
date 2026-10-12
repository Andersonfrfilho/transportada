/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3 (contract.md §5.2–5.3), contra Postgres real — a leitura da transcrição pelas rotas por assunto:
 * - consultas constantes por página (nenhuma a mais sem áudio; configuração + linhas com áudio, qualquer que seja o
 *   número de áudios; só a configuração com a empresa desligada);
 * - empresa que desligou, sem nenhuma linha de transcrição, ainda lê `disabled`;
 * - `transcriptionUpdatedAt` do resumo muda quando a linha passa de `pending` a `ready`, sem junção, uma agregação por página;
 * - isolamento: a linha de outra empresa nunca aparece.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  companyAudioTranscriptionSettings,
  occurrenceConversationAttachments,
  occurrenceConversationAudioTranscriptions,
  occurrenceConversations,
  storedObjects,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { createListMySubjectMessagesUseCase } from '../../src/occurrence-conversation/application/list-my-subject-messages.use-case.js'
import type { DriverSubjectUnitOfWorkPort } from '../../src/occurrence-conversation/application/driver-conversation-subject.port.js'
import { SIGNING_ATTACHMENT_STORAGE } from '../fixtures/conversation-attachment.fixture.js'
import {
  countQueries,
  createSubjectHarness,
  insertSubjectMessage,
  SUBJECT_NOW,
} from '../fixtures/driver-subject-conversation-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  seedExtraDocument,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'
import { firstTripOf } from '../fixtures/driver-subject-conversation-database.fixture.js'

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 12, 12, minutes))

async function scenario(database: TestDatabase, extraDocuments: number) {
  const seeded = await seedMailScenario(database)
  const { company } = seeded
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const actor = { companyId: company.companyId, driverId: company.firstDriverId, driverUserId }
  const tripId = await firstTripOf(database.db, company)
  const links = await database.db
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(eq(tripDocuments.companyId, company.companyId))
  const extra = await Promise.all(
    Array.from({ length: extraDocuments }, () =>
      seedExtraDocument(
        database,
        company,
        { documentId: '', stopId: '', tripId },
        { separationStatus: 'loaded' },
      ),
    ),
  )
  return { actor, company, documentIds: [...links.map((link) => link.id), ...extra] }
}

type Scenario = Awaited<ReturnType<typeof scenario>>

/** Abre a conversa da nota e grava uma mensagem do motorista; devolve os ids que as próximas etapas usam. */
async function conversationWithMessage(
  database: TestDatabase,
  world: Scenario,
  documentId: string,
) {
  const harness = createSubjectHarness(database.db)
  await harness.open.open({ ...world.actor, subjectId: documentId, subjectType: 'document' })
  const [conversation] = await database.db
    .select({ id: occurrenceConversations.id })
    .from(occurrenceConversations)
    .where(eq(occurrenceConversations.tripDocumentId, documentId))
  if (conversation === undefined) throw new Error('EXPECTED_CONVERSATION')
  const messageId = await insertSubjectMessage(database.db, {
    body: 'áudio',
    conversationId: conversation.id,
    createdAt: at(1),
    direction: 'inbound',
    driverUserId: world.actor.driverUserId,
    operatorUserId: world.company.userId,
  })
  return { conversationId: conversation.id, documentId, messageId }
}

async function addAttachment(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly contentType: string
    readonly durationMs?: number
    readonly messageId: string
  },
): Promise<string> {
  const storedObjectId = crypto.randomUUID()
  await database.db.insert(storedObjects).values({
    bucket: 'bucket-privado',
    companyId: input.companyId,
    id: storedObjectId,
    mimeType: input.contentType,
    objectKey: `occurrence-conversations/${crypto.randomUUID()}`,
    provider: 's3',
    purpose: 'occurrence_conversation_attachment',
    sha256: 'b'.repeat(64),
    sizeBytes: 12n,
    status: 'final',
  })
  const [attachment] = await database.db
    .insert(occurrenceConversationAttachments)
    .values({
      companyId: input.companyId,
      contentType: input.contentType,
      durationMs: input.durationMs ?? null,
      fileName: input.contentType.startsWith('audio/') ? 'voz.ogg' : 'foto.jpg',
      messageId: input.messageId,
      sha256: 'b'.repeat(64),
      sizeBytes: 12,
      storedObjectId,
    })
    .returning({ id: occurrenceConversationAttachments.id })
  if (attachment === undefined) throw new Error('EXPECTED_ATTACHMENT')
  return attachment.id
}

async function addTranscription(
  database: TestDatabase,
  input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly conversationId: string
    readonly status: 'pending' | 'ready'
    readonly updatedAt: Date
  },
): Promise<void> {
  const isReady = input.status === 'ready'
  await database.db.insert(occurrenceConversationAudioTranscriptions).values({
    attachmentId: input.attachmentId,
    audioDurationMs: 4200,
    companyId: input.companyId,
    conversationId: input.conversationId,
    engine: isReady ? 'whisper-local' : null,
    generatedAt: isReady ? input.updatedAt : null,
    language: isReady ? 'pt' : null,
    status: input.status,
    text: isReady ? 'Cheguei na doca.' : null,
    updatedAt: input.updatedAt,
  })
}

function messagesUseCase(database: TestDatabase['db'], unitOfWork?: DriverSubjectUnitOfWorkPort) {
  const harness = createSubjectHarness(database)
  return createListMySubjectMessagesUseCase({
    clock: () => SUBJECT_NOW,
    storage: SIGNING_ATTACHMENT_STORAGE,
    unitOfWork: unitOfWork ?? harness.unitOfWork,
  })
}

async function measureMessages(
  database: TestDatabase,
  world: Scenario,
  documentId: string,
): Promise<{ readonly attachments: readonly unknown[]; readonly queries: number }> {
  const meter = countQueries(database.db)
  const messages = await messagesUseCase(
    meter.counted,
    createSubjectHarness(meter.counted).unitOfWork,
  ).list({ ...world.actor, subjectId: documentId, subjectType: 'document' })
  return {
    attachments: messages.flatMap((message) => message.attachments),
    queries: meter.queries(),
  }
}

describe('a transcrição nas mensagens por assunto contra Postgres (spec 264 T2.3)', () => {
  testWithPostgres(
    'consultas constantes: +0 sem áudio, +2 com áudio (qualquer número), +1 com a empresa desligada',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await scenario(database, 2)
        const companyId = world.company.companyId
        const [plainDocument, fewDocument, manyDocument] = world.documentIds
        if (
          plainDocument === undefined ||
          fewDocument === undefined ||
          manyDocument === undefined
        ) {
          throw new Error('EXPECTED_DOCUMENTS')
        }
        const plain = await conversationWithMessage(database, world, plainDocument)
        await addAttachment(database, {
          companyId,
          contentType: 'image/jpeg',
          messageId: plain.messageId,
        })

        const few = await conversationWithMessage(database, world, fewDocument)
        const readyId = await addAttachment(database, {
          companyId,
          contentType: 'audio/ogg',
          messageId: few.messageId,
        })
        await addAttachment(database, {
          companyId,
          contentType: 'image/jpeg',
          messageId: few.messageId,
        })
        await addTranscription(database, {
          attachmentId: readyId,
          companyId,
          conversationId: few.conversationId,
          status: 'ready',
          updatedAt: at(5),
        })

        const many = await conversationWithMessage(database, world, manyDocument)
        for (let index = 0; index < 6; index += 1) {
          await addAttachment(database, {
            companyId,
            contentType: 'audio/mp4',
            durationMs: 1000 + index,
            messageId: many.messageId,
          })
        }

        const withoutAudio = await measureMessages(database, world, plainDocument)
        const oneAudio = await measureMessages(database, world, fewDocument)
        const sixAudios = await measureMessages(database, world, manyDocument)
        expect(oneAudio.queries).toBe(withoutAudio.queries + 2)
        expect(sixAudios.queries).toBe(withoutAudio.queries + 2)

        const ready = oneAudio.attachments.find(
          (found) => (found as { contentType: string }).contentType === 'audio/ogg',
        )
        expect(ready).toMatchObject({
          durationMs: 4200,
          transcription: { language: 'pt', status: 'ready', text: 'Cheguei na doca.' },
        })
        expect(
          sixAudios.attachments
            .map((found) => (found as { durationMs?: number }).durationMs)
            .toSorted(),
        ).toEqual([1000, 1001, 1002, 1003, 1004, 1005])
        expect(
          sixAudios.attachments.every((found) => !('transcription' in (found as object))),
        ).toBe(true)

        await database.db
          .insert(companyAudioTranscriptionSettings)
          .values({ companyId, enabled: false })
        const disabled = await measureMessages(database, world, fewDocument)
        expect(disabled.queries).toBe(withoutAudio.queries + 1)
      })
    },
    240_000,
  )

  testWithPostgres(
    'empresa que desligou, sem nenhuma linha de transcrição, lê disabled; a de imagem fica igual',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await scenario(database, 0)
        const companyId = world.company.companyId
        const [documentId] = world.documentIds
        if (documentId === undefined) throw new Error('EXPECTED_DOCUMENT')
        const conversation = await conversationWithMessage(database, world, documentId)
        await addAttachment(database, {
          companyId,
          contentType: 'audio/ogg',
          messageId: conversation.messageId,
        })
        await addAttachment(database, {
          companyId,
          contentType: 'image/jpeg',
          messageId: conversation.messageId,
        })
        await database.db
          .insert(companyAudioTranscriptionSettings)
          .values({ companyId, enabled: false })

        const { attachments } = await measureMessages(database, world, documentId)
        const audio = attachments.find(
          (found) => (found as { contentType: string }).contentType === 'audio/ogg',
        )
        const image = attachments.find(
          (found) => (found as { contentType: string }).contentType === 'image/jpeg',
        )
        expect(audio).toMatchObject({ transcription: { status: 'disabled' } })
        expect(image).not.toHaveProperty('transcription')
        expect(image).not.toHaveProperty('durationMs')
      })
    },
    240_000,
  )

  testWithPostgres(
    'transcriptionUpdatedAt no resumo muda quando a linha passa de pending a ready, com uma agregação por página',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await scenario(database, 2)
        const companyId = world.company.companyId
        const harness = createSubjectHarness(database.db)
        const conversations = await Promise.all(
          world.documentIds.map((documentId, index) =>
            conversationWithMessage(database, world, documentId).then((found) => ({
              ...found,
              index,
            })),
          ),
        )
        const first = conversations[0]
        if (first === undefined) throw new Error('EXPECTED_CONVERSATION')
        const audioId = await addAttachment(database, {
          companyId,
          contentType: 'audio/ogg',
          messageId: first.messageId,
        })
        const updatedAtOf = async (conversationId: string) =>
          (await harness.list.list({ ...world.actor, cursor: null })).data.find(
            (summary) =>
              summary.subjectId ===
              conversations.find((c) => c.conversationId === conversationId)?.documentId,
          )?.transcriptionUpdatedAt

        expect(await updatedAtOf(first.conversationId)).toBeUndefined()

        await addTranscription(database, {
          attachmentId: audioId,
          companyId,
          conversationId: first.conversationId,
          status: 'pending',
          updatedAt: at(10),
        })
        expect(await updatedAtOf(first.conversationId)).toBe(at(10).toISOString())

        await database.db
          .update(occurrenceConversationAudioTranscriptions)
          .set({
            engine: 'whisper-local',
            generatedAt: at(20),
            status: 'ready',
            text: 'Cheguei.',
            updatedAt: at(20),
          })
          .where(eq(occurrenceConversationAudioTranscriptions.attachmentId, audioId))
        expect(await updatedAtOf(first.conversationId)).toBe(at(20).toISOString())

        const others = (await harness.list.list({ ...world.actor, cursor: null })).data.filter(
          (summary) => summary.subjectId !== first.documentId,
        )
        expect(others.every((summary) => summary.transcriptionUpdatedAt === undefined)).toBe(true)

        const meter = countQueries(database.db)
        await createSubjectHarness(meter.counted).list.list({ ...world.actor, cursor: null })
        const withAggregation = meter.queries()
        await database.db.delete(occurrenceConversationAudioTranscriptions)
        const emptyMeter = countQueries(database.db)
        await createSubjectHarness(emptyMeter.counted).list.list({ ...world.actor, cursor: null })
        expect(withAggregation).toBe(emptyMeter.queries())
      })
    },
    240_000,
  )
})
