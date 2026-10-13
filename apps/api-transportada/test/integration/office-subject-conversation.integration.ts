/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b (ADR-0101), contra Postgres real — a conversa de nota e de viagem vista pelo escritório:
 * - o fluxo escritório → motorista → escritório: abrir, enviar, o motorista ver na lista nova com protocolo,
 *   responder, o escritório ler (não lidas por usuário, nome de quem escreveu nos dois sentidos);
 * - idempotência do envio (repetição e requisições simultâneas), protocolo gerado, aviso uma vez;
 * - `retarget`: trocar o principal leva a conversa ao novo; o anterior deixa de alcançá-la;
 * - encerrar e reabrir; nota liberada e viagem cancelada são 409; viagem sem motorista é 409;
 * - BOLA entre empresas e entre viagens (404 com o mesmo código); envio de arquivo por `conversation_id`;
 * - a lista não tem N+1; o que a conversa de ocorrência mostra continua o mesmo.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  idempotencyRecords,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocuments,
  trips,
} from '../../src/database/database.schema.js'
import { createListMyConversationsUseCase } from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import { findOccurrenceConversations } from '../../src/occurrence-conversation/infrastructure/occurrence-conversation.query.js'
import {
  countQueries,
  firstTripOf,
  rejection,
  swapPrincipal,
} from '../fixtures/driver-subject-conversation-database.fixture.js'
import {
  downloadThroughSignedUrl,
  putThroughSignedUrl,
  WRITE_JPEG,
} from '../fixtures/driver-subject-conversation-write-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  createOfficeHarness,
  OFFICE_KEY,
  seedProfile,
} from '../fixtures/office-subject-conversation-database.fixture.js'
import {
  linkDriverMembership,
  seedCompany,
  seedExtraDocument,
  seedTrip,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const PROTOCOL_PATTERN = /^\d{6}-[2-9A-HJKMNP-Z]{4}$/u

async function scenario(database: TestDatabase, options: { readonly linkDriver?: boolean } = {}) {
  const seeded = await seedMailScenario(database)
  const { company } = seeded
  const driverUserId =
    options.linkDriver === false
      ? ''
      : await linkDriverMembership(database, company, company.firstDriverId)
  const actor = { companyId: company.companyId, driverId: company.firstDriverId, driverUserId }
  const tripId = await firstTripOf(database.db, company)
  const [link] = await database.db
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(eq(tripDocuments.companyId, company.companyId))
  if (link === undefined) throw new Error('EXPECTED_LINK')
  await seedProfile(database.db, company.userId, 'Marta da Operação')
  if (driverUserId !== '') await seedProfile(database.db, driverUserId, 'João da Silva')
  const note = { subjectId: link.id, subjectType: 'document' as const }
  const trip = { subjectId: tripId, subjectType: 'trip' as const }
  return {
    actor,
    company,
    harness: createOfficeHarness(database.db),
    note,
    noteInput: { companyId: company.companyId, ...note, tripId },
    seeded,
    trip,
    tripId,
    tripInput: { companyId: company.companyId, ...trip, tripId },
  }
}

const countMessages = async (database: TestDatabase) =>
  (
    await database.db
      .select({ id: occurrenceConversationMessages.id })
      .from(occurrenceConversationMessages)
  ).length

describe('a conversa por assunto vista pelo escritório contra Postgres (spec 263 T2.4b)', () => {
  testWithPostgres(
    'escritório abre e envia, o motorista vê com protocolo e responde, o escritório lê',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, company, harness, noteInput, note, tripId } = await scenario(database)
        const operator = company.userId

        const opened = await harness.office.open.open({ ...noteInput, userId: operator })
        expect(opened.created).toBe(true)
        expect(opened.summary).toMatchObject({
          channels: [],
          driverName: 'João da Silva',
          status: 'open',
          subjectId: note.subjectId,
          subjectType: 'document',
          tripId,
          unreadCount: 0,
        })
        expect(opened.summary.protocol).toMatch(PROTOCOL_PATTERN)
        const again = await harness.office.open.open({ ...noteInput, userId: operator })
        expect(again.created).toBe(false)
        expect(again.summary.protocol).toBe(opened.summary.protocol)

        const sent = await harness.office.send.send({
          ...noteInput,
          actorUserId: operator,
          bodyText: '  Pode subir a nota agora?  ',
          idempotencyKey: OFFICE_KEY,
        })
        expect(sent.replayed).toBe(false)
        expect(sent.message).toMatchObject({
          authorName: 'Marta da Operação',
          bodyText: 'Pode subir a nota agora?',
          channel: 'app',
          clientMessageId: OFFICE_KEY,
          direction: 'outbound',
          status: 'queued',
        })
        expect(harness.notices).toEqual([
          expect.objectContaining({
            dedupeKey: sent.message.id,
            protocol: opened.summary.protocol,
            recipientUserId: actor.driverUserId,
            subjectLabel: expect.stringMatching(/^NF /u) as string,
            subjectType: 'document',
          }),
        ])

        const driverList = await harness.list.list({ ...actor, cursor: null })
        expect(driverList.data).toHaveLength(1)
        expect(driverList.data[0]).toMatchObject({
          awaitingDriver: true,
          channels: ['app'],
          protocol: opened.summary.protocol,
          status: 'open',
          subjectId: note.subjectId,
          unreadCount: 1,
        })
        const seenByDriver = await harness.messages.list({ ...actor, ...note })
        expect(seenByDriver.map((message) => message.bodyText)).toEqual([
          'Pode subir a nota agora?',
        ])

        await harness.reply.reply({
          ...actor,
          ...note,
          bodyText: 'Subindo agora',
          idempotencyKey: 'offline-queue-key-0001',
        })
        const [summary] = await harness.office.list.list({
          companyId: company.companyId,
          tripId,
          userId: operator,
        })
        expect(summary).toMatchObject({
          channels: ['app'],
          lastMessageDirection: 'inbound',
          lastMessagePreview: 'Subindo agora',
          unreadCount: 1,
        })
        const thread = await harness.office.messages.list(noteInput)
        expect(thread.map((message) => [message.direction, message.authorName])).toEqual([
          ['outbound', 'Marta da Operação'],
          ['inbound', 'João da Silva'],
        ])

        await harness.office.markRead.markRead({ ...noteInput, userId: operator })
        const afterRead = await harness.office.list.list({
          companyId: company.companyId,
          tripId,
          userId: operator,
        })
        expect(afterRead[0]?.unreadCount).toBe(0)
        const otherOperator = await harness.office.list.list({
          companyId: company.companyId,
          tripId,
          userId: actor.driverUserId,
        })
        expect(otherOperator[0]?.unreadCount).toBe(1)
      })
    },
    120_000,
  )

  testWithPostgres(
    'a viagem tem a conversa dela; a lista traz as duas, sem vazar mensagem entre assuntos',
    async () => {
      await withConversationDatabase(async (database) => {
        const { company, harness, noteInput, tripId, tripInput } = await scenario(database)
        const userId = company.userId
        await harness.office.send.send({
          ...noteInput,
          actorUserId: userId,
          bodyText: 'Sobre a nota',
          idempotencyKey: OFFICE_KEY,
        })
        await harness.office.send.send({
          ...tripInput,
          actorUserId: userId,
          bodyText: 'Sobre a viagem',
          idempotencyKey: 'office-send-key-0002',
        })

        const list = await harness.office.list.list({
          companyId: company.companyId,
          tripId,
          userId,
        })
        expect(list.map((item) => [item.subjectType, item.lastMessagePreview]).sort()).toEqual([
          ['document', 'Sobre a nota'],
          ['trip', 'Sobre a viagem'],
        ])
        expect(new Set(list.map((item) => item.protocol)).size).toBe(2)
        for (const item of list) expect(item.protocol).toMatch(PROTOCOL_PATTERN)
        expect(
          (await harness.office.messages.list(tripInput)).map((message) => message.bodyText),
        ).toEqual(['Sobre a viagem'])
        expect(
          (await harness.office.messages.list(noteInput)).map((message) => message.bodyText),
        ).toEqual(['Sobre a nota'])
      })
    },
    120_000,
  )

  testWithPostgres(
    'idempotência: a repetição devolve a mesma, simultâneas gravam uma só, chave reusada com outro corpo é 409',
    async () => {
      await withConversationDatabase(async (database) => {
        const { company, harness, noteInput } = await scenario(database)
        const input = {
          ...noteInput,
          actorUserId: company.userId,
          bodyText: 'Mensagem única',
          idempotencyKey: OFFICE_KEY,
        }
        const settled = await Promise.allSettled([
          harness.office.send.send(input),
          harness.office.send.send(input),
          harness.office.send.send(input),
        ])
        const results = settled.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        )
        expect(results).toHaveLength(3)
        expect(results.filter((result) => !result.replayed)).toHaveLength(1)
        expect(new Set(results.map((result) => result.message.id)).size).toBe(1)
        expect(await countMessages(database)).toBe(1)
        expect(harness.notices).toHaveLength(1)

        const records = await database.db.select().from(idempotencyRecords)
        expect(records.map((record) => record.operation)).toEqual(['conversation.app.send'])
        expect(Object.keys(records[0]?.response as object).sort()).toEqual([
          'conversationId',
          'messageId',
        ])
        expect(
          await rejection(() => harness.office.send.send({ ...input, bodyText: 'Outro texto' })),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED', status: 409 })
        expect(await countMessages(database)).toBe(1)
      })
    },
    120_000,
  )

  testWithPostgres(
    'retarget: trocar o principal leva a conversa ao novo e o anterior deixa de alcançá-la',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, company, harness, note, noteInput, tripId } = await scenario(database)
        const nextUser = await linkDriverMembership(database, company, company.secondDriverId)
        const next = {
          companyId: company.companyId,
          driverId: company.secondDriverId,
          driverUserId: nextUser,
        }
        await harness.office.send.send({
          ...noteInput,
          actorUserId: company.userId,
          bodyText: 'Para o primeiro',
          idempotencyKey: OFFICE_KEY,
        })

        await swapPrincipal(database.db, tripId)
        const sent = await harness.office.send.send({
          ...noteInput,
          actorUserId: company.userId,
          bodyText: 'Para o novo principal',
          idempotencyKey: 'office-send-key-0002',
        })

        const [conversation] = await database.db
          .select({ driverUserId: occurrenceConversations.driverUserId })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.tripDocumentId, note.subjectId))
        expect(conversation?.driverUserId).toBe(nextUser)
        expect(harness.notices.at(-1)).toMatchObject({ recipientUserId: nextUser })
        expect(
          (await harness.messages.list({ ...next, ...note })).map((message) => message.id),
        ).toContain(sent.message.id)
        expect(await rejection(() => harness.messages.list({ ...actor, ...note }))).toMatchObject({
          code: 'CONVERSATION_NOT_FOUND',
          status: 404,
        })
        const [listed] = await harness.office.list.list({
          companyId: company.companyId,
          tripId,
          userId: company.userId,
        })
        expect(listed?.driverName).toBe(null)
      })
    },
    120_000,
  )

  testWithPostgres(
    'encerrar é idempotente, bloqueia envio e arquivo; abrir reabre; nota liberada e viagem cancelada são 409',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, company, harness, note, noteInput, tripId, tripInput } =
          await scenario(database)
        const userId = company.userId
        const declared = {
          ...noteInput,
          actorUserId: userId,
          contentType: 'image/jpeg',
          fileName: 'foto.jpg',
          sizeBytes: WRITE_JPEG.byteLength,
        }
        await harness.office.open.open({ ...noteInput, userId })

        const closed = await harness.office.close.close({ ...noteInput, userId })
        expect(closed.status).toBe('closed')
        expect(await harness.office.close.close({ ...noteInput, userId })).toEqual(closed)
        const [driverView] = (await harness.list.list({ ...actor, cursor: null })).data
        expect(driverView?.status).toBe('closed')
        expect(
          await rejection(() =>
            harness.office.send.send({
              ...noteInput,
              actorUserId: userId,
              bodyText: 'Fechada',
              idempotencyKey: OFFICE_KEY,
            }),
          ),
        ).toMatchObject({ code: 'CONVERSATION_CLOSED', status: 409 })
        expect(await rejection(() => harness.office.upload.request(declared))).toMatchObject({
          code: 'CONVERSATION_CLOSED',
        })
        expect(
          await rejection(() =>
            harness.reply.reply({ ...actor, ...note, bodyText: 'x', idempotencyKey: OFFICE_KEY }),
          ),
        ).toMatchObject({ code: 'CONVERSATION_CLOSED' })

        const reopened = await harness.office.open.open({ ...noteInput, userId })
        expect(reopened).toMatchObject({ created: false, summary: { status: 'open' } })
        await expect(
          harness.office.send.send({
            ...noteInput,
            actorUserId: userId,
            bodyText: 'Reaberta',
            idempotencyKey: 'office-send-key-0002',
          }),
        ).resolves.toMatchObject({ replayed: false })

        await database.db
          .update(tripDocuments)
          .set({ releasedAt: new Date('2026-10-09T13:00:00.000Z') })
          .where(eq(tripDocuments.id, note.subjectId))
        for (const work of [
          () => harness.office.open.open({ ...noteInput, userId }),
          () =>
            harness.office.send.send({
              ...noteInput,
              actorUserId: userId,
              bodyText: 'Liberada',
              idempotencyKey: 'office-send-key-0003',
            }),
        ]) {
          expect(await rejection(work)).toMatchObject({ code: 'CONVERSATION_CLOSED', status: 409 })
        }
        const listed = await harness.office.list.list({
          companyId: company.companyId,
          tripId,
          userId,
        })
        expect(listed.find((item) => item.subjectType === 'document')?.status).toBe('closed')

        await harness.office.open.open({ ...tripInput, userId })
        await database.db.update(trips).set({ status: 'cancelled' }).where(eq(trips.id, tripId))
        expect(
          await rejection(() =>
            harness.office.send.send({
              ...tripInput,
              actorUserId: userId,
              bodyText: 'Cancelada',
              idempotencyKey: 'office-send-key-0004',
            }),
          ),
        ).toMatchObject({ code: 'CONVERSATION_CLOSED', status: 409 })
        expect(await countMessages(database)).toBe(1)
      })
    },
    120_000,
  )

  testWithPostgres(
    'viagem sem motorista principal com vínculo ativo é 409 CONVERSATION_NO_DRIVER',
    async () => {
      await withConversationDatabase(async (database) => {
        const { company, harness, noteInput } = await scenario(database, { linkDriver: false })
        for (const work of [
          () => harness.office.open.open({ ...noteInput, userId: company.userId }),
          () =>
            harness.office.send.send({
              ...noteInput,
              actorUserId: company.userId,
              bodyText: 'Oi',
              idempotencyKey: OFFICE_KEY,
            }),
        ]) {
          expect(await rejection(work)).toMatchObject({
            code: 'CONVERSATION_NO_DRIVER',
            status: 409,
          })
        }
        expect(await database.db.select().from(occurrenceConversations)).toHaveLength(0)
        expect(await countMessages(database)).toBe(0)
      })
    },
    120_000,
  )

  testWithPostgres(
    'BOLA: outra empresa, outra viagem e assunto alheio são o mesmo 404, sem criar nada',
    async () => {
      await withConversationDatabase(async (database) => {
        const { company, harness, noteInput, tripId } = await scenario(database)
        const otherCompany = await seedCompany(database)
        const otherTrip = await seedTrip(database, otherCompany, 'in_transit')
        const sameCompanyTrip = await seedTrip(database, company, 'in_transit')
        await harness.office.open.open({ ...noteInput, userId: company.userId })
        const before = await database.db.select().from(occurrenceConversations)

        const userId = company.userId
        const attempts: readonly (() => Promise<unknown>)[] = [
          () => harness.office.list.list({ companyId: otherCompany.companyId, tripId, userId }),
          () =>
            harness.office.list.list({
              companyId: company.companyId,
              tripId: crypto.randomUUID(),
              userId,
            }),
          () =>
            harness.office.open.open({ ...noteInput, companyId: otherCompany.companyId, userId }),
          () => harness.office.open.open({ ...noteInput, tripId: otherTrip.tripId, userId }),
          () => harness.office.open.open({ ...noteInput, tripId: sameCompanyTrip.tripId, userId }),
          () => harness.office.open.open({ ...noteInput, subjectId: crypto.randomUUID(), userId }),
          () =>
            harness.office.open.open({
              companyId: company.companyId,
              subjectId: otherTrip.tripId,
              subjectType: 'trip',
              tripId,
              userId,
            }),
          () => harness.office.messages.list({ ...noteInput, tripId: sameCompanyTrip.tripId }),
          () =>
            harness.office.markRead.markRead({ ...noteInput, tripId: otherTrip.tripId, userId }),
          () =>
            harness.office.close.close({ ...noteInput, companyId: otherCompany.companyId, userId }),
          () =>
            harness.office.send.send({
              ...noteInput,
              actorUserId: userId,
              bodyText: 'Invasor',
              companyId: otherCompany.companyId,
              idempotencyKey: OFFICE_KEY,
            }),
          () =>
            harness.office.upload.request({
              ...noteInput,
              actorUserId: userId,
              companyId: otherCompany.companyId,
              contentType: 'image/jpeg',
              fileName: 'a.jpg',
              sizeBytes: 10,
            }),
        ]
        for (const attempt of attempts) {
          expect(await rejection(attempt)).toMatchObject({
            code: 'CONVERSATION_NOT_FOUND',
            status: 404,
          })
        }
        expect(await database.db.select().from(occurrenceConversations)).toEqual(before)
        expect(await countMessages(database)).toBe(0)
      })
    },
    180_000,
  )

  testWithPostgres(
    'arquivo por conversation_id: pede, sobe, liga ao enviar; o motorista baixa; sem abrir antes é 404',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, company, harness, note, noteInput } = await scenario(database)
        const declared = {
          ...noteInput,
          actorUserId: company.userId,
          contentType: 'image/jpeg',
          fileName: 'croqui da doca.jpg',
          sizeBytes: WRITE_JPEG.byteLength,
        }
        expect(await rejection(() => harness.office.upload.request(declared))).toMatchObject({
          code: 'CONVERSATION_NOT_FOUND',
          status: 404,
        })

        await harness.office.open.open({ ...noteInput, userId: company.userId })
        const requested = await harness.office.upload.request(declared)
        await putThroughSignedUrl(harness.provider, requested.uploadUrl, WRITE_JPEG, 'image/jpeg')
        const sent = await harness.office.send.send({
          ...noteInput,
          actorUserId: company.userId,
          attachmentIds: [requested.uploadId],
          bodyText: '',
          idempotencyKey: OFFICE_KEY,
        })
        expect(sent.message.attachments).toHaveLength(1)
        expect(sent.message.attachments[0]).toMatchObject({
          contentType: 'image/jpeg',
          fileName: 'croqui da doca.jpg',
        })
        const listed = await harness.office.messages.list(noteInput)
        expect(listed[0]?.attachments).toHaveLength(1)
        expect(
          await downloadThroughSignedUrl(harness.provider, listed[0]?.attachments[0]?.url ?? ''),
        ).toEqual(WRITE_JPEG)
        const driverSide = await harness.messagesWithFiles.list({ ...actor, ...note })
        expect(driverSide[0]?.attachments).toHaveLength(1)

        expect(
          await rejection(() =>
            harness.office.send.send({
              ...noteInput,
              actorUserId: company.userId,
              attachmentIds: [requested.uploadId],
              bodyText: 'de novo',
              idempotencyKey: 'office-send-key-0002',
            }),
          ),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_UPLOAD_INVALID' })
      })
    },
    120_000,
  )

  testWithPostgres(
    'a lista não tem N+1 e a conversa de ocorrência do motorista segue a mesma',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, company, harness, noteInput, seeded, tripId } = await scenario(database)
        const measure = async () => {
          const meter = countQueries(database.db)
          const list = await createOfficeHarness(meter.counted).office.list.list({
            companyId: company.companyId,
            tripId,
            userId: company.userId,
          })
          return { size: list.length, queries: meter.queries() }
        }
        await harness.office.open.open({ ...noteInput, userId: company.userId })
        const one = await measure()
        for (let index = 0; index < 6; index += 1) {
          const documentId = await seedExtraDocument(
            database,
            company,
            { documentId: noteInput.subjectId, stopId: '', tripId },
            { separationStatus: 'pending' },
          )
          await harness.office.open.open({
            ...noteInput,
            subjectId: documentId,
            userId: company.userId,
          })
        }
        const many = await measure()
        expect(many.size).toBe(7)
        expect(many.queries).toBe(one.queries)
        expect(many.queries).toBeLessThanOrEqual(6)

        const inbox = createListMyConversationsUseCase({
          clock: () => new Date(),
          unitOfWork: createDrizzleDriverConversationUnitOfWork(database.db),
        })
        expect(
          await inbox.list({ companyId: actor.companyId, driverUserId: actor.driverUserId }),
        ).toEqual([])
        const oldView = await findOccurrenceConversations(database.db, {
          companyId: company.companyId,
          occurrenceId: seeded.occurrenceId,
          userId: company.userId,
        })
        expect(oldView?.conversations).toEqual([])
      })
    },
    180_000,
  )
})
