/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4 (ADR-0101 §7), contra Postgres real — lado de escrita do motorista:
 * - nota e viagem: do `open` ao envio ao GET das mensagens, com o `clientMessageId` ecoado; a repetição da
 *   chave devolve a mesma mensagem; duas requisições simultâneas gravam uma só; mensagens não vazam;
 * - ocorrência: a rota nova e a antiga dividem a idempotência — nada duplica, nos dois sentidos;
 * - encerrada (nota liberada, viagem cancelada) é 409, e a repetição anterior ainda se devolve;
 * - envio de arquivo por `conversation_id` e ligação ao enviar; pedido de outra conversa não liga;
 * - a rota antiga segue com a forma de resposta de sempre.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  idempotencyRecords,
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocuments,
  trips,
} from '../../src/database/database.schema.js'
import {
  downloadThroughSignedUrl,
  putThroughSignedUrl,
  WRITE_JPEG,
  createWriteHarness,
} from '../fixtures/driver-subject-conversation-write-database.fixture.js'
import {
  firstTripOf,
  rejection,
  swapPrincipal,
} from '../fixtures/driver-subject-conversation-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const KEY = 'offline-queue-key-0001'
const OLD_REPLY_OPERATION = 'occurrence-conversation.app.reply'
const NEW_REPLY_OPERATION = 'conversation.app.reply'

async function scenario(database: TestDatabase) {
  const seeded = await seedMailScenario(database)
  const { company } = seeded
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const actor = { companyId: company.companyId, driverId: company.firstDriverId, driverUserId }
  const tripId = await firstTripOf(database.db, company)
  const [link] = await database.db
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(eq(tripDocuments.companyId, company.companyId))
  if (link === undefined) throw new Error('EXPECTED_LINK')
  return {
    actor,
    company,
    document: { subjectId: link.id, subjectType: 'document' as const },
    harness: createWriteHarness(database.db),
    occurrence: { subjectId: seeded.occurrenceId, subjectType: 'occurrence' as const },
    trip: { subjectId: tripId, subjectType: 'trip' as const },
    tripId,
  }
}

const countRows = async (database: TestDatabase, table: typeof occurrenceConversationMessages) =>
  (await database.db.select({ id: table.id }).from(table)).length

