/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T403, contra Postgres real: o e-mail da conversa grava, na mesma transação, a conversa e
 * a thread da 143 (na primeira vez), a mensagem da 143 com o outbox e a mensagem da conversa que
 * aponta para ela. A segunda é resposta na mesma conversa e na mesma thread; a chave repetida não
 * grava nada; outra empresa não acha a ocorrência nem o contato.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createPreviewOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/preview-occurrence-mail.use-case.js'
import { createSendOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import {
  createOccurrenceMailReader,
  createOccurrenceSuggestedMailReader,
  DrizzleOccurrenceMailRepository,
} from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  companyOccurrenceTypes,
  contractorContacts,
  contractorMailMessages,
  contractorMailOutbox,
  contractorMailSettings,
  contractorMailThreads,
  contractors,
  nfeParticipants,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const EMITTER_TAX_ID = '11222333000181'

type Seeded = {
  readonly company: Company
  readonly contactIds: readonly string[]
  readonly occurrenceId: string
}

async function nfeDocumentIdOf(database: TestDatabase, trip: SeededTrip): Promise<string> {
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
  if (row?.nfeDocumentId === null || row?.nfeDocumentId === undefined) {
    throw new Error('EXPECTED_NFE_DOCUMENT')
  }
  return row.nfeDocumentId
}

/** Empresa com e-mail verificado, a nota cujo emitente é contratante, dois contatos e a ocorrência. */
async function seedMailScenario(database: TestDatabase): Promise<Seeded> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const nfeDocumentId = await nfeDocumentIdOf(database, trip)
  const contractorId = crypto.randomUUID()
  await database.db.insert(contractors).values({
    companyId: company.companyId,
    displayName: 'Contratante Alfa',
    id: contractorId,
    taxId: EMITTER_TAX_ID,
  })
  await database.db.insert(nfeParticipants).values({
    companyId: company.companyId,
    documentId: nfeDocumentId,
    id: crypto.randomUUID(),
    legalName: 'Contratante Alfa Indústria Ltda',
    role: 'emitter',
    taxId: EMITTER_TAX_ID,
    tradeName: 'Contratante Alfa',
  })
  const contacts = await database.db
    .insert(contractorContacts)
    .values([
      { companyId: company.companyId, contractorId, email: 'compras@alfa.example.test' },
      { companyId: company.companyId, contractorId, email: 'fiscal@alfa.example.test' },
      {
        companyId: company.companyId,
        contractorId,
        email: 'sem-ocorrencia@alfa.example.test',
        receivesOccurrences: false,
      },
    ])
    .returning({ id: contractorContacts.id })
  await database.db.insert(contractorMailSettings).values({
    companyId: company.companyId,
    replyDomain: 'resposta.example.test',
    secretEnvelope: {},
    senderAddress: 'ocorrencias@transportadora.example.test',
    senderName: 'Transportadora Sintética',
    sendingVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
  })

  const occurrenceTypeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    emailBody: 'Ocorrência na nota {{numeroNota}}: {{observacao}}',
    emailSubject: 'Ocorrência — NF {{numeroNota}}',
    id: occurrenceTypeId,
    name: 'Caixa violada',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'separation',
  })
  const occurrence = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      items: [],
      note: 'caixa com avaria visível',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'blocked',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage([]),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (occurrence === null) throw new Error('EXPECTED_OCCURRENCE')
  return {
    company,
    contactIds: contacts.map((contact) => contact.id),
    occurrenceId: occurrence.id,
  }
}

function createUseCase(database: TestDatabase) {
  return createSendOccurrenceMailUseCase({
    fingerprintService: {
      create: async ({ fields }) =>
        fields.map((field) => new TextDecoder().decode(field)).join('|'),
    },
    now: () => new Date('2026-09-24T18:00:00.000Z'),
    secretService: {
      decrypt: async () => ({ apiKey: 're_test', replyTokenSecret: 'b'.repeat(64) }),
    } as never,
    unitOfWork: new DrizzleOccurrenceMailRepository(database.db),
  })
}

async function count(database: TestDatabase, companyId: string) {
  const [threads, mails, outbox, conversations, messages] = await Promise.all([
    database.db
      .select({ id: contractorMailThreads.id })
      .from(contractorMailThreads)
      .where(eq(contractorMailThreads.companyId, companyId)),
    database.db
      .select({ id: contractorMailMessages.id })
      .from(contractorMailMessages)
      .where(eq(contractorMailMessages.companyId, companyId)),
    database.db
      .select({ id: contractorMailOutbox.id })
      .from(contractorMailOutbox)
      .where(eq(contractorMailOutbox.companyId, companyId)),
    database.db
      .select({ id: occurrenceConversations.id })
      .from(occurrenceConversations)
      .where(eq(occurrenceConversations.companyId, companyId)),
    database.db
      .select({ id: occurrenceConversationMessages.id })
      .from(occurrenceConversationMessages)
      .where(eq(occurrenceConversationMessages.companyId, companyId)),
  ])
  return {
    conversations: conversations.length,
    mails: mails.length,
    messages: messages.length,
    outbox: outbox.length,
    threads: threads.length,
  }
}

