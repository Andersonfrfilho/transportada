/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3 (contract.md §5.2–5.3), contra Postgres real — a transcrição nos anexos de áudio das rotas
 * por assunto do motorista:
 * - os estados do contrato viram `transcription`, `durationMs` cai na medida do worker, e anexo que não é
 *   áudio não ganha campo;
 * - consultas constantes por página (1, 10 e 30 áudios), nenhuma sem áudio, e `disabled` para empresa
 *   desligada SEM nenhuma linha de transcrição;
 * - `transcriptionUpdatedAt` muda quando a linha passa de `pending` a `ready` e não muda sem escrita;
 * - BOLA: a leitura é pela empresa do contexto, nunca por id do cliente.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  occurrenceConversationAudioTranscriptions,
  occurrenceConversations as occurrenceConversationsTable,
  tripDocuments,
} from '../../src/database/database.schema.js'
import {
  insertPendingTranscription,
  writeExposedTranscription,
} from '../../src/occurrence-conversation/infrastructure/conversation-transcription-write.query.js'
import {
  seedAttachment,
  seedAudioMessage,
  setAudioTranscriptionEnabled,
} from '../fixtures/conversation-audio-transcription-database.fixture.js'
import {
  countQueries,
  firstTripOf,
  insertSubjectMessage,
  rejection,
} from '../fixtures/driver-subject-conversation-database.fixture.js'
import { createWriteHarness } from '../fixtures/driver-subject-conversation-write-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  seedCompany,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 9, 12, minutes))
const GENERATED_AT = new Date('2026-10-09T12:30:00.000Z')

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
  const document = { subjectId: link.id, subjectType: 'document' as const }
  const harness = createWriteHarness(database.db)
  await harness.open.open({ ...actor, ...document })
  const [conversation] = await database.db
    .select({ id: occurrenceConversationsTable.id })
    .from(occurrenceConversationsTable)
    .where(eq(occurrenceConversationsTable.tripDocumentId, link.id))
  if (conversation === undefined) throw new Error('EXPECTED_CONVERSATION')
  return { actor, company, conversationId: conversation.id, document, harness, tripId }
}

async function seedAudio(
  database: TestDatabase,
  base: Awaited<ReturnType<typeof scenario>>,
  minute: number,
  durationMs?: number,
) {
  return seedAudioMessage(database.db, {
    companyId: base.company.companyId,
    conversationId: base.conversationId,
    createdAt: at(minute),
    driverUserId: base.actor.driverUserId,
    ...(durationMs === undefined ? {} : { durationMs }),
    operatorUserId: base.company.userId,
  })
}

async function createRow(
  database: TestDatabase,
  base: Awaited<ReturnType<typeof scenario>>,
  attachmentId: string,
) {
  const key = { attachmentId, companyId: base.company.companyId }
  await insertPendingTranscription(database.db, { ...key, conversationId: base.conversationId })
  return key
}

