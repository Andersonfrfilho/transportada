/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T2.5 (ADR-0105), contra Postgres real: o motorista lê as ocorrências da viagem atual —
 * nota e parada, de qualquer autor, cancelada, resolvida (observação e frase fixa), reaberta —, a
 * tripulação inteira vê, e outra viagem, outra empresa e viagem finalizada são 404.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  occurrenceConversationAttachments,
  occurrenceConversations,
  tripOccurrenceResolutionEvents,
} from '../../src/database/occurrence-conversation.schema.js'
import { storedObjects } from '../../src/database/storage.schema.js'
import {
  companyOccurrenceTypes,
  fleetDrivers,
  tripDocumentOccurrences,
  tripDrivers,
  tripFieldReports,
  tripStopOccurrences,
  trips,
} from '../../src/database/database.schema.js'
import type { DriverRouteOccurrenceDetail } from '../../src/trips/domain/driver-route-occurrence.types.js'
import { createFindDriverRouteOccurrenceUseCase } from '../../src/trips/application/find-driver-route-occurrence.use-case.js'
import { createListDriverRouteOccurrencesUseCase } from '../../src/trips/application/list-driver-route-occurrences.use-case.js'
import { createSignDriverRouteOccurrenceFileUseCase } from '../../src/trips/application/sign-driver-route-occurrence-file.use-case.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { createDrizzleDriverRouteOccurrenceReader } from '../../src/trips/infrastructure/drizzle-driver-route-occurrence.repository.js'
import { DrizzleOccurrenceCaseRepository } from '../../src/trips/infrastructure/drizzle-occurrence-case.repository.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import {
  insertSubjectMessage,
  rejection,
} from '../fixtures/driver-subject-conversation-database.fixture.js'
import { withConversationDatabase } from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  seedAttachmentRow,
  seedDocumentOccurrence,
  seedPhotoObject,
} from '../fixtures/street-occurrence-attachment.fixture.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const AT = (minutes: number) => new Date(Date.UTC(2026, 9, 15, 9, minutes))
const NOT_ACTIVE = { code: 'DRIVER_TRIP_NOT_ACTIVE', status: 404 }
const NOT_FOUND = { code: 'TRIP_OCCURRENCE_NOT_FOUND', status: 404 }
const ATTACHMENT_NOT_FOUND = { code: 'TRIP_OCCURRENCE_ATTACHMENT_NOT_FOUND', status: 404 }

type Scenario = {
  readonly company: Company
  readonly driverUserId: string
  readonly helperUserId: string
  readonly trip: SeededTrip
  readonly typeId: string
}

function harness(database: TestDatabase) {
  const reader = createDrizzleDriverRouteOccurrenceReader({
    currentTrips: new DrizzleCurrentDriverTripRepository(database.db),
    database: database.db,
  })
  const signed: { filename: string; key: string; expiresInSeconds: number }[] = []
  return {
    find: createFindDriverRouteOccurrenceUseCase({ reader }),
    list: createListDriverRouteOccurrencesUseCase({ reader }),
    sign: createSignDriverRouteOccurrenceFileUseCase({
      clock: () => new Date(),
      reader,
      storage: {
        createSignedDownload: async (input) => {
          signed.push({
            expiresInSeconds: input.expiresInSeconds,
            filename: input.filename,
            key: input.key,
          })
          return new URL(`https://storage.example.test/${input.key}`)
        },
      },
    }),
    signed,
  }
}

async function seedScenario(database: TestDatabase): Promise<Scenario> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const helperUserId = await linkDriverMembership(database, company, company.secondDriverId)
  const typeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id: typeId,
    name: 'Caixa violada',
    notifies: false,
    redeliveryPolicy: 'allowed',
    stage: 'separation',
  })
  return { company, driverUserId, helperUserId, trip, typeId }
}

