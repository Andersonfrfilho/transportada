/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T4, contra Postgres real: a trava de pedido repetido do tipo vale nos três caminhos que registram ocorrência
 * de nota. O galpão e o lote do escritório recebem `409 TRIP_OCCURRENCE_DUPLICATE_REQUEST` com o id da que já existe;
 * o app do motorista recebe a própria ocorrência aberta, sem erro (a fila offline não trava). Solucionada ou cancelada,
 * a nota aceita o tipo de novo; `allow` aceita sempre.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { tripOccurrenceResolutionEvents } from '../../src/database/occurrence-conversation.schema.js'
import type { DuplicateRequestPolicy } from '../../src/shared/occurrence-contractor-reply.constant.js'
import { tripDocumentOccurrences } from '../../src/database/trip.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
  listTripOccurrences,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { findDocumentOccurrenceSubject } from '../../src/trips/infrastructure/document-occurrence-subject.query.js'
import {
  fakeAttachmentStorage,
  fakeContext,
  JPEG_BYTES,
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

async function seedType(
  world: World,
  duplicateRequestPolicy: DuplicateRequestPolicy,
): Promise<string> {
  const saved = await saveOccurrenceType(world.database.db, {
    active: true,
    allowsMultipleItems: true,
    companyId: world.company.companyId,
    duplicateRequestPolicy,
    emailTemplateKey: null,
    moments: ['separation', 'document', 'office'],
    name: `Prorrogação do boleto ${duplicateRequestPolicy}`,
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

function registerAsSeparator(world: World, typeId: string) {
  const { database } = world
  return registerTripOccurrence({
    actorUserId: world.company.userId,
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    note: 'caixa amassada',
    occurredOn: '06/10/2026',
    occurrenceTypeId: typeId,
    productCode: '',
    repository: {
      findDocumentContractor: (query) => findDocumentOccurrenceSubject(database.db, query),
      findOccurrenceType: (query) => findOccurrenceType(database.db, query),
      listDocumentProducts: (query) => listDocumentProducts(database.db, query),
      listOccurrences: (query) => listTripOccurrences(database.db, query),
      saveOccurrence: (query) =>
        persistSeparationOccurrenceWithAttachment({
          attachment: query.attachment,
          input: { ...query, items: [] },
          newObjectId: () => crypto.randomUUID(),
          now: () => new Date(),
          storage: fakeAttachmentStorage([]),
          unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
        }),
    },
    tripId: world.trip.tripId,
  })
}

async function registerAsOffice(world: World, typeId: string): Promise<unknown> {
  const { route } = wireOccurrenceRoute(world.database)
  const response = await route.execute({
    context: fakeContext(world.company),
    correlationId: 'integration-duplicate-request',
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
  return response.status
}

async function refusal(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => 'ACCEPTED',
    (error: unknown) => ({
      code: (error as { code?: unknown }).code,
      details: (error as { details?: unknown }).details,
      status: (error as { status?: unknown }).status,
    }),
  )
}

async function occurrenceIds(world: World): Promise<readonly string[]> {
  const rows = await world.database.db
    .select({ id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.companyId, world.company.companyId))
  return rows.map((row) => row.id)
}

async function resolveByOffice(world: World, occurrenceId: string): Promise<void> {
  await world.database.db.insert(tripOccurrenceResolutionEvents).values({
    actorKind: 'internal',
    actorUserId: world.company.userId,
    companyId: world.company.companyId,
    documentOccurrenceId: occurrenceId,
    kind: 'resolved',
    note: 'Boleto prorrogado enviado.',
  })
}

async function cancel(world: World, occurrenceId: string): Promise<void> {
  await world.database.db
    .update(tripDocumentOccurrences)
    .set({
      cancellationReason: 'Registrada por engano',
      cancelledAt: new Date(),
      cancelledByUserId: world.company.userId,
    })
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

describe('a trava de pedido repetido na mesma nota (spec 276 T4)', () => {
  testWithPostgres(
    'com um pedido aberto, o galpão e o lote recebem 409 com o id, e o app recebe a ocorrência aberta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const typeId = await seedType(world, 'while_request_open')

        const first = await registerAsDriver(world, typeId)
        const repeated = await registerAsDriver(world, typeId)
        expect(repeated.id).toBe(first.id)

        expect(await refusal(registerAsSeparator(world, typeId))).toEqual({
          code: 'TRIP_OCCURRENCE_DUPLICATE_REQUEST',
          details: [{ field: 'occurrenceId', message: first.id }],
          status: 409,
        })
        expect(await refusal(registerAsOffice(world, typeId))).toMatchObject({
          code: 'TRIP_OCCURRENCE_DUPLICATE_REQUEST',
          status: 409,
        })
        expect(await occurrenceIds(world)).toEqual([first.id])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'solucionada ou cancelada, a nota aceita o mesmo tipo de novo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const typeId = await seedType(world, 'until_resolved')

        const first = await registerAsDriver(world, typeId)
        await resolveByOffice(world, first.id)
        const second = await registerAsDriver(world, typeId)
        expect(second.id).not.toBe(first.id)

        await cancel(world, second.id)
        expect(await registerAsOffice(world, typeId)).toBe(201)
        expect(await occurrenceIds(world)).toHaveLength(3)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'permitir sempre registra quantas vezes vier',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const typeId = await seedType(world, 'allow')

        await registerAsDriver(world, typeId)
        await registerAsDriver(world, typeId)
        await registerAsSeparator(world, typeId)
        expect(await registerAsOffice(world, typeId)).toBe(201)
        expect(await occurrenceIds(world)).toHaveLength(4)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'dois registros ao mesmo tempo gravam uma ocorrência só',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const typeId = await seedType(world, 'while_request_open')

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