describe('a transcrição nos anexos de áudio do motorista (spec 264 T2.3)', () => {
  testWithPostgres(
    'cada estado do contrato vira transcription; duração cai na medida do worker; o resto não ganha campo',
    async () => {
      await withConversationDatabase(async (database) => {
        const base = await scenario(database)
        const ready = await seedAudio(database, base, 1, 3000)
        const pending = await seedAudio(database, base, 2)
        const tooLong = await seedAudio(database, base, 3)
        const purged = await seedAudio(database, base, 4)
        const engineFailed = await seedAudio(database, base, 5)
        const noRow = await seedAudio(database, base, 6)
        const image = await insertSubjectMessage(database.db, {
          body: 'foto',
          conversationId: base.conversationId,
          createdAt: at(7),
          direction: 'inbound',
          driverUserId: base.actor.driverUserId,
          operatorUserId: base.company.userId,
        })
        const imageAttachment = await seedAttachment(database.db, {
          companyId: base.company.companyId,
          contentType: 'image/jpeg',
          durationMs: 9000,
          messageId: image,
        })

        const readyKey = await createRow(database, base, ready.attachmentId)
        await writeExposedTranscription(database.db, {
          ...readyKey,
          changes: {
            audioDurationMs: 2500,
            engine: 'whisper-local',
            generatedAt: GENERATED_AT,
            language: 'pt',
            status: 'ready',
            text: 'Cheguei na doca',
          },
        })
        const pendingKey = await createRow(database, base, pending.attachmentId)
        await writeExposedTranscription(database.db, {
          ...pendingKey,
          changes: { audioDurationMs: 4500 },
        })
        const tooLongKey = await createRow(database, base, tooLong.attachmentId)
        await writeExposedTranscription(database.db, {
          ...tooLongKey,
          changes: { failureCode: 'too_long', maxDurationMs: 600_000, status: 'failed' },
        })
        const purgedKey = await createRow(database, base, purged.attachmentId)
        await writeExposedTranscription(database.db, {
          ...purgedKey,
          changes: { generatedAt: GENERATED_AT, status: 'ready', text: null },
        })
        const failedKey = await createRow(database, base, engineFailed.attachmentId)
        await writeExposedTranscription(database.db, {
          ...failedKey,
          changes: { failureCode: 'engine_failed', status: 'failed' },
        })

        const listed = await base.harness.messagesWithFiles.list({
          ...base.actor,
          ...base.document,
        })
        const byId = new Map(
          listed.flatMap((message) => message.attachments).map((view) => [view.id, view]),
        )
        expect(byId.get(ready.attachmentId)).toMatchObject({
          durationMs: 3000,
          transcription: {
            engine: 'whisper-local',
            generatedAt: GENERATED_AT.toISOString(),
            language: 'pt',
            status: 'ready',
            text: 'Cheguei na doca',
          },
        })
        expect(byId.get(pending.attachmentId)).toMatchObject({
          durationMs: 4500,
          transcription: { status: 'pending' },
        })
        expect(byId.get(tooLong.attachmentId)?.transcription).toEqual({
          maxDurationMs: 600_000,
          reason: 'too_long',
          status: 'failed',
        })
        for (const absent of [purged, engineFailed, noRow]) {
          expect(byId.get(absent.attachmentId)).not.toHaveProperty('transcription')
        }
        expect(byId.get(noRow.attachmentId)).not.toHaveProperty('durationMs')
        const imageView = byId.get(imageAttachment)
        expect(imageView).not.toHaveProperty('transcription')
        expect(imageView).not.toHaveProperty('durationMs')
      })
    },
    120_000,
  )

  testWithPostgres(
    'o número de consultas da página é o mesmo com 1, 10 e 30 áudios; sem áudio não há consulta de transcrição',
    async () => {
      await withConversationDatabase(async (database) => {
        const measured: Record<string, number> = {}
        const measure = async (base: Awaited<ReturnType<typeof scenario>>) => {
          const meter = countQueries(database.db)
          const harness = createWriteHarness(meter.counted)
          await harness.messagesWithFiles.list({ ...base.actor, ...base.document })
          return meter.queries()
        }
        const withoutAudio = await scenario(database)
        await insertSubjectMessage(database.db, {
          body: 'oi',
          conversationId: withoutAudio.conversationId,
          createdAt: at(1),
          direction: 'inbound',
          driverUserId: withoutAudio.actor.driverUserId,
          operatorUserId: withoutAudio.company.userId,
        })
        measured['sem áudio'] = await measure(withoutAudio)
        for (const size of [1, 10, 30]) {
          const base = await scenario(database)
          for (let index = 0; index < size; index += 1) {
            const { attachmentId } = await seedAudio(database, base, index)
            const key = await createRow(database, base, attachmentId)
            await writeExposedTranscription(database.db, {
              ...key,
              changes: { generatedAt: GENERATED_AT, status: 'ready', text: `texto ${index}` },
            })
          }
          measured[String(size)] = await measure(base)
        }
        const disabledBase = await scenario(database)
        await seedAudio(database, disabledBase, 1)
        await setAudioTranscriptionEnabled(database.db, disabledBase.company.companyId, false)
        measured['desligada'] = await measure(disabledBase)

        const baseline = measured['sem áudio'] ?? 0
        /** Com áudio: +1 da configuração da empresa, +1 das linhas por `attachmentIds`; desligada: só a configuração. */
        expect(measured).toEqual({
          '1': baseline + 2,
          '10': baseline + 2,
          '30': baseline + 2,
          desligada: baseline + 1,
          'sem áudio': baseline,
        })
      })
    },
    240_000,
  )

  testWithPostgres(
    'empresa desligada sem nenhuma linha de transcrição dá disabled; com linha pronta o texto não vaza',
    async () => {
      await withConversationDatabase(async (database) => {
        const base = await scenario(database)
        const first = await seedAudio(database, base, 1)
        await setAudioTranscriptionEnabled(database.db, base.company.companyId, false)
        expect(await database.db.select().from(occurrenceConversationAudioTranscriptions)).toEqual(
          [],
        )

        const listed = await base.harness.messagesWithFiles.list({
          ...base.actor,
          ...base.document,
        })
        expect(listed[0]?.attachments[0]?.transcription).toEqual({ status: 'disabled' })

        const key = await createRow(database, base, first.attachmentId)
        await writeExposedTranscription(database.db, {
          ...key,
          changes: { generatedAt: GENERATED_AT, status: 'ready', text: 'segredo do motorista' },
        })
        const again = await base.harness.messagesWithFiles.list({ ...base.actor, ...base.document })
        expect(again[0]?.attachments[0]?.transcription).toEqual({ status: 'disabled' })
        expect(JSON.stringify(again)).not.toContain('segredo do motorista')

        await setAudioTranscriptionEnabled(database.db, base.company.companyId, true)
        const religada = await base.harness.messagesWithFiles.list({
          ...base.actor,
          ...base.document,
        })
        expect(religada[0]?.attachments[0]?.transcription).toMatchObject({ status: 'ready' })
      })
    },
    120_000,
  )

  testWithPostgres(
    'transcriptionUpdatedAt na lista e no open muda com pending → ready e não muda sem escrita',
    async () => {
      await withConversationDatabase(async (database) => {
        const base = await scenario(database)
        const summaryOf = async () => {
          const page = await base.harness.list.list({ ...base.actor, cursor: null })
          return page.data.find((entry) => entry.subjectId === base.document.subjectId)
        }
        expect(await summaryOf()).not.toHaveProperty('transcriptionUpdatedAt')

        const audio = await seedAudio(database, base, 1)
        expect(await summaryOf()).not.toHaveProperty('transcriptionUpdatedAt')

        const key = await createRow(database, base, audio.attachmentId)
        const pendingStamp = (await summaryOf())?.transcriptionUpdatedAt
        expect(pendingStamp).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u)
        expect((await summaryOf())?.transcriptionUpdatedAt).toBe(pendingStamp)

        await writeExposedTranscription(database.db, {
          ...key,
          changes: { generatedAt: GENERATED_AT, status: 'ready', text: 'pronto' },
        })
        const readyStamp = (await summaryOf())?.transcriptionUpdatedAt
        expect(new Date(readyStamp ?? '').getTime()).toBeGreaterThan(
          new Date(pendingStamp ?? '').getTime(),
        )
        expect((await summaryOf())?.transcriptionUpdatedAt).toBe(readyStamp)

        const opened = await base.harness.open.open({ ...base.actor, ...base.document })
        expect(opened.summary.transcriptionUpdatedAt).toBe(readyStamp)
      })
    },
    120_000,
  )

  testWithPostgres(
    'BOLA: o motorista de outra empresa não lê a conversa, e id de anexo ou conversa alheia não vaza',
    async () => {
      await withConversationDatabase(async (database) => {
        const base = await scenario(database)
        const audio = await seedAudio(database, base, 1)
        const key = await createRow(database, base, audio.attachmentId)
        await writeExposedTranscription(database.db, {
          ...key,
          changes: { generatedAt: GENERATED_AT, status: 'ready', text: 'só da empresa A' },
        })
        const other = await seedCompany(database)

        expect(
          await rejection(() =>
            base.harness.messagesWithFiles.list({
              ...base.actor,
              ...base.document,
              companyId: other.companyId,
            }),
          ),
        ).toMatchObject({ code: 'CONVERSATION_NOT_FOUND', status: 404 })

        const foreign = await base.harness.unitOfWork.execute(async (transaction) => ({
          rows: await transaction.findTranscriptionsByAttachmentIds({
            attachmentIds: [audio.attachmentId],
            companyId: other.companyId,
          }),
          stamps: await transaction.readTranscriptionUpdatedAtByConversation({
            companyId: other.companyId,
            conversationIds: [base.conversationId],
          }),
        }))
        expect(foreign.rows.size).toBe(0)
        expect(foreign.stamps.size).toBe(0)
      })
    },
    120_000,
  )
})
