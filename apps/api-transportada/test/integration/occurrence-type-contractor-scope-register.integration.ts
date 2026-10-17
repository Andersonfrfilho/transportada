/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.5 (ADR-0107, D6, R4), contra Postgres real: todo caso de uso que registra ocorrência com
 * nota — motorista, separador (galpão) e escritório (lote) — recusa o tipo `listed` cuja lista não tem a
 * contratante da nota (e a nota sem contratante) com `422 OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR`,
 * sem gravar nada; e aceita quando a contratante da nota está na lista. O fluxo do operador pelo WhatsApp
 * registra pelo mesmo `registerTripOccurrence` do separador.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { contractors, nfeParticipants } from '../../src/database/database.schema.js'
import { tripDocumentOccurrences, tripDocuments } from '../../src/database/trip.schema.js'
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

const EMITTER_TAX_ID = '22333444000155'
const EXPECTED_REFUSAL = { code: 'OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR', status: 422 }
const TEST_TIMEOUT_MS = 120_000

async function seedContractor(world: World, taxId: string): Promise<string> {
  const id = crypto.randomUUID()
  await world.database.db
    .insert(contractors)
    .values({ companyId: world.company.companyId, displayName: `Contratante ${taxId}`, id, taxId })
  return id
}

/** A nota da viagem passa a ter o emitente `EMITTER_TAX_ID` — a contratante dela é a cadastrada com esse CNPJ. */
async function giveNoteAnEmitter(world: World): Promise<void> {
  const [document] = await world.database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, world.trip.documentId))
  await world.database.db.insert(nfeParticipants).values({
    companyId: world.company.companyId,
    documentId: document?.nfeDocumentId ?? '',
    id: crypto.randomUUID(),
    legalName: 'Distribuidora Alfa',
    role: 'emitter',
    taxId: EMITTER_TAX_ID,
  })
}

async function seedListedType(world: World, contractorIds: readonly string[]): Promise<string> {
  const saved = await saveOccurrenceType(world.database.db, {
    active: true,
    allowsMultipleItems: true,
    companyId: world.company.companyId,
    contractorIds,
    contractorScope: 'listed',
    emailTemplateKey: null,
    moments: ['separation', 'document', 'office'],
    name: 'Procedimento da contratante',
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
    correlationId: 'integration-scope',
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
      status: (error as { status?: unknown }).status,
    }),
  )
}

async function countOccurrences(world: World): Promise<number> {
  const rows = await world.database.db
    .select({ id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.companyId, world.company.companyId))
  return rows.length
}

async function buildWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  return { company, database, trip: await seedTrip(database, company, 'in_transit') }
}

describe('o escopo de contratantes do tipo, em cada caso de uso de nota (spec 270 T2.5)', () => {
  testWithPostgres(
    'a nota de outra contratante recebe 422 do motorista, do galpão e do lote, e nada é gravado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        await giveNoteAnEmitter(world)
        await seedContractor(world, EMITTER_TAX_ID)
        const other = await seedContractor(world, '33444555000166')
        const typeId = await seedListedType(world, [other])

        expect(await refusal(registerAsDriver(world, typeId))).toEqual(EXPECTED_REFUSAL)
        expect(await refusal(registerAsSeparator(world, typeId))).toEqual(EXPECTED_REFUSAL)
        expect(await refusal(registerAsOffice(world, typeId))).toEqual(EXPECTED_REFUSAL)
        expect(await countOccurrences(world)).toBe(0)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a nota sem contratante identificada também recebe 422 com tipo restrito',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const listed = await seedContractor(world, EMITTER_TAX_ID)
        const typeId = await seedListedType(world, [listed])

        expect(await refusal(registerAsDriver(world, typeId))).toEqual(EXPECTED_REFUSAL)
        expect(await refusal(registerAsSeparator(world, typeId))).toEqual(EXPECTED_REFUSAL)
        expect(await refusal(registerAsOffice(world, typeId))).toEqual(EXPECTED_REFUSAL)
        expect(await countOccurrences(world)).toBe(0)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a nota da contratante da lista registra no motorista, no galpão e no lote',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        await giveNoteAnEmitter(world)
        const noteContractor = await seedContractor(world, EMITTER_TAX_ID)
        const typeId = await seedListedType(world, [noteContractor])

        await registerAsDriver(world, typeId)
        await registerAsSeparator(world, typeId)
        expect(await registerAsOffice(world, typeId)).toBe(201)

        expect(await countOccurrences(world)).toBe(3)
      })
    },
    TEST_TIMEOUT_MS,
  )
})
