/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3 (contract.md §5.2), contra Postgres real — a transcrição nos anexos de áudio vistos pelo
 * escritório e no eco do envio/resposta:
 * - a lista do escritório traz `transcription`/`durationMs` no áudio, em lote, e nada nos outros anexos;
 * - o eco de `send` (escritório) e de `reply` (motorista) com áudio real passa pela mesma etapa;
 * - BOLA: outra empresa e outra viagem da mesma empresa não leem a conversa.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { occurrenceConversations, tripDocuments } from '../../src/database/database.schema.js'
import {
  insertPendingTranscription,
  writeExposedTranscription,
} from '../../src/occurrence-conversation/infrastructure/conversation-transcription-write.query.js'
import {
  seedAudioMessage,
  setAudioTranscriptionEnabled,
} from '../fixtures/conversation-audio-transcription-database.fixture.js'
import {
  countQueries,
  firstTripOf,
  rejection,
} from '../fixtures/driver-subject-conversation-database.fixture.js'
import { putThroughSignedUrl } from '../fixtures/driver-subject-conversation-write-database.fixture.js'
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
  seedTrip,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const GENERATED_AT = new Date('2026-10-09T12:30:00.000Z')
const OGG_AUDIO = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0, 0, 0, 0, 0])

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
  await seedProfile(database.db, company.userId, 'Marta da Operação')
  await seedProfile(database.db, driverUserId, 'João da Silva')
  const note = { subjectId: link.id, subjectType: 'document' as const }
  const harness = createOfficeHarness(database.db)
  const noteInput = { companyId: company.companyId, ...note, tripId }
  await harness.office.open.open({ ...noteInput, userId: company.userId })
  const [conversation] = await database.db
    .select({ id: occurrenceConversations.id })
    .from(occurrenceConversations)
    .where(eq(occurrenceConversations.tripDocumentId, link.id))
  if (conversation === undefined) throw new Error('EXPECTED_CONVERSATION')
  return { actor, company, conversationId: conversation.id, harness, note, noteInput }
}

describe('a transcrição vista pelo escritório contra Postgres (spec 264 T2.3)', () => {
  testWithPostgres(
    'a lista do escritório traz transcription e durationMs só no áudio, com consultas constantes',
    async () => {
      await withConversationDatabase(async (database) => {
        const base = await scenario(database)
        const audio = await seedAudioMessage(database.db, {
          companyId: base.company.companyId,
          conversationId: base.conversationId,
          createdAt: new Date('2026-10-09T12:01:00.000Z'),
          driverUserId: base.actor.driverUserId,
          durationMs: 7000,
          operatorUserId: base.company.userId,
        })
        const key = { attachmentId: audio.attachmentId, companyId: base.company.companyId }
        await insertPendingTranscription(database.db, {
          ...key,
          conversationId: base.conversationId,
        })
        expect(
          (await base.harness.office.messages.list(base.noteInput))[0]?.attachments[0],
        ).toMatchObject({ durationMs: 7000, transcription: { status: 'pending' } })
        await writeExposedTranscription(database.db, {
          ...key,
          changes: { generatedAt: GENERATED_AT, status: 'ready', text: 'Cheguei' },
        })

        const listed = await base.harness.office.messages.list(base.noteInput)
        expect(listed[0]?.attachments[0]?.transcription).toMatchObject({
          status: 'ready',
          text: 'Cheguei',
        })

        const meter = countQueries(database.db)
        await createOfficeHarness(meter.counted).office.messages.list(base.noteInput)
        const withAudio = meter.queries()
        await setAudioTranscriptionEnabled(database.db, base.company.companyId, false)
        const disabledMeter = countQueries(database.db)
        const disabled = await createOfficeHarness(disabledMeter.counted).office.messages.list(
          base.noteInput,
        )
        expect(disabled[0]?.attachments[0]?.transcription).toEqual({ status: 'disabled' })
        /** Desligada: a consulta das linhas não roda. */
        expect(disabledMeter.queries()).toBe(withAudio - 1)
      })
    },
    120_000,
  )

  testWithPostgres(
    'o eco do envio do escritório e da resposta do motorista passa pela mesma etapa',
    async () => {
      await withConversationDatabase(async (database) => {
        const base = await scenario(database)
        await setAudioTranscriptionEnabled(database.db, base.company.companyId, false)
        const declared = {
          contentType: 'audio/ogg',
          fileName: 'voz.ogg',
          sizeBytes: OGG_AUDIO.byteLength,
        }
        const officeUpload = await base.harness.office.upload.request({
          ...base.noteInput,
          ...declared,
          actorUserId: base.company.userId,
        })
        await putThroughSignedUrl(
          base.harness.provider,
          officeUpload.uploadUrl,
          OGG_AUDIO,
          'audio/ogg',
        )
        const sent = await base.harness.office.send.send({
          ...base.noteInput,
          actorUserId: base.company.userId,
          attachmentIds: [officeUpload.uploadId],
          bodyText: '',
          idempotencyKey: OFFICE_KEY,
        })
        expect(sent.message.attachments[0]?.transcription).toEqual({ status: 'disabled' })

        const driverUpload = await base.harness.upload.request({
          ...base.actor,
          ...base.note,
          ...declared,
        })
        await putThroughSignedUrl(
          base.harness.provider,
          driverUpload.uploadUrl,
          OGG_AUDIO,
          'audio/ogg',
        )
        const replied = await base.harness.reply.reply({
          ...base.actor,
          ...base.note,
          attachmentIds: [driverUpload.uploadId],
          bodyText: '',
          idempotencyKey: 'offline-queue-key-0001',
        })
        expect(replied.message.attachments[0]?.transcription).toEqual({ status: 'disabled' })

        await setAudioTranscriptionEnabled(database.db, base.company.companyId, true)
        const listed = await base.harness.messagesWithFiles.list({ ...base.actor, ...base.note })
        for (const message of listed) {
          expect(message.attachments[0]).not.toHaveProperty('transcription')
        }
      })
    },
    120_000,
  )

  testWithPostgres(
    'BOLA: outra empresa e outra viagem da mesma empresa não leem a conversa de áudio',
    async () => {
      await withConversationDatabase(async (database) => {
        const base = await scenario(database)
        await seedAudioMessage(database.db, {
          companyId: base.company.companyId,
          conversationId: base.conversationId,
          createdAt: new Date('2026-10-09T12:01:00.000Z'),
          driverUserId: base.actor.driverUserId,
          operatorUserId: base.company.userId,
        })
        const otherCompany = await seedCompany(database)
        const otherTrip = await seedTrip(database, otherCompany, 'in_transit')
        const sameCompanyTrip = await seedTrip(database, base.company, 'in_transit')

        for (const input of [
          { ...base.noteInput, companyId: otherCompany.companyId },
          { ...base.noteInput, tripId: otherTrip.tripId },
          { ...base.noteInput, tripId: sameCompanyTrip.tripId },
        ]) {
          expect(await rejection(() => base.harness.office.messages.list(input))).toMatchObject({
            code: 'CONVERSATION_NOT_FOUND',
            status: 404,
          })
        }
      })
    },
    120_000,
  )
})
