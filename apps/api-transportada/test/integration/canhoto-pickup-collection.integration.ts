/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T4 (CA04), contra Postgres real: a foto do canhoto que o motorista da viagem nova tira vira o canhoto da
 * entrega de origem, marca a coleta (`photo_sent_at`) e fecha a parada só de coleta; a conferência que aprova o
 * canhoto fecha a coleta (`collected`) e resolve a ocorrência pelo `system` (frase `canhoto_collected`); a que reprova
 * reabre as duas. O fim da viagem da coleta não devolve a coleta já fotografada a `pending`.
 */
import { describe, expect } from 'bun:test'
import { and, desc, eq } from 'drizzle-orm'

import { nfeDocuments } from '../../src/database/nfe.schema.js'
import { tripOccurrenceResolutionEvents } from '../../src/database/occurrence-conversation.schema.js'
import {
  tripCanhotoPickups,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { collectCanhotoPickupPhoto } from '../../src/trips/application/collect-canhoto-pickup-photo.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import type { CanhotoReviewCommand } from '../../src/trips/application/canhoto-review.port.js'
import { reviewCanhotoProof } from '../../src/trips/application/review-canhoto-proof.use-case.js'
import { createDrizzleCanhotoPickupCollection } from '../../src/trips/infrastructure/canhoto-pickup-collection.persistence.js'
import { createDrizzleCanhotoPickupSchedule } from '../../src/trips/infrastructure/canhoto-pickup-schedule.persistence.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleCanhotoReviewUnitOfWork } from '../../src/trips/infrastructure/drizzle-canhoto-review.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { listAllResolutionEventsByOccurrence } from '../../src/trips/infrastructure/drizzle-occurrence-resolution.repository.js'
import { resolveOccurrenceResolutionState } from '../../src/trips/domain/occurrence-resolution.policy.js'
import {
  FAKE_ENVELOPE,
  JPEG_BYTES,
  linkDriverMembership,
  seedCompany,
  seedStopArrival,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 120_000
const TEST_BUCKET = 'test-bucket'

type World = Readonly<{
  company: Company
  database: TestDatabase
  occurrenceId: string
  origin: SeededTrip
  originDriverUserId: string
  pickupDriverUserId: string
  pickupId: string
  target: SeededTrip
}>

/** A entrega de origem com a coleta registrada pelo motorista 1, encaixada na viagem do motorista 2 (T2 + T3). */
async function buildWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const origin = await seedTrip(database, company, 'in_transit')
  await seedStopArrival(database, origin, new Date('2026-09-18T08:30:00.000Z'))
  const originDriverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const pickupDriverUserId = await linkDriverMembership(database, company, company.secondDriverId)
  const originDriver = {
    actorUserId: originDriverUserId,
    companyId: company.companyId,
    documentId: origin.documentId,
    driverId: company.firstDriverId,
  }
  await reportDocumentDelivery({
    ...originDriver,
    idempotencyKey: `entrega-${crypto.randomUUID()}`,
    location: null,
    now: new Date(),
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, TEST_BUCKET),
  })
  const type = await saveOccurrenceType(database.db, {
    active: true,
    allowsMultipleItems: false,
    blocksContractorNotice: true,
    companyId: company.companyId,
    countsCargoOnPickupTrip: false,
    createsCanhotoPickup: true,
    duplicateRequestPolicy: 'until_resolved',
    emailTemplateKey: null,
    moments: ['document', 'office'],
    name: 'Canhoto retido pelo cliente',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
  })
  const occurrence = await registerDriverOccurrence({
    ...originDriver,
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente ficou com o canhoto',
    occurrenceTypeId: type.id,
    productCode: '',
    repository: {
      findConfirmedUpload: async () => null,
      findOccurrenceType: (query) => findOccurrenceType(database.db, query),
      findOccurrenceTypeOverrides: async () => ({
        contractorOverrides: [],
        recipientOverrides: [],
      }),
      findReachableDocument: (query) => findDriverReachableDocument(database.db, query),
      listDocumentProducts: (query) => listDocumentProducts(database.db, query),
    },
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, TEST_BUCKET),
  })
  const [pickup] = await database.db
    .select({ id: tripCanhotoPickups.id })
    .from(tripCanhotoPickups)
    .where(eq(tripCanhotoPickups.occurrenceId, occurrence.id))
  if (pickup === undefined) throw new Error('pickup not created')

  const target = await seedTrip(database, company, 'on_delivery_route')
  await createDrizzleCanhotoPickupSchedule(database.db).schedule({
    actorUserId: company.userId,
    companyId: company.companyId,
    correlationId: 'integration-canhoto-pickup-collection',
    pickupId: pickup.id,
    tripId: target.tripId,
  })
  return {
    company,
    database,
    occurrenceId: occurrence.id,
    origin,
    originDriverUserId,
    pickupDriverUserId,
    pickupId: pickup.id,
    target,
  }
}