function actorOf(scenario: Scenario, who: 'driver' | 'helper' = 'driver') {
  return {
    companyId: scenario.company.companyId,
    driverId: who === 'driver' ? scenario.company.firstDriverId : scenario.company.secondDriverId,
    driverUserId: who === 'driver' ? scenario.driverUserId : scenario.helperUserId,
  }
}

async function insertStopOccurrence(
  database: TestDatabase,
  scenario: Scenario,
  input: {
    readonly actorUserId: string
    readonly createdAt: Date
    readonly signatureObjectId?: string
  },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(tripStopOccurrences).values({
    actorUserId: input.actorUserId,
    companyId: scenario.company.companyId,
    createdAt: input.createdAt,
    description: 'cliente fechado',
    id,
    kind: 'long_wait',
    occurrenceTypeId: scenario.typeId,
    signatureObjectId: input.signatureObjectId ?? null,
    stopId: scenario.trip.stopId,
  })
  return id
}

async function resolveByOffice(
  database: TestDatabase,
  scenario: Scenario,
  input: {
    readonly createdAt: Date
    readonly occurrenceId: string
    readonly kind: 'document' | 'stop'
  },
): Promise<void> {
  await database.db.insert(tripOccurrenceResolutionEvents).values({
    actorKind: 'internal',
    actorUserId: scenario.company.userId,
    companyId: scenario.company.companyId,
    createdAt: input.createdAt,
    documentOccurrenceId: input.kind === 'document' ? input.occurrenceId : null,
    kind: 'resolved',
    note: 'Cliente avisado por telefone',
    stopOccurrenceId: input.kind === 'stop' ? input.occurrenceId : null,
  })
}

/** Ocorrência de nota com tratativa (política `allowed`), pelo caminho real, e a tratativa cancelada. */
async function registerCancelledCaseOccurrence(
  database: TestDatabase,
  scenario: Scenario,
): Promise<string> {
  const registered = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: scenario.company.userId,
      companyId: scenario.company.companyId,
      documentId: scenario.trip.documentId,
      items: [],
      note: 'caixa com avaria visível',
      occurrenceTypeId: scenario.typeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'allowed',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: scenario.trip.tripId,
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => AT(1),
    storage: fakeAttachmentStorage([]),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (registered === null) throw new Error('EXPECTED_OCCURRENCE')
  const cases = new DrizzleOccurrenceCaseRepository(database.db)
  const caseId = await cases.findIdByOccurrenceId({
    companyId: scenario.company.companyId,
    occurrenceId: registered.id,
  })
  if (caseId === null) throw new Error('EXPECTED_CASE')
  await cases.transition({
    action: 'cancel',
    actorKind: 'internal',
    actorUserId: scenario.company.userId,
    caseId,
    companyId: scenario.company.companyId,
    note: 'motivo registrado',
  })
  return registered.id
}

type Fixture = {
  readonly cancelledId: string
  readonly internalId: string
  readonly openDocumentId: string
  readonly photoObjectId: string
  readonly reopenedId: string
  readonly signatureObjectId: string
  readonly stopMineId: string
  readonly systemId: string
  readonly chatObjectId: string
  readonly messageId: string
}

