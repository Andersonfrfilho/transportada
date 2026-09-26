/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T206 (RF19), contra Postgres real: a linha do tempo junta o registro, as fotos, a
 * tratativa da spec 164 e os e-mails da spec 143, cada fato com o ator. Outra empresa não acha nada, e
 * a conversa de outra empresa que por acaso aponte para o mesmo id não entra. Do e-mail não sai
 * endereço, assunto nem corpo.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  contractorMailMessages,
  contractorMailThreads,
} from '../../src/database/contractor-mail.schema.js'
import { contractors } from '../../src/database/delivery-client.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrences,
  tripOccurrenceCaseEvents,
  tripOccurrenceCases,
  tripStopOccurrences,
} from '../../src/database/trip.schema.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { createReadTripOccurrenceTimelineUseCase } from '../../src/trips/application/read-trip-occurrence-timeline.use-case.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { findTripOccurrenceTimelineSources } from '../../src/trips/infrastructure/trip-occurrence-timeline.query.js'
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

async function registerDocumentOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<string> {
  const occurrenceTypeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
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
  return occurrence.id
}

async function registerStopOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(tripStopOccurrences).values({
    actorUserId: company.userId,
    channel: 'driver_app',
    companyId: company.companyId,
    createdAt: new Date('2026-09-22T13:00:00.000Z'),
    description: 'doca fechada',
    id,
    kind: 'dock_closed',
    stopId: trip.stopId,
  })
  return id
}

/**
 * Troca a tratativa que o registro abriu (ou não) por uma com horários fixos: registrada, aguardando
 * a contratante, decidida por ela e encerrada.
 */
async function seedDecidedCase(
  database: TestDatabase,
  company: Company,
  occurrenceId: string,
): Promise<void> {
  /** O registro grava `now()` do banco: fixa registro e fotos no início da história. */
  const recordedAt = new Date('2026-09-22T12:00:00.000Z')
  await database.db
    .update(tripDocumentOccurrences)
    .set({ createdAt: recordedAt })
    .where(eq(tripDocumentOccurrences.id, occurrenceId))
  await database.db
    .update(tripDocumentOccurrenceAttachments)
    .set({ createdAt: recordedAt })
    .where(eq(tripDocumentOccurrenceAttachments.occurrenceId, occurrenceId))
  await database.db
    .delete(tripOccurrenceCases)
    .where(
      and(
        eq(tripOccurrenceCases.companyId, company.companyId),
        eq(tripOccurrenceCases.occurrenceId, occurrenceId),
      ),
    )
  const caseId = crypto.randomUUID()
  await database.db.insert(tripOccurrenceCases).values({
    companyId: company.companyId,
    id: caseId,
    occurrenceId,
    decidedAt: new Date('2026-09-22T13:30:00.000Z'),
    decidedByUserId: company.userId,
    decisionKind: 'goods_paid',
    redeliveryPolicy: 'blocked',
    resolvedAt: new Date('2026-09-22T14:00:00.000Z'),
    status: 'closed',
  })
  const event = (
    fromStatus: null | 'awaiting_contractor' | 'decided' | 'recorded',
    toStatus: 'awaiting_contractor' | 'closed' | 'decided' | 'recorded',
    at: string,
    actorKind: 'contractor' | 'internal' = 'internal',
  ) => ({
    actorKind,
    actorUserId: company.userId,
    caseId,
    companyId: company.companyId,
    fromStatus,
    occurredAt: new Date(at),
    toStatus,
  })
  await database.db
    .insert(tripOccurrenceCaseEvents)
    .values([
      event(null, 'recorded', '2026-09-22T12:00:00.000Z'),
      event('recorded', 'awaiting_contractor', '2026-09-22T12:10:00.000Z'),
      event('awaiting_contractor', 'decided', '2026-09-22T13:30:00.000Z', 'contractor'),
      event('decided', 'closed', '2026-09-22T14:00:00.000Z'),
    ])
}

