/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T2, contra Postgres real: registrar o tipo com coleta de canhoto numa nota entregue cria a ocorrência e a
 * coleta `pending` na mesma transação, sem tocar a linha de `trip_documents` (CA03); a nota com coleta aberta recusa
 * outro registro com coleta (D6, `until_resolved` qualquer que seja a política gravada); coleta fechada ou ocorrência
 * cancelada liberam a nota de novo.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  tripCanhotoPickups,
  tripDocumentOccurrences,
  tripDocuments,
  trips,
} from '../../src/database/trip.schema.js'
import { cancelOccurrence } from '../../src/trips/application/cancel-occurrence.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { loadCanhotoRetainedDocumentIds } from '../../src/trips/infrastructure/canhoto-pickup.query.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleOccurrenceCorrectionUnitOfWork } from '../../src/trips/infrastructure/drizzle-occurrence-correction.repository.js'
import {
  fakeContext,
  multipartRequest,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  wireOccurrenceRoute,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

type World = Readonly<{ company: Company; database: TestDatabase; trip: SeededTrip }>

const TEST_TIMEOUT_MS = 120_000
const DELIVERED_AT = new Date('2026-09-18T15:00:00.000Z')

async function seedPickupType(
  world: World,
  options: { readonly createsCanhotoPickup: boolean; readonly name: string },
): Promise<string> {
  const saved = await saveOccurrenceType(world.database.db, {
    active: true,
    allowsMultipleItems: false,
    blocksContractorNotice: true,
    companyId: world.company.companyId,
    countsCargoOnPickupTrip: false,
    createsCanhotoPickup: options.createsCanhotoPickup,
    /** De propósito: o tipo com coleta vale `until_resolved` mesmo gravado `allow` (D6). */
    duplicateRequestPolicy: 'allow',
    emailTemplateKey: null,
    moments: ['document', 'office'],
    name: options.name,
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
  })
  return saved.id
}

function registerAsDriver(world: World, typeId: string) {
  const { database } = world
  return registerDriverOccurrence({
    actorUserId: world.company.userId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: world.company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente ficou com o canhoto',
    occurrenceTypeId: typeId,
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
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
  })
}

async function registerAsOffice(world: World, typeId: string): Promise<unknown> {
  const { route } = wireOccurrenceRoute(world.database)
  return route
    .execute({
      context: fakeContext(world.company),
      correlationId: 'integration-canhoto-pickup',
      pathParameters: { id: world.trip.tripId },
      request: multipartRequest({
        fields: {
          documentIds: [world.trip.documentId],
          note: 'cliente segurou o canhoto',
          occurrenceTypeId: typeId,
        },
        idempotencyKey: crypto.randomUUID(),
      }),
    })
    .then(
      (response) => response.status,
      (error: unknown) => ({
        code: (error as { code?: unknown }).code,
        details: (error as { details?: unknown }).details,
        status: (error as { status?: unknown }).status,
      }),
    )
}

async function readDocumentRow(world: World) {
  const [row] = await world.database.db
    .select()
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, world.company.companyId),
        eq(tripDocuments.id, world.trip.documentId),
      ),
    )
  return row
}

async function readPickups(world: World) {
  return world.database.db
    .select()
    .from(tripCanhotoPickups)
    .where(eq(tripCanhotoPickups.companyId, world.company.companyId))
    .orderBy(tripCanhotoPickups.createdAt)
}

async function countOccurrences(world: World): Promise<number> {
  const rows = await world.database.db
    .select({ id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.companyId, world.company.companyId))
  return rows.length
}

async function buildDeliveredWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'on_delivery_route')
  await database.db
    .update(tripDocuments)
    .set({ deliveredAt: DELIVERED_AT, separationStatus: 'delivered' })
    .where(
      and(eq(tripDocuments.companyId, company.companyId), eq(tripDocuments.id, trip.documentId)),
    )
  return { company, database, trip }
}