function sendPhoto(world: World, driverId = world.company.secondDriverId) {
  const { database } = world
  return collectCanhotoPickupPhoto({
    actorUserId: world.pickupDriverUserId,
    attach: (attach) =>
      attachDeliveryProof({
        actorUserId: world.pickupDriverUserId,
        canhotoPickup: { originTripId: attach.originTripId },
        channel: attach.channel,
        companyId: world.company.companyId,
        documentId: attach.documentId,
        driverId: attach.driverId,
        newObjectId: () => crypto.randomUUID(),
        newProofId: () => crypto.randomUUID(),
        now: new Date(),
        repository: new DrizzleDeliveryProofRepository(database.db, TEST_BUCKET),
        sealDocument: async () => FAKE_ENVELOPE,
        storage: { store: async () => ({ sha256: 'e'.repeat(64) }) },
        upload: attach.upload,
      }),
    channel: 'driver_app',
    collection: createDrizzleCanhotoPickupCollection(database.db),
    companyId: world.company.companyId,
    driverId,
    now: new Date(),
    pickupId: world.pickupId,
    upload: {
      attachmentKey: `pickup-${crypto.randomUUID()}`,
      bytes: JPEG_BYTES,
      capturedAt: undefined,
      kind: 'photo',
      mimeType: 'image/jpeg',
      position: undefined,
      receiverDocument: '',
      receiverName: '',
    },
  })
}

function review(world: World, command: CanhotoReviewCommand) {
  return reviewCanhotoProof({
    actorUserId: world.company.userId,
    channel: command.action === 'automatic' ? 'service' : 'person',
    command,
    companyId: world.company.companyId,
    correlationId: 'integration-canhoto-pickup-collection',
    documentId: world.origin.documentId,
    ipAddress: '203.0.113.9',
    tripId: world.origin.tripId,
    unitOfWork: new DrizzleCanhotoReviewUnitOfWork(world.database.db),
  })
}

async function originNumber(world: World): Promise<string> {
  const [row] = await world.database.db
    .select({ number: nfeDocuments.number })
    .from(tripDocuments)
    .innerJoin(nfeDocuments, eq(nfeDocuments.id, tripDocuments.nfeDocumentId))
    .where(eq(tripDocuments.id, world.origin.documentId))
  if (row === undefined) throw new Error('origin number missing')
  return row.number
}

async function readPickup(world: World) {
  const [row] = await world.database.db
    .select()
    .from(tripCanhotoPickups)
    .where(eq(tripCanhotoPickups.id, world.pickupId))
  if (row === undefined) throw new Error('pickup missing')
  return row
}

async function readStop(world: World, stopId: string) {
  const [row] = await world.database.db.select().from(tripStops).where(eq(tripStops.id, stopId))
  return row
}

async function readOriginCanhoto(world: World) {
  return world.database.db
    .select({
      channel: tripDeliveryProofs.channel,
      id: tripDeliveryProofs.id,
      punctuality: tripDeliveryProofs.punctuality,
      review: tripDeliveryProofs.canhotoReview,
    })
    .from(tripDeliveryProofs)
    .innerJoin(tripStopEvents, eq(tripStopEvents.id, tripDeliveryProofs.stopEventId))
    .where(
      and(
        eq(tripStopEvents.tripDocumentId, world.origin.documentId),
        eq(tripDeliveryProofs.kind, 'photo'),
      ),
    )
}

async function readResolutionEvents(world: World) {
  return world.database.db
    .select({
      actorKind: tripOccurrenceResolutionEvents.actorKind,
      canhotoPickupId: tripOccurrenceResolutionEvents.canhotoPickupId,
      kind: tripOccurrenceResolutionEvents.kind,
    })
    .from(tripOccurrenceResolutionEvents)
    .where(eq(tripOccurrenceResolutionEvents.documentOccurrenceId, world.occurrenceId))
    .orderBy(tripOccurrenceResolutionEvents.sequence)
}