describe('o e-mail da conversa contra Postgres (spec 183 T403)', () => {
  testWithPostgres(
    'envio, resposta e repetição: uma conversa, uma thread, as mensagens ligadas',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const useCase = createUseCase(database)
        const base = {
          actorUserId: seeded.company.userId,
          bodyText: 'Recebedor cobrando descarga. Autorizam?',
          companyId: seeded.company.companyId,
          contactIds: seeded.contactIds.slice(0, 2),
          correlationId: 'correlation-1',
          idempotencyKey: 'key-1',
          occurrenceId: seeded.occurrenceId,
          subject: 'Ocorrência — NF 1',
        }

        const first = await useCase.send(base)
        expect(await count(database, seeded.company.companyId)).toEqual({
          conversations: 1,
          mails: 1,
          messages: 1,
          outbox: 1,
          threads: 1,
        })
        const [thread] = await database.db
          .select({
            subjectId: contractorMailThreads.subjectId,
            subjectType: contractorMailThreads.subjectType,
          })
          .from(contractorMailThreads)
          .where(eq(contractorMailThreads.id, first.threadId))
        expect(thread).toEqual({
          subjectId: seeded.occurrenceId,
          subjectType: 'document_occurrence',
        })
        const [message] = await database.db
          .select({
            channel: occurrenceConversationMessages.channel,
            mailMessageId: occurrenceConversationMessages.mailMessageId,
            status: occurrenceConversationMessages.status,
            statusTimes: occurrenceConversationMessages.statusTimes,
          })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.id, first.conversationMessageId))
        expect(message).toEqual({
          channel: 'email',
          mailMessageId: first.mailMessageId,
          status: 'queued',
          statusTimes: { queued: '2026-09-24T18:00:00.000Z' },
        })
        const [mail] = await database.db
          .select({ toAddresses: contractorMailMessages.toAddresses })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.id, first.mailMessageId))
        expect(mail?.toAddresses).toEqual(['compras@alfa.example.test', 'fiscal@alfa.example.test'])

        const reply = await useCase.send({
          ...base,
          bodyText: 'Seguimos aguardando.',
          idempotencyKey: 'key-2',
        })
        expect(reply.threadId).toBe(first.threadId)
        expect(reply.conversationId).toBe(first.conversationId)
        expect(await count(database, seeded.company.companyId)).toMatchObject({
          conversations: 1,
          mails: 2,
          messages: 2,
          threads: 1,
        })

        expect(await useCase.send(base)).toEqual(first)
        expect(await count(database, seeded.company.companyId)).toMatchObject({ mails: 2 })
      })
    },
    30_000,
  )

  testWithPostgres(
    'contato que não recebe ocorrências e outra empresa são recusados, sem gravar nada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedCompany(database)
        const useCase = createUseCase(database)
        const base = {
          actorUserId: seeded.company.userId,
          bodyText: 'Texto',
          companyId: seeded.company.companyId,
          contactIds: [seeded.contactIds[2] ?? 'missing'],
          correlationId: 'correlation-1',
          idempotencyKey: 'key-1',
          occurrenceId: seeded.occurrenceId,
          subject: 'Assunto',
        }

        await expect(useCase.send(base)).rejects.toMatchObject({
          code: 'OCCURRENCE_CONVERSATION_NO_RECIPIENT',
        })
        await expect(
          useCase.send({ ...base, companyId: other.companyId, contactIds: seeded.contactIds }),
        ).rejects.toMatchObject({ code: 'TRIP_OCCURRENCE_NOT_FOUND' })
        expect(await count(database, seeded.company.companyId)).toEqual({
          conversations: 0,
          mails: 0,
          messages: 0,
          outbox: 0,
          threads: 0,
        })
      })
    },
    30_000,
  )

  testWithPostgres(
    'a prévia parte do modelo do tipo, com os valores da nota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const preview = await createPreviewOccurrenceMailUseCase({
          reader: createOccurrenceMailReader(database.db),
          suggestedMail: createOccurrenceSuggestedMailReader(database.db),
        }).preview({
          actorUserId: seeded.company.userId,
          companyId: seeded.company.companyId,
          occurrenceId: seeded.occurrenceId,
        })

        expect(preview.suggested).toBe(true)
        expect(preview.subject).toMatch(/^Ocorrência — NF /u)
        expect(preview.bodyText).toContain('caixa com avaria visível')
        expect(preview.subject).not.toContain('{{')
      })
    },
    30_000,
  )
})