/** Seis ocorrências de naturezas diferentes, cada uma com o dado que a leitura precisa distinguir. */
async function seedOccurrences(database: TestDatabase, scenario: Scenario): Promise<Fixture> {
  const { company, driverUserId, trip, typeId } = scenario
  const photoObjectId = await seedPhotoObject(database, {
    company,
    purpose: 'trip_occurrence_attachment',
  })
  const openDocumentId = await seedDocumentOccurrence(database, {
    attachmentObjectId: null,
    company,
    createdAt: AT(10),
    stage: 'delivery',
    trip,
    typeId,
  })
  await seedAttachmentRow(database, {
    company,
    createdAt: AT(11),
    occurrenceId: openDocumentId,
    position: 1,
    storedObjectId: photoObjectId,
  })

  const cancelledId = await seedDocumentOccurrence(database, {
    attachmentObjectId: null,
    company,
    createdAt: AT(12),
    stage: 'delivery',
    trip,
    typeId,
  })
  await database.db
    .update(tripDocumentOccurrences)
    .set({
      cancellationReason: 'aberta por engano',
      cancelledAt: AT(13),
      cancelledByUserId: company.userId,
    })
    .where(eq(tripDocumentOccurrences.id, cancelledId))

  const internalId = await seedDocumentOccurrence(database, {
    attachmentObjectId: null,
    company,
    createdAt: AT(14),
    stage: 'delivery',
    trip,
    typeId,
  })
  await resolveByOffice(database, scenario, {
    createdAt: AT(15),
    kind: 'document',
    occurrenceId: internalId,
  })

  const systemId = await registerCancelledCaseOccurrence(database, scenario)

  const signatureObjectId = await seedPhotoObject(database, {
    company,
    purpose: 'delivery_proof',
  })
  const stopMineId = await insertStopOccurrence(database, scenario, {
    actorUserId: driverUserId,
    createdAt: AT(20),
    signatureObjectId,
  })
  await database.db.insert(tripFieldReports).values({
    actorUserId: driverUserId,
    companyId: company.companyId,
    idempotencyKey: 'report-key-stop-1',
    operation: 'stop.occurrence',
    resultId: stopMineId,
  })

  const reopenedId = await insertStopOccurrence(database, scenario, {
    actorUserId: company.userId,
    createdAt: AT(21),
  })
  await resolveByOffice(database, scenario, {
    createdAt: AT(22),
    kind: 'stop',
    occurrenceId: reopenedId,
  })
  const [conversation] = await database.db
    .insert(occurrenceConversations)
    .values({
      companyId: company.companyId,
      driverUserId,
      occurrenceId: reopenedId,
      occurrenceKind: 'stop',
      participant: 'driver',
    })
    .returning({ id: occurrenceConversations.id })
  if (conversation === undefined) throw new Error('EXPECTED_CONVERSATION')
  const messageId = await insertSubjectMessage(database.db, {
    body: 'O problema voltou',
    conversationId: conversation.id,
    createdAt: AT(23),
    direction: 'inbound',
    driverUserId,
    operatorUserId: company.userId,
  })
  await database.db.insert(tripOccurrenceResolutionEvents).values({
    actorKind: 'driver',
    actorUserId: driverUserId,
    companyId: company.companyId,
    conversationMessageId: messageId,
    createdAt: AT(24),
    kind: 'reopened',
    stopOccurrenceId: reopenedId,
  })
  const chatObjectId = await seedPhotoObject(database, {
    company,
    purpose: 'occurrence_conversation_attachment',
  })
  await database.db.insert(occurrenceConversationAttachments).values({
    companyId: company.companyId,
    contentType: 'image/jpeg',
    fileName: 'boleto.jpg',
    messageId,
    sha256: 'a'.repeat(64),
    sizeBytes: 10,
    storedObjectId: chatObjectId,
  })

  return {
    cancelledId,
    chatObjectId,
    internalId,
    messageId,
    openDocumentId,
    photoObjectId,
    reopenedId,
    signatureObjectId,
    stopMineId,
    systemId,
  }
}