describe('a coleta de canhoto se fecha pelo canhoto da nota de origem (spec 321 T4, CA04)', () => {
  testWithPostgres(
    'a foto do motorista da viagem nova vira o canhoto da origem; aprovado resolve, reprovado reabre',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const scheduled = await readPickup(world)
        const pickupStopId = scheduled.pickupStopId
        if (pickupStopId === null) throw new Error('pickup stop missing')

        /** O bot oferece a coleta ao motorista da viagem dela até a foto chegar. */
        const collection = createDrizzleCanhotoPickupCollection(database.db)
        const listFor = (driverId: string) =>
          collection.listScheduled({ companyId: world.company.companyId, driverId })
        expect((await listFor(world.company.secondDriverId)).map((row) => row.pickupId)).toEqual([
          world.pickupId,
        ])
        expect((await listFor(world.company.secondDriverId))[0]?.originTripDocumentId).toBe(
          world.origin.documentId,
        )

        const sent = await sendPhoto(world)
        expect(await listFor(world.company.secondDriverId)).toEqual([])
        expect(sent.documentId).toBe(world.origin.documentId)
        expect(sent.stopClosed).toBe(true)
        /** A viagem da coleta tem outra parada aberta (a nota dela): não conclui. */
        expect(sent.tripCompleted).toBe(false)

        const canhotos = await readOriginCanhoto(world)
        expect(canhotos).toHaveLength(1)
        expect(canhotos[0]).toMatchObject({
          channel: 'driver_app',
          id: sent.proof.id,
          punctuality: 'not_required',
          review: 'pending',
        })
        const photographed = await readPickup(world)
        expect(photographed.status).toBe('scheduled')
        expect(photographed.photoSentAt).not.toBeNull()
        expect((await readStop(world, pickupStopId))?.completedAt).not.toBeNull()

        /** A leitura do worker casa o número da nota de origem: aprova, fecha a coleta e resolve a ocorrência. */
        await review(world, {
          action: 'automatic',
          readDocumentId: world.origin.documentId,
          readNumber: await originNumber(world),
          readSeries: '1',
          readSource: 'barcode',
        })
        const collected = await readPickup(world)
        expect(collected.status).toBe('collected')
        expect(collected.collectedAt).not.toBeNull()
        expect(await readResolutionEvents(world)).toEqual([
          { actorKind: 'system', canhotoPickupId: world.pickupId, kind: 'resolved' },
        ])
        const state = resolveOccurrenceResolutionState({
          cancelledAt: undefined,
          events: await listAllResolutionEventsByOccurrence(database.db, {
            companyId: world.company.companyId,
            occurrenceIds: [world.occurrenceId],
            occurrenceKind: 'document',
          }).then((rows) => rows.get(world.occurrenceId) ?? []),
        })
        expect(state.state).toBe('resolved')
        expect(state.lastResolution).toMatchObject({ causedByCanhotoPickup: true })

        /** A pessoa reprova (sobrepõe a aprovação automática): a coleta volta a esperar e a ocorrência reabre. */
        await review(world, {
          action: 'reject',
          note: 'assinatura ilegível no canhoto coletado',
          reason: 'other',
        })
        const reopened = await readPickup(world)
        expect(reopened).toMatchObject({
          collectedAt: null,
          photoSentAt: null,
          pickupStopId,
          pickupTripId: world.target.tripId,
          status: 'scheduled',
        })
        expect(await readResolutionEvents(world)).toEqual([
          { actorKind: 'system', canhotoPickupId: world.pickupId, kind: 'resolved' },
          { actorKind: 'system', canhotoPickupId: world.pickupId, kind: 'reopened' },
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a última parada fechada pela foto conclui a viagem, e a coleta fotografada não volta a pendente',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const at = new Date('2026-09-18T10:00:00.000Z')
        /** A nota da viagem da coleta já foi entregue: só a parada da coleta segue aberta. */
        await database.db
          .update(tripDocuments)
          .set({ deliveredAt: at, separationStatus: 'delivered' })
          .where(eq(tripDocuments.id, world.target.documentId))
        await database.db
          .update(tripStops)
          .set({ arrivedAt: at, completedAt: at })
          .where(eq(tripStops.id, world.target.stopId))

        const sent = await sendPhoto(world)
        expect(sent).toMatchObject({ stopClosed: true, tripCompleted: true })
        const [trip] = await database.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, world.target.tripId))
        expect(trip?.status).toBe('completed')
        const pickup = await readPickup(world)
        expect(pickup.status).toBe('scheduled')
        expect(pickup.pickupTripId).toBe(world.target.tripId)
        expect(pickup.photoSentAt).not.toBeNull()

        /** Reprovada depois de a viagem acabar: volta a `pending` para o escritório encaixar de novo. */
        await review(world, {
          action: 'reject',
          note: 'assinatura ilegível no canhoto coletado',
          reason: 'other',
        })
        expect(await readPickup(world)).toMatchObject({
          photoSentAt: null,
          pickupStopId: null,
          pickupTripId: null,
          status: 'pending',
        })
        /** Nunca resolvida: reprovar não grava `reopened`. */
        expect(await readResolutionEvents(world)).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'motorista fora da viagem da coleta recebe 404 e nada é gravado; o reenvio da mesma foto converge',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const refused = await sendPhoto(world, crypto.randomUUID()).catch((error: unknown) => error)
        expect(refused).toMatchObject({ code: 'CANHOTO_PICKUP_NOT_FOUND', status: 404 })
        expect(await readOriginCanhoto(world)).toEqual([])
        expect((await readPickup(world)).photoSentAt).toBeNull()

        await sendPhoto(world)
        const first = await readPickup(world)
        await sendPhoto(world)
        const second = await readPickup(world)
        expect(second.photoSentAt).toEqual(first.photoSentAt)
        expect(await readOriginCanhoto(world)).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'aprovar de novo não grava outro resolved: a ocorrência resolvida fica como está',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        await sendPhoto(world)
        await review(world, { action: 'approve' })
        await review(world, { action: 'approve' })
        expect((await readPickup(world)).status).toBe('collected')
        const events = await database.db
          .select({ kind: tripOccurrenceResolutionEvents.kind })
          .from(tripOccurrenceResolutionEvents)
          .where(eq(tripOccurrenceResolutionEvents.documentOccurrenceId, world.occurrenceId))
          .orderBy(desc(tripOccurrenceResolutionEvents.sequence))
        expect(events).toEqual([{ kind: 'resolved' }])
      })
    },
    TEST_TIMEOUT_MS,
  )
})