async function seedMailThread(
  database: TestDatabase,
  companyId: string,
  occurrenceId: string,
  messages: readonly { readonly at: string; readonly direction: 'inbound' | 'outbound' }[],
): Promise<void> {
  const contractorId = crypto.randomUUID()
  await database.db.insert(contractors).values({
    companyId,
    displayName: 'Contratante Sintética',
    id: contractorId,
    taxId: '11222333000181',
  })
  const [thread] = await database.db
    .insert(contractorMailThreads)
    .values({
      companyId,
      contractorId,
      replyTokenHash: crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a'),
      subjectId: occurrenceId,
      subjectType: 'document_occurrence',
    })
    .returning({ id: contractorMailThreads.id })
  if (thread === undefined) throw new Error('EXPECTED_THREAD')
  await database.db.insert(contractorMailMessages).values(
    messages.map((message) => ({
      bodyText: 'corpo sintético que não pode sair na linha do tempo',
      companyId,
      createdAt: new Date(message.at),
      deliveryStatus: message.direction === 'outbound' ? ('sent' as const) : null,
      direction: message.direction,
      fromAddress: 'contratante.sintetica@example.test',
      interpretation: message.direction === 'inbound' ? ('message' as const) : null,
      subject: 'assunto sintético',
      threadId: thread.id,
      toAddresses: ['ocorrencias@example.test'],
    })),
  )
}

describe('a linha do tempo da ocorrência (spec 183 T206)', () => {
  testWithPostgres(
    'ocorrência de nota: registro, fotos, tratativa e e-mails, em ordem e com os tempos',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceId = await registerDocumentOccurrence(database, company, trip)
        await seedDecidedCase(database, company, occurrenceId)
        await seedMailThread(database, company.companyId, occurrenceId, [
          { at: '2026-09-22T12:15:00.000Z', direction: 'outbound' },
          { at: '2026-09-22T13:20:00.000Z', direction: 'inbound' },
        ])

        const timeline = await createReadTripOccurrenceTimelineUseCase({
          reader: { findSources: (input) => findTripOccurrenceTimelineSources(database.db, input) },
        }).execute({ context: { companyId: company.companyId }, occurrenceId })

        expect(timeline.events.map((event) => event.kind)).toEqual([
          'occurrence.recorded',
          'occurrence.photo',
          'case.transition',
          'case.transition',
          'contractor.mail.sent',
          'contractor.mail.received',
          'case.transition',
          'case.transition',
        ])
        const sent = timeline.events.find((event) => event.kind === 'contractor.mail.sent')
        expect(sent?.actor.kind).toBe('system')
        const received = timeline.events.find((event) => event.kind === 'contractor.mail.received')
        expect(received?.actor).toEqual({ kind: 'contractor', name: null })
        const decided = timeline.events.find(
          (event) => event.kind === 'case.transition' && event.toStatus === 'decided',
        )
        expect(decided?.actor.kind).toBe('contractor')
        expect(decided?.isKey).toBe(true)
        expect(timeline.timings).toEqual({
          contractorAskedAt: '2026-09-22T12:15:00.000Z',
          contractorRepliedAt: '2026-09-22T13:20:00.000Z',
          driverReleasedAt: '2026-09-22T13:30:00.000Z',
          openSince: '2026-09-22T12:00:00.000Z',
          openUntil: '2026-09-22T14:00:00.000Z',
        })

        const serialized = JSON.stringify(timeline)
        expect(serialized).not.toContain('example.test')
        expect(serialized).not.toContain('sintético')
      })
    },
    30_000,
  )

  testWithPostgres(
    'outra empresa não acha a ocorrência, e a conversa dela com o mesmo id não entra',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const other = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceId = await registerDocumentOccurrence(database, company, trip)
        await seedMailThread(database, other.companyId, occurrenceId, [
          { at: '2026-09-22T12:15:00.000Z', direction: 'outbound' },
        ])

        expect(
          await findTripOccurrenceTimelineSources(database.db, {
            companyId: other.companyId,
            occurrenceId,
          }),
        ).toBeNull()
        const sources = await findTripOccurrenceTimelineSources(database.db, {
          companyId: company.companyId,
          occurrenceId,
        })
        expect(sources?.some((source) => source.kind === 'contractor.mail.sent')).toBe(false)
      })
    },
    30_000,
  )

  testWithPostgres(
    'ocorrência de parada sem foto e sem tratativa: só o registro, com o motorista como ator',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceId = await registerStopOccurrence(database, company, trip)

        const sources = await findTripOccurrenceTimelineSources(database.db, {
          companyId: company.companyId,
          occurrenceId,
        })

        expect(sources?.map((source) => [source.kind, source.actor.kind])).toEqual([
          ['occurrence.recorded', 'driver'],
        ])
      })
    },
    30_000,
  )
})