describe('o motorista lê as ocorrências da rota contra Postgres (spec 266 T2.5)', () => {
  testWithPostgres(
    'lista nota e parada de qualquer autor com estado, resolução, reabertura, reportKey e contagens',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const fixture = await seedOccurrences(database, scenario)

        const items = await harness(database).list.execute(actorOf(scenario))

        const byId = new Map(items.map((item) => [item.id, item]))
        expect(items).toHaveLength(6)
        expect(byId.get(fixture.openDocumentId)).toMatchObject({
          conversation: { exists: false },
          documentCount: 1,
          kind: 'document',
          recordedByMe: false,
          reportKey: null,
          resolution: null,
          state: 'open',
          stopId: scenario.trip.stopId,
          stopSequence: 1,
          type: { id: scenario.typeId, name: 'Caixa violada' },
        })
        expect(byId.get(fixture.openDocumentId)?.documentNumber).toEqual(expect.any(String))
        expect(byId.get(fixture.cancelledId)).toMatchObject({
          resolution: null,
          state: 'cancelled',
        })
        expect(byId.get(fixture.internalId)).toMatchObject({
          resolution: {
            actorKind: 'internal',
            note: 'Cliente avisado por telefone',
            phraseKey: null,
          },
          state: 'resolved',
        })
        expect(byId.get(fixture.systemId)).toMatchObject({
          resolution: { actorKind: 'system', note: null, phraseKey: 'case_cancelled' },
          state: 'resolved',
        })
        expect(byId.get(fixture.stopMineId)).toMatchObject({
          documentCount: 1,
          kind: 'stop',
          recordedByMe: true,
          reportKey: 'report-key-stop-1',
          state: 'open',
        })
        expect(byId.get(fixture.reopenedId)).toMatchObject({
          conversation: { exists: true },
          documentCount: 1,
          reopenedAt: AT(24).toISOString(),
          resolution: null,
          state: 'open',
        })
      })
    },
    90_000,
  )

  testWithPostgres(
    'o detalhe traz a observação, as fotos, a assinatura, os anexos do chat e a linha do tempo',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const fixture = await seedOccurrences(database, scenario)
        const { find } = harness(database)

        const document = await find.execute({
          ...actorOf(scenario),
          occurrenceId: fixture.openDocumentId,
          occurrenceKind: 'document',
        })
        expect(document.photos.map((photo) => photo.objectId)).toEqual([fixture.photoObjectId])
        expect(document.photos[0]).toMatchObject({
          contentType: 'image/jpeg',
          name: null,
          sizeBytes: 10,
        })
        expect(document.timeline.map((entry) => entry.kind)).toEqual(['recorded', 'photo'])

        const stop = await find.execute({
          ...actorOf(scenario),
          occurrenceId: fixture.reopenedId,
          occurrenceKind: 'stop',
        })
        expect(stop.note).toBe('cliente fechado')
        expect(stop.attachments).toEqual([
          {
            contentType: 'image/jpeg',
            messageId: fixture.messageId,
            name: 'boleto.jpg',
            objectId: fixture.chatObjectId,
            sizeBytes: 10,
          },
        ])
        expect(stop.timeline.map((entry) => entry.kind)).toEqual([
          'recorded',
          'resolution.resolved',
          'resolution.reopened',
        ])

        const signed = await find.execute({
          ...actorOf(scenario),
          occurrenceId: fixture.stopMineId,
          occurrenceKind: 'stop',
        })
        expect(signed.signature?.objectId).toBe(fixture.signatureObjectId)

        const cancelled: DriverRouteOccurrenceDetail = await find.execute({
          ...actorOf(scenario),
          occurrenceId: fixture.cancelledId,
          occurrenceKind: 'document',
        })
        expect(cancelled.timeline.map((entry) => entry.kind)).toEqual(['recorded', 'cancelled'])
        expect(JSON.stringify(cancelled)).not.toContain('tenants/')
      })
    },
    90_000,
  )

  testWithPostgres(
    'o ajudante da tripulação vê as ocorrências, mas a conversa e os anexos são do motorista',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const fixture = await seedOccurrences(database, scenario)
        const { find, list } = harness(database)

        const items = await list.execute(actorOf(scenario, 'helper'))
        expect(items).toHaveLength(6)
        const mine = items.find((item) => item.id === fixture.stopMineId)
        expect(mine?.recordedByMe).toBe(false)
        const reopened = items.find((item) => item.id === fixture.reopenedId)
        expect(reopened).toMatchObject({ conversation: { exists: false }, documentCount: 0 })

        const detail = await find.execute({
          ...actorOf(scenario, 'helper'),
          occurrenceId: fixture.reopenedId,
          occurrenceKind: 'stop',
        })
        expect(detail.attachments).toEqual([])
      })
    },
    90_000,
  )

  testWithPostgres(
    'outra viagem do mesmo motorista, outra empresa e id do tipo errado são o mesmo 404',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const fixture = await seedOccurrences(database, scenario)
        const { find, list } = harness(database)

        const otherDriverId = crypto.randomUUID()
        await database.db.insert(fleetDrivers).values({
          companyId: scenario.company.companyId,
          id: otherDriverId,
          name: 'Motorista Três',
          taxId: '33344455566',
        })
        const otherTrip = await seedTrip(database, scenario.company, 'in_transit')
        await database.db.delete(tripDrivers).where(eq(tripDrivers.tripId, otherTrip.tripId))
        await database.db.insert(tripDrivers).values({
          companyId: scenario.company.companyId,
          driverId: otherDriverId,
          driverName: 'Motorista Três',
          driverTaxId: '33344455566',
          position: 1n,
          tripId: otherTrip.tripId,
        })
        const otherUserId = await linkDriverMembership(database, scenario.company, otherDriverId)
        const otherDriver = {
          companyId: scenario.company.companyId,
          driverId: otherDriverId,
          driverUserId: otherUserId,
        }

        expect(await list.execute(otherDriver)).toEqual([])
        for (const target of [
          { occurrenceId: fixture.stopMineId, occurrenceKind: 'stop' as const },
          { occurrenceId: fixture.openDocumentId, occurrenceKind: 'document' as const },
        ]) {
          expect(await rejection(() => find.execute({ ...otherDriver, ...target }))).toMatchObject(
            NOT_FOUND,
          )
        }

        const foreign = await seedCompany(database)
        await seedTrip(database, foreign, 'in_transit')
        const foreignUserId = await linkDriverMembership(database, foreign, foreign.firstDriverId)
        const foreignActor = {
          companyId: foreign.companyId,
          driverId: foreign.firstDriverId,
          driverUserId: foreignUserId,
        }
        expect(await list.execute(foreignActor)).toEqual([])
        expect(
          await rejection(() =>
            find.execute({
              ...foreignActor,
              occurrenceId: fixture.stopMineId,
              occurrenceKind: 'stop',
            }),
          ),
        ).toMatchObject(NOT_FOUND)

        expect(
          await rejection(() =>
            find.execute({
              ...actorOf(scenario),
              occurrenceId: fixture.stopMineId,
              occurrenceKind: 'document',
            }),
          ),
        ).toMatchObject(NOT_FOUND)
        expect(
          await rejection(() =>
            find.execute({
              ...actorOf(scenario),
              occurrenceId: crypto.randomUUID(),
              occurrenceKind: 'stop',
            }),
          ),
        ).toMatchObject(NOT_FOUND)
      })
    },
    90_000,
  )

  testWithPostgres(
    'com a viagem finalizada, lista e detalhe respondem DRIVER_TRIP_NOT_ACTIVE',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const fixture = await seedOccurrences(database, scenario)
        const { find, list } = harness(database)
        await database.db
          .update(trips)
          .set({ status: 'completed' })
          .where(eq(trips.id, scenario.trip.tripId))

        expect(await rejection(() => list.execute(actorOf(scenario)))).toMatchObject(NOT_ACTIVE)
        expect(
          await rejection(() =>
            find.execute({
              ...actorOf(scenario),
              occurrenceId: fixture.stopMineId,
              occurrenceKind: 'stop',
            }),
          ),
        ).toMatchObject(NOT_ACTIVE)
      })
    },
    90_000,
  )

  testWithPostgres(
    'assina o link da foto, da assinatura e do anexo do chat, e só deles',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const fixture = await seedOccurrences(database, scenario)
        const { sign, signed } = harness(database)
        const driver = actorOf(scenario)

        const signedPhoto = await sign.execute({
          ...driver,
          objectId: fixture.photoObjectId,
          occurrenceId: fixture.openDocumentId,
          occurrenceKind: 'document',
        })
        expect(signedPhoto.url).toContain(fixture.photoObjectId)
        expect(Date.parse(signedPhoto.expiresAt) - Date.now()).toBeGreaterThan(290_000)
        await sign.execute({
          ...driver,
          objectId: fixture.signatureObjectId,
          occurrenceId: fixture.stopMineId,
          occurrenceKind: 'stop',
        })
        await sign.execute({
          ...driver,
          objectId: fixture.chatObjectId,
          occurrenceId: fixture.reopenedId,
          occurrenceKind: 'stop',
        })
        expect(signed.map((item) => item.filename)).toEqual([
          'ocorrencia',
          'ocorrencia',
          'boleto.jpg',
        ])
        expect(signed.every((item) => item.expiresInSeconds === 300)).toBe(true)

        const refused = [
          {
            objectId: fixture.photoObjectId,
            occurrenceId: fixture.stopMineId,
            occurrenceKind: 'stop' as const,
          },
          {
            objectId: fixture.chatObjectId,
            occurrenceId: fixture.stopMineId,
            occurrenceKind: 'stop' as const,
          },
          {
            objectId: fixture.signatureObjectId,
            occurrenceId: fixture.reopenedId,
            occurrenceKind: 'stop' as const,
          },
          {
            objectId: crypto.randomUUID(),
            occurrenceId: fixture.openDocumentId,
            occurrenceKind: 'document' as const,
          },
        ]
        for (const target of refused) {
          expect(await rejection(() => sign.execute({ ...driver, ...target }))).toMatchObject(
            ATTACHMENT_NOT_FOUND,
          )
        }
        expect(signed).toHaveLength(3)

        expect(
          await rejection(() =>
            sign.execute({
              ...driver,
              objectId: fixture.photoObjectId,
              occurrenceId: crypto.randomUUID(),
              occurrenceKind: 'document',
            }),
          ),
        ).toMatchObject(NOT_FOUND)
      })
    },
    90_000,
  )

  testWithPostgres(
    'objeto de outra empresa, anexo do chat de outro usuário, retenção vencida e viagem finalizada não assinam',
    async () => {
      await withConversationDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const fixture = await seedOccurrences(database, scenario)
        const { sign, signed } = harness(database)
        const foreign = await seedCompany(database)
        const foreignObjectId = await seedPhotoObject(database, {
          company: foreign,
          purpose: 'trip_occurrence_attachment',
        })

        expect(
          await rejection(() =>
            sign.execute({
              ...actorOf(scenario),
              objectId: foreignObjectId,
              occurrenceId: fixture.openDocumentId,
              occurrenceKind: 'document',
            }),
          ),
        ).toMatchObject(ATTACHMENT_NOT_FOUND)
        expect(
          await rejection(() =>
            sign.execute({
              ...actorOf(scenario, 'helper'),
              objectId: fixture.chatObjectId,
              occurrenceId: fixture.reopenedId,
              occurrenceKind: 'stop',
            }),
          ),
        ).toMatchObject(ATTACHMENT_NOT_FOUND)

        await database.db
          .update(storedObjects)
          .set({ retentionUntil: new Date('2026-01-01T00:00:00.000Z') })
          .where(eq(storedObjects.id, fixture.photoObjectId))
        expect(
          await rejection(() =>
            sign.execute({
              ...actorOf(scenario),
              objectId: fixture.photoObjectId,
              occurrenceId: fixture.openDocumentId,
              occurrenceKind: 'document',
            }),
          ),
        ).toMatchObject(ATTACHMENT_NOT_FOUND)

        await database.db
          .update(trips)
          .set({ status: 'completed' })
          .where(eq(trips.id, scenario.trip.tripId))
        expect(
          await rejection(() =>
            sign.execute({
              ...actorOf(scenario),
              objectId: fixture.signatureObjectId,
              occurrenceId: fixture.stopMineId,
              occurrenceKind: 'stop',
            }),
          ),
        ).toMatchObject(NOT_ACTIVE)
        expect(signed).toEqual([])
      })
    },
    90_000,
  )
})
