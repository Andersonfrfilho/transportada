/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1b.3 (CA00), contra Postgres real: cada caso de uso registra só no próprio momento, com
 * os códigos de erro reais (conferidos em `trip.error.ts`) — motorista com tipo só de galpão na rota
 * de nota → `409 TRIP_DOCUMENT_NOT_REACHABLE`; separador com tipo só de nota na rota do galpão →
 * `422 OCCURRENCE_TYPE_NOT_SEPARATION`; escritório com tipo de nota sem `office` → `422
 * OCCURRENCE_TYPE_NOT_FIELD`. Nenhuma recusa grava ocorrência. A conta com os dois papéis repete
 * cada caso e recebe a mesma recusa: a guarda é do caso de uso, nunca de quem chama (a política da
 * rota, inalterada, é provada pelos contratos de rota). O tipo `separation + document` aparece nas
 * duas listas com o mesmo id, e os dois papéis o registram, cada um no seu momento.
 *
 * Os tipos nascem pelo mesmo `saveOccurrenceType` da rota de cadastro, com `moments`.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { identityUsers, userCompanyMemberships } from '../../src/database/database.schema.js'
import { tripDocumentOccurrences } from '../../src/database/trip.schema.js'
import {
  OCCURRENCE_MOMENT,
  type OccurrenceMoment,
} from '../../src/shared/trip-occurrence.constant.js'
import { listFieldOccurrenceTypes } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { occurrenceTypeAcceptsMoment } from '../../src/trips/domain/occurrence-moment.policy.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
  listOccurrenceTypes,
  listTripOccurrences,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
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

async function seedType(
  world: World,
  input: { readonly moments: readonly OccurrenceMoment[]; readonly name: string },
): Promise<string> {
  const saved = await saveOccurrenceType(world.database.db, {
    active: true,
    allowsMultipleItems: true,
    companyId: world.company.companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    moments: input.moments,
    name: input.name,
    notifies: false,
    occurrenceTypeId: null,
    stage: input.moments.includes(OCCURRENCE_MOMENT.separation) ? 'separation' : 'delivery',
  })
  return saved.id
}

/** Uma segunda conta da mesma empresa — a que, no token, teria separador e motorista juntos. */
async function seedDualRoleAccount(world: World): Promise<string> {
  const userId = crypto.randomUUID()
  await world.database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await world.database.db.insert(userCompanyMemberships).values({
    companyId: world.company.companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId,
  })
  return userId
}

function registerAsDriver(world: World, input: { actorUserId: string; typeId: string }) {
  const { database } = world
  return registerDriverOccurrence({
    actorUserId: input.actorUserId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: world.company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente recusou',
    occurrenceTypeId: input.typeId,
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

function registerAsSeparator(world: World, input: { actorUserId: string; typeId: string }) {
  const { database } = world
  return registerTripOccurrence({
    actorUserId: input.actorUserId,
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    note: 'caixa amassada',
    occurredOn: '06/10/2026',
    occurrenceTypeId: input.typeId,
    productCode: '',
    repository: {
      findOccurrenceType: (query) => findOccurrenceType(database.db, query),
      listDocumentProducts: (query) => listDocumentProducts(database.db, query),
      listOccurrences: (query) => listTripOccurrences(database.db, query),
      readTemplateValues: async () => {
        throw new Error('a ocorrência sem aviso não lê o modelo')
      },
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

async function registerAsOffice(world: World, input: { typeId: string }): Promise<unknown> {
  const { route } = wireOccurrenceRoute(world.database)
  return route
    .execute({
      context: fakeContext(world.company),
      correlationId: 'integration-moments',
      pathParameters: { id: world.trip.tripId },
      request: multipartRequest({
        fields: {
          documentIds: [world.trip.documentId],
          note: 'portão fechado',
          occurrenceTypeId: input.typeId,
        },
        idempotencyKey: crypto.randomUUID(),
      }),
    })
    .then((response) => response.status)
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

describe('cada registro no próprio momento, contra o Postgres (spec 246 T1b.3, CA00)', () => {
  testWithPostgres(
    'o momento que o papel não cobre não grava, com o código real — e a conta com os dois papéis recebe o mesmo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const world: World = {
          company,
          database,
          trip: await seedTrip(database, company, 'in_transit'),
        }
        const warehouseOnly = await seedType(world, {
          moments: ['separation'],
          name: 'Item faltante',
        })
        const noteOnly = await seedType(world, { moments: ['document'], name: 'Recusa total' })
        const actors = [company.userId, await seedDualRoleAccount(world)]
        expect(actors).toHaveLength(2)

        for (const actorUserId of actors) {
          expect(
            await refusal(registerAsDriver(world, { actorUserId, typeId: warehouseOnly })),
          ).toEqual({ code: 'TRIP_DOCUMENT_NOT_REACHABLE', status: 409 })
          expect(
            await refusal(registerAsSeparator(world, { actorUserId, typeId: noteOnly })),
          ).toEqual({
            code: 'OCCURRENCE_TYPE_NOT_SEPARATION',
            status: 422,
          })
          expect(await refusal(registerAsOffice(world, { typeId: noteOnly }))).toEqual({
            code: 'OCCURRENCE_TYPE_NOT_FIELD',
            status: 422,
          })
        }

        expect(await countOccurrences(world)).toBe(0)
      })
    },
    120_000,
  )

  testWithPostgres(
    'separation + document aparece nas duas listas com o mesmo id, e cada papel o registra no seu momento',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const world: World = {
          company,
          database,
          trip: await seedTrip(database, company, 'in_transit'),
        }
        const both = await seedType(world, { moments: ['document', 'separation'], name: 'Avaria' })

        const catalog = await listOccurrenceTypes(database.db, { companyId: company.companyId })
        const [stored] = catalog
        expect(catalog).toHaveLength(1)
        expect(stored).toMatchObject({
          flow: 'document',
          id: both,
          moments: ['separation', 'document'],
          stage: 'separation',
        })
        const separatorList = catalog.filter((type) =>
          occurrenceTypeAcceptsMoment({ moment: OCCURRENCE_MOMENT.separation, type }),
        )
        const driverList = await listFieldOccurrenceTypes({
          companyId: company.companyId,
          repository: { listOccurrenceTypes: (query) => listOccurrenceTypes(database.db, query) },
        })
        expect(separatorList.map((type) => type.id)).toEqual([both])
        expect(driverList.map((type) => type.id)).toEqual([both])

        await registerAsSeparator(world, { actorUserId: company.userId, typeId: both })
        await registerAsDriver(world, { actorUserId: company.userId, typeId: both })

        const rows = await database.db
          .select({
            occurrenceTypeId: tripDocumentOccurrences.occurrenceTypeId,
            stage: tripDocumentOccurrences.stage,
          })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.companyId, company.companyId))
        expect(rows.map((row) => row.stage).toSorted()).toEqual(['delivery', 'separation'])
        expect(new Set(rows.map((row) => row.occurrenceTypeId))).toEqual(new Set([both]))
      })
    },
    120_000,
  )
})