describe('o registro do tipo com coleta de canhoto (spec 321 T2)', () => {
  testWithPostgres(
    'cria a ocorrência e a coleta pending juntas, e a entrega de origem fica intacta (CA03)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildDeliveredWorld(database)
        const typeId = await seedPickupType(world, {
          createsCanhotoPickup: true,
          name: 'Canhoto retido pelo cliente',
        })
        const before = await readDocumentRow(world)
        const [tripBefore] = await database.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, world.trip.tripId))

        const occurrence = await registerAsDriver(world, typeId)

        const pickups = await readPickups(world)
        expect(pickups).toHaveLength(1)
        expect(pickups[0]).toMatchObject({
          collectedAt: null,
          companyId: world.company.companyId,
          nfeDocumentId: before?.nfeDocumentId,
          occurrenceId: occurrence.id,
          originTripDocumentId: world.trip.documentId,
          pickupStopId: null,
          pickupTripId: null,
          status: 'pending',
        })
        /** Spec 321 T7 (D4d): a nota de origem sai marcada `canhotoRetained` enquanto a coleta está aberta. */
        const retained = await loadCanhotoRetainedDocumentIds(database.db, {
          companyId: world.company.companyId,
          tripDocumentIds: [world.trip.documentId],
        })
        expect(retained.has(world.trip.documentId)).toBe(true)
        expect(await readDocumentRow(world)).toEqual(before)
        const [tripAfter] = await database.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, world.trip.tripId))
        expect(tripAfter).toEqual(tripBefore)

        /** A trava de entregue segue valendo: soltar a nota entregue continua recusado pelo banco. */
        const release = await database.db
          .update(tripDocuments)
          .set({ releasedAt: new Date() })
          .where(eq(tripDocuments.id, world.trip.documentId))
          .then(
            () => 'released',
            () => 'refused',
          )
        expect(release).toBe('refused')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'tipo sem a marca não cria coleta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildDeliveredWorld(database)
        const typeId = await seedPickupType(world, {
          createsCanhotoPickup: false,
          name: 'Canhoto sem coleta',
        })
        await registerAsDriver(world, typeId)
        expect(await readPickups(world)).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'com a coleta aberta, o mesmo tipo (gravado `allow`) e outro tipo com coleta são repetidos',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildDeliveredWorld(database)
        const typeId = await seedPickupType(world, {
          createsCanhotoPickup: true,
          name: 'Canhoto retido pelo cliente',
        })
        const otherTypeId = await seedPickupType(world, {
          createsCanhotoPickup: true,
          name: 'Canhoto retido (outro)',
        })

        const first = await registerAsDriver(world, typeId)
        const repeated = await registerAsDriver(world, typeId)
        expect(repeated.id).toBe(first.id)
        expect(await registerAsOffice(world, typeId)).toMatchObject({
          code: 'TRIP_OCCURRENCE_DUPLICATE_REQUEST',
          details: [{ field: 'occurrenceId', message: first.id }],
          status: 409,
        })
        expect(await registerAsOffice(world, otherTypeId)).toMatchObject({
          code: 'TRIP_OCCURRENCE_DUPLICATE_REQUEST',
          details: [{ field: 'occurrenceId', message: first.id }],
          status: 409,
        })
        expect(await countOccurrences(world)).toBe(1)
        expect(await readPickups(world)).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'coleta fechada libera a nota; cancelar a ocorrência cancela a coleta aberta e libera também',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildDeliveredWorld(database)
        const typeId = await seedPickupType(world, {
          createsCanhotoPickup: true,
          name: 'Canhoto retido pelo cliente',
        })

        const first = await registerAsDriver(world, typeId)
        await database.db
          .update(tripCanhotoPickups)
          .set({ collectedAt: new Date(), status: 'collected' })
          .where(eq(tripCanhotoPickups.occurrenceId, first.id))

        const second = await registerAsDriver(world, typeId)
        expect(second.id).not.toBe(first.id)

        await cancelOccurrence({
          actorUserId: world.company.userId,
          companyId: world.company.companyId,
          occurrenceId: second.id,
          reason: 'Registrada por engano',
          unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
        })
        expect((await readPickups(world)).map((pickup) => pickup.status)).toEqual([
          'collected',
          'cancelled',
        ])

        expect(await registerAsOffice(world, typeId)).toBe(201)
        expect((await readPickups(world)).map((pickup) => pickup.status)).toEqual([
          'collected',
          'cancelled',
          'pending',
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a coleta que não pode nascer desfaz a ocorrência junto (mesma transação)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildDeliveredWorld(database)
        const typeId = await seedPickupType(world, {
          createsCanhotoPickup: true,
          name: 'Canhoto retido pelo cliente',
        })
        const first = await registerAsDriver(world, typeId)
        /**
         * Uma ocorrência cancelada à mão, com a coleta ainda aberta: a trava de repetido a ignora (cancelada nunca
         * conta), mas o índice de uma coleta aberta por vínculo recusa a segunda. A ocorrência nova não pode ficar.
         */
        await database.db
          .update(tripDocumentOccurrences)
          .set({
            cancellationReason: 'teste',
            cancelledAt: new Date(),
            cancelledByUserId: world.company.userId,
          })
          .where(eq(tripDocumentOccurrences.id, first.id))

        await expect(registerAsDriver(world, typeId)).rejects.toThrow()
        expect(await countOccurrences(world)).toBe(1)
        expect(await readPickups(world)).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'dois registros ao mesmo tempo gravam uma ocorrência e uma coleta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildDeliveredWorld(database)
        const typeId = await seedPickupType(world, {
          createsCanhotoPickup: true,
          name: 'Canhoto retido pelo cliente',
        })
        const [left, right] = await Promise.all([
          registerAsDriver(world, typeId),
          registerAsDriver(world, typeId),
        ])
        expect(left.id).toBe(right.id)
        expect(await countOccurrences(world)).toBe(1)
        expect(await readPickups(world)).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )
})