describe('a escrita da conversa por assunto do motorista contra Postgres (spec 260 T2.4)', () => {
  testWithPostgres(
    'nota e viagem: open, resposta com eco, repetição devolve a mesma, GET sem vazar entre assuntos',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, document, harness, trip } = await scenario(database)
        await harness.open.open({ ...actor, ...document })
        await harness.open.open({ ...actor, ...trip })

        const sent = await harness.reply.reply({
          ...actor,
          ...document,
          bodyText: '  Cheguei na doca  ',
          idempotencyKey: KEY,
        })
        expect(sent.replayed).toBe(false)
        expect(sent.message).toMatchObject({
          attachments: [],
          authorName: null,
          bodyText: 'Cheguei na doca',
          channel: 'app',
          clientMessageId: KEY,
          direction: 'inbound',
          status: null,
        })
        const tripSent = await harness.reply.reply({
          ...actor,
          ...trip,
          bodyText: 'Atraso na estrada',
          idempotencyKey: 'offline-queue-key-0002',
        })

        const again = await harness.reply.reply({
          ...actor,
          ...document,
          bodyText: '  Cheguei na doca  ',
          idempotencyKey: KEY,
        })
        expect(again).toEqual({ message: sent.message, replayed: true })
        expect(await countRows(database, occurrenceConversationMessages)).toBe(2)

        expect(await harness.messages.list({ ...actor, ...document })).toEqual([sent.message])
        expect(await harness.messages.list({ ...actor, ...trip })).toEqual([tripSent.message])
        const operations = (await database.db.select().from(idempotencyRecords)).map(
          (record) => record.operation,
        )
        expect(operations).toEqual([NEW_REPLY_OPERATION, NEW_REPLY_OPERATION])
        const stored = (await database.db.select().from(idempotencyRecords))[0]?.response
        expect(Object.keys(stored as object).sort()).toEqual(['conversationId', 'messageId'])

        expect(
          await rejection(() =>
            harness.reply.reply({
              ...actor,
              ...document,
              bodyText: 'Outro texto',
              idempotencyKey: KEY,
            }),
          ),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED', status: 409 })
        expect(await countRows(database, occurrenceConversationMessages)).toBe(2)
      })
    },
    90_000,
  )

  testWithPostgres(
    'duas requisições simultâneas com a mesma chave: a segunda espera o lock e devolve a mesma mensagem',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, document, harness } = await scenario(database)
        await harness.open.open({ ...actor, ...document })
        const input = { ...actor, ...document, bodyText: 'Chegou', idempotencyKey: KEY }
        const settled = await Promise.allSettled([
          harness.reply.reply(input),
          harness.reply.reply(input),
          harness.reply.reply(input),
        ])
        expect(settled.map((result) => result.status)).toEqual([
          'fulfilled',
          'fulfilled',
          'fulfilled',
        ])
        const results = settled.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        )
        expect(results.filter((result) => !result.replayed)).toHaveLength(1)
        expect(new Set(results.map((result) => result.message.id)).size).toBe(1)
        expect(await countRows(database, occurrenceConversationMessages)).toBe(1)
        expect(await database.db.select().from(idempotencyRecords)).toHaveLength(1)
      })
    },
    90_000,
  )

  testWithPostgres(
    'ocorrência: enviada pela rota antiga e reenviada pela nova (e ao contrário) não duplica',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, harness, occurrence } = await scenario(database)
        const old = await harness.oldReply.reply({
          ...actor,
          bodyText: 'Foto da avaria',
          idempotencyKey: KEY,
          occurrenceId: occurrence.subjectId,
        })
        expect(Object.keys(old).sort()).toEqual(['conversationId', 'messageId'])

        const replay = await harness.reply.reply({
          ...actor,
          ...occurrence,
          bodyText: 'Foto da avaria',
          idempotencyKey: KEY,
        })
        expect(replay.replayed).toBe(true)
        expect(replay.message).toMatchObject({
          channel: 'app',
          clientMessageId: KEY,
          direction: 'inbound',
          id: old.messageId,
        })
        expect(await countRows(database, occurrenceConversationMessages)).toBe(1)

        const fresh = await harness.reply.reply({
          ...actor,
          ...occurrence,
          bodyText: 'Segunda foto',
          idempotencyKey: 'offline-queue-key-0002',
        })
        expect(fresh.replayed).toBe(false)
        const oldReplay = await harness.oldReply.reply({
          ...actor,
          bodyText: 'Segunda foto',
          idempotencyKey: 'offline-queue-key-0002',
          occurrenceId: occurrence.subjectId,
        })
        expect(oldReplay).toEqual({
          conversationId: old.conversationId,
          messageId: fresh.message.id,
        })
        expect(await countRows(database, occurrenceConversationMessages)).toBe(2)

        const operations = (await database.db.select().from(idempotencyRecords)).map(
          (record) => record.operation,
        )
        expect(operations).toEqual([OLD_REPLY_OPERATION, OLD_REPLY_OPERATION])
        expect(
          await rejection(() =>
            harness.reply.reply({
              ...actor,
              ...occurrence,
              bodyText: 'Corpo diferente',
              idempotencyKey: KEY,
            }),
          ),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED' })

        const listed = await harness.messages.list({ ...actor, ...occurrence })
        expect(listed.map((message) => message.clientMessageId)).toEqual([
          KEY,
          'offline-queue-key-0002',
        ])
        const oldListed = await harness.oldList.list({
          ...actor,
          occurrenceId: occurrence.subjectId,
        })
        expect(oldListed.map((message) => Object.keys(message).sort())).toEqual([
          ['attachments', 'authorName', 'bodyText', 'createdAt', 'direction', 'id', 'status'],
          ['attachments', 'authorName', 'bodyText', 'createdAt', 'direction', 'id', 'status'],
        ])
      })
    },
    90_000,
  )

  testWithPostgres(
    'encerrada é 409 na resposta e no upload; a repetição anterior ainda é devolvida',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, document, harness, trip, tripId } = await scenario(database)
        await harness.open.open({ ...actor, ...document })
        await harness.open.open({ ...actor, ...trip })
        const sent = await harness.reply.reply({
          ...actor,
          ...document,
          bodyText: 'Antes de liberar',
          idempotencyKey: KEY,
        })
        const upload = {
          ...actor,
          contentType: 'image/jpeg',
          fileName: 'foto.jpg',
          sizeBytes: WRITE_JPEG.byteLength,
        }

        await database.db
          .update(tripDocuments)
          .set({ releasedAt: new Date('2026-10-09T13:00:00.000Z') })
          .where(eq(tripDocuments.id, document.subjectId))
        await database.db.update(trips).set({ status: 'cancelled' }).where(eq(trips.id, tripId))

        for (const subject of [document, trip]) {
          expect(
            await rejection(() =>
              harness.reply.reply({
                ...actor,
                ...subject,
                bodyText: 'Depois de encerrar',
                idempotencyKey: 'offline-queue-key-0009',
              }),
            ),
          ).toMatchObject({ code: 'CONVERSATION_CLOSED', status: 409 })
          expect(
            await rejection(() => harness.upload.request({ ...upload, ...subject })),
          ).toMatchObject({ code: 'CONVERSATION_CLOSED', status: 409 })
        }
        expect(await countRows(database, occurrenceConversationMessages)).toBe(1)
        expect(
          await harness.reply.reply({
            ...actor,
            ...document,
            bodyText: 'Antes de liberar',
            idempotencyKey: KEY,
          }),
        ).toEqual({ message: sent.message, replayed: true })
      })
    },
    90_000,
  )

  testWithPostgres(
    'arquivo por conversation_id: pede, sobe, liga ao enviar; o pedido não serve a outra conversa nem se reusa',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, document, harness, occurrence, trip } = await scenario(database)
        const declared = {
          ...actor,
          contentType: 'image/jpeg',
          fileName: 'foto da doca.jpg',
          sizeBytes: WRITE_JPEG.byteLength,
        }
        expect(
          await rejection(() => harness.upload.request({ ...declared, ...document })),
        ).toMatchObject({ code: 'CONVERSATION_NOT_FOUND', status: 404 })

        await harness.open.open({ ...actor, ...document })
        await harness.open.open({ ...actor, ...trip })
        const requested = await harness.upload.request({ ...declared, ...document })
        expect(Object.keys(requested).sort()).toEqual(['expiresAt', 'uploadId', 'uploadUrl'])
        await putThroughSignedUrl(harness.provider, requested.uploadUrl, WRITE_JPEG, 'image/jpeg')

        expect(
          await rejection(() =>
            harness.reply.reply({
              ...actor,
              ...trip,
              attachmentIds: [requested.uploadId],
              bodyText: '',
              idempotencyKey: 'offline-queue-key-0003',
            }),
          ),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_UPLOAD_INVALID', status: 422 })
        expect(await countRows(database, occurrenceConversationMessages)).toBe(0)

        const sent = await harness.reply.reply({
          ...actor,
          ...document,
          attachmentIds: [requested.uploadId],
          bodyText: '',
          idempotencyKey: KEY,
        })
        expect(sent.message.attachments).toHaveLength(1)
        expect(sent.message.attachments[0]).toMatchObject({
          contentType: 'image/jpeg',
          fileName: 'foto da doca.jpg',
          sizeBytes: WRITE_JPEG.byteLength,
        })
        const [attachment] = sent.message.attachments
        expect(await downloadThroughSignedUrl(harness.provider, attachment?.url ?? '')).toEqual(
          WRITE_JPEG,
        )
        expect(await database.db.select().from(occurrenceConversationAttachments)).toHaveLength(1)

        const again = await harness.reply.reply({
          ...actor,
          ...document,
          attachmentIds: [requested.uploadId],
          bodyText: '',
          idempotencyKey: KEY,
        })
        expect(again.replayed).toBe(true)
        expect(again.message.attachments).toHaveLength(1)
        const listed = await harness.messagesWithFiles.list({ ...actor, ...document })
        expect(listed[0]?.attachments).toHaveLength(1)

        expect(
          await rejection(() =>
            harness.reply.reply({
              ...actor,
              ...document,
              attachmentIds: [requested.uploadId],
              bodyText: 'de novo',
              idempotencyKey: 'offline-queue-key-0004',
            }),
          ),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_UPLOAD_INVALID' })

        const occurrenceUpload = await harness.upload.request({ ...declared, ...occurrence })
        await putThroughSignedUrl(
          harness.provider,
          occurrenceUpload.uploadUrl,
          WRITE_JPEG,
          'image/jpeg',
        )
        const occurrenceSent = await harness.reply.reply({
          ...actor,
          ...occurrence,
          attachmentIds: [occurrenceUpload.uploadId],
          bodyText: '',
          idempotencyKey: 'offline-queue-key-0005',
        })
        expect(occurrenceSent.message.attachments).toHaveLength(1)
        const oldUpload = await harness.oldUpload.request({
          ...actor,
          ...declared,
          occurrenceId: occurrence.subjectId,
        })
        expect(Object.keys(oldUpload).sort()).toEqual(['expiresAt', 'uploadId', 'uploadUrl'])
      })
    },
    90_000,
  )

  testWithPostgres(
    'BOLA e retarget: tripulante alheio é 404; só o principal assume; o anterior recebe DRIVER_CHANGED',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, company, document, harness, tripId } = await scenario(database)
        const nextUser = await linkDriverMembership(database, company, company.secondDriverId)
        const next = {
          companyId: company.companyId,
          driverId: company.secondDriverId,
          driverUserId: nextUser,
        }
        await harness.open.open({ ...actor, ...document })

        const foreignId = crypto.randomUUID()
        expect(
          await rejection(() =>
            harness.reply.reply({
              ...actor,
              bodyText: 'x',
              idempotencyKey: KEY,
              subjectId: foreignId,
              subjectType: 'document',
            }),
          ),
        ).toMatchObject({ code: 'CONVERSATION_NOT_FOUND', status: 404 })
        expect(
          await rejection(() =>
            harness.reply.reply({
              ...next,
              bodyText: 'x',
              idempotencyKey: KEY,
              ...document,
            }),
          ),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED', status: 409 })

        await swapPrincipal(database.db, tripId)
        const taken = await harness.reply.reply({
          ...next,
          ...document,
          bodyText: 'Assumi a viagem',
          idempotencyKey: 'offline-queue-key-0006',
        })
        expect(taken.replayed).toBe(false)
        const [conversation] = await database.db
          .select({ driverUserId: occurrenceConversations.driverUserId })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.tripDocumentId, document.subjectId))
        expect(conversation?.driverUserId).toBe(nextUser)
        expect(
          await rejection(() =>
            harness.reply.reply({
              ...actor,
              ...document,
              bodyText: 'Ainda sou eu?',
              idempotencyKey: 'offline-queue-key-0007',
            }),
          ),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED' })
        expect(await countRows(database, occurrenceConversationMessages)).toBe(1)
      })
    },
    90_000,
  )
})
