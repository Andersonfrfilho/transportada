/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (terceira revisão A-1) sobre a spec 237, contra Postgres real: o tipo `stage = 'receiving'`
 * não tem linha de momento e nenhum caso de uso de rua o aceita. Lido como "qualquer stage que não é
 * separação é rua", ele apareceria no registro da nota pelo motorista e no lote do escritório. As
 * recusas usam os códigos reais; a escrita por momentos sobre ele é 404 e não deixa linha.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyOccurrenceTypes, tripDocumentOccurrences } from '../../src/database/trip.schema.js'
import { companyOccurrenceTypeMoments } from '../../src/database/occurrence-type-moment.schema.js'
import { listFieldOccurrenceTypes } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
  listOccurrenceTypes,
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

async function seedReceivingType(world: World): Promise<string> {
  const id = crypto.randomUUID()
  await world.database.db.insert(companyOccurrenceTypes).values({
    companyId: world.company.companyId,
    flow: 'document',
    id,
    name: 'Avaria na entrada',
    stage: 'receiving',
  })
  return id
}

function registerAsDriver(world: World, typeId: string): Promise<unknown> {
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

function registerAsOffice(world: World, typeId: string): Promise<unknown> {
  const { route } = wireOccurrenceRoute(world.database)
  return route.execute({
    context: fakeContext(world.company),
    correlationId: 'integration-receiving',
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
}

async function refusal(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => 'ACCEPTED',
    (error: unknown) => ({
      code: (error as { code?: unknown }).code,
      status: (error as { status?: unknown }).status,
    }),
  )
}

async function withWorld(operation: (world: World) => Promise<void>): Promise<void> {
  await withDisposableDatabase(async (database) => {
    const company = await seedCompany(database)
    await operation({ company, database, trip: await seedTrip(database, company, 'in_transit') })
  })
}

describe('o tipo de recebimento não é de rua (spec 246 A-1, spec 237)', () => {
  testWithPostgres(
    'fica fora da lista do motorista e do cadastro, e o motorista e o escritório não o registram',
    async () => {
      await withWorld(async (world) => {
        const receivingId = await seedReceivingType(world)

        const catalog = await listOccurrenceTypes(world.database.db, {
          companyId: world.company.companyId,
        })
        expect(catalog.map((type) => type.id)).not.toContain(receivingId)
        const driverList = await listFieldOccurrenceTypes({
          companyId: world.company.companyId,
          repository: {
            listOccurrenceTypes: (query) => listOccurrenceTypes(world.database.db, query),
          },
        })
        expect(driverList.map((type) => type.id)).not.toContain(receivingId)

        expect(await refusal(registerAsDriver(world, receivingId))).toEqual({
          code: 'TRIP_DOCUMENT_NOT_REACHABLE',
          status: 409,
        })
        expect(await refusal(registerAsOffice(world, receivingId))).toEqual({
          code: 'OCCURRENCE_TYPE_NOT_FIELD',
          status: 422,
        })
        const saved = await world.database.db
          .select({ id: tripDocumentOccurrences.id })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.companyId, world.company.companyId))
        expect(saved).toHaveLength(0)
      })
    },
    120_000,
  )

  testWithPostgres(
    'a escrita por momentos sobre ele é 404 e não grava linha de momento',
    async () => {
      await withWorld(async (world) => {
        const receivingId = await seedReceivingType(world)

        expect(
          await refusal(
            saveOccurrenceType(world.database.db, {
              active: true,
              companyId: world.company.companyId,
              emailBody: '',
              emailSubject: '',
              emailTemplateKey: null,
              moments: ['document', 'office'],
              name: 'Avaria na entrada',
              notifies: false,
              occurrenceTypeId: receivingId,
              stage: 'delivery',
            }),
          ),
        ).toEqual({ code: 'TRIP_DOCUMENT_NOT_FOUND', status: 404 })

        const rows = await world.database.db
          .select({ moment: companyOccurrenceTypeMoments.moment })
          .from(companyOccurrenceTypeMoments)
          .where(eq(companyOccurrenceTypeMoments.occurrenceTypeId, receivingId))
        expect(rows).toHaveLength(0)
        const [stored] = await world.database.db
          .select({ stage: companyOccurrenceTypes.stage })
          .from(companyOccurrenceTypes)
          .where(eq(companyOccurrenceTypes.id, receivingId))
        expect(stored?.stage).toBe('receiving')
      })
    },
    120_000,
  )
})
