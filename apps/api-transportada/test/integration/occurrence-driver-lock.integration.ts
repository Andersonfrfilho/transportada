/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A trava de motorista do tipo, contra Postgres real: dentro da janela, depois de existir a ocorrência do tipo na
 * nota (do escritório, aberta ou resolvida), o motorista recebe a que já existe e nada novo é gravado; o escritório
 * nunca é travado e vê o aviso; fora da janela, cancelada ou com o tipo sem trava, o motorista registra normalmente.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { tripOccurrenceResolutionEvents } from '../../src/database/occurrence-conversation.schema.js'
import { tripDocumentOccurrences } from '../../src/database/trip.schema.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
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

async function seedType(world: World, driverLockMinutes: null | number): Promise<string> {
  const saved = await saveOccurrenceType(world.database.db, {
    active: true,
    allowsMultipleItems: true,
    companyId: world.company.companyId,
    driverLockMinutes,
    emailTemplateKey: null,
    moments: ['separation', 'document', 'office'],
    name: `Prorrogação do boleto ${driverLockMinutes ?? 'sem trava'}`,
    notifies: false,
    occurrenceTypeId: null,
    stage: 'separation',
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
    note: 'cliente recusou',
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

async function registerAsOffice(world: World, typeId: string) {
  const { route } = wireOccurrenceRoute(world.database)
  const response = await route.execute({
    context: fakeContext(world.company),
    correlationId: 'integration-driver-lock',
    pathParameters: { id: world.trip.tripId },
    request: multipartRequest({
      fields: {
        documentIds: [world.trip.documentId],
        note: 'portão fechado',
        occurrenceTypeId: typeId,
      },
      idempotencyKey: crypto.randomUUID(),
    }),
  })
  const body = (await response.json()) as {
    data: { items: readonly { existingOccurrenceId?: string; id: string }[] }
  }
  return { item: body.data.items[0], status: response.status }
}

async function occurrenceIds(world: World): Promise<readonly string[]> {
  const rows = await world.database.db
    .select({ id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.companyId, world.company.companyId))
  return rows.map((row) => row.id)
}

async function ageOccurrence(world: World, occurrenceId: string, hours: number): Promise<void> {
  await world.database.db
    .update(tripDocumentOccurrences)
    .set({ createdAt: new Date(Date.now() - hours * 3_600_000) })
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, world.company.companyId),
        eq(tripDocumentOccurrences.id, occurrenceId),
      ),
    )
}

async function buildWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  return { company, database, trip: await seedTrip(database, company, 'in_transit') }
}

describe('a trava de motorista do tipo (1440 minutos por tipo e nota)', () => {
  testWithPostgres(
    'o escritório registrou antes: a fila do motorista recebe a do escritório e nada duplica',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const typeId = await seedType(world, 1440)

        const office = await registerAsOffice(world, typeId)
        expect(office.status).toBe(201)
        expect(office.item).not.toHaveProperty('existingOccurrenceId')

        const fromQueue = await registerAsDriver(world, typeId)
        expect(fromQueue.id).toBe(office.item?.id as string)
        expect(await occurrenceIds(world)).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'resolvida dentro da janela ainda trava o motorista; o escritório nunca é travado e é avisado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const typeId = await seedType(world, 1440)

        const first = await registerAsDriver(world, typeId)
        await world.database.db.insert(tripOccurrenceResolutionEvents).values({
          actorKind: 'internal',
          actorUserId: world.company.userId,
          companyId: world.company.companyId,
          documentOccurrenceId: first.id,
          kind: 'resolved',
          note: 'Boleto prorrogado enviado.',
        })
        expect((await registerAsDriver(world, typeId)).id).toBe(first.id)

        const office = await registerAsOffice(world, typeId)
        expect(office.status).toBe(201)
        expect(office.item?.existingOccurrenceId).toBe(first.id)
        expect(await occurrenceIds(world)).toHaveLength(2)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'fora da janela, cancelada ou com o tipo sem trava, o motorista registra de novo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const lockedType = await seedType(world, 1440)

        const first = await registerAsDriver(world, lockedType)
        await ageOccurrence(world, first.id, 25)
        const afterWindow = await registerAsDriver(world, lockedType)
        expect(afterWindow.id).not.toBe(first.id)

        await world.database.db
          .update(tripDocumentOccurrences)
          .set({
            cancellationReason: 'Registrada por engano',
            cancelledAt: new Date(),
            cancelledByUserId: world.company.userId,
          })
          .where(eq(tripDocumentOccurrences.id, afterWindow.id))
        await ageOccurrence(world, first.id, 48)
        const afterCancel = await registerAsDriver(world, lockedType)
        expect(afterCancel.id).not.toBe(afterWindow.id)

        const freeType = await seedType(world, null)
        const one = await registerAsDriver(world, freeType)
        const two = await registerAsDriver(world, freeType)
        expect(two.id).not.toBe(one.id)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'dois registros do motorista ao mesmo tempo gravam uma ocorrência só',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const typeId = await seedType(world, 1440)

        const [left, right] = await Promise.all([
          registerAsDriver(world, typeId),
          registerAsDriver(world, typeId),
        ])
        expect(left.id).toBe(right.id)
        expect(await occurrenceIds(world)).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )
})
