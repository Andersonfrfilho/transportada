/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 T6.1 (D1, ADR-0074 §4): `GET /trips/:id` (via `DrizzleTripRepository.findById`) ganha
 * `documents[].leavesBehindOnDispatch` — a mesma conta de `resolveDispatchReadiness` que o despacho
 * usa, para o diálogo "leva todas" contar só as notas que o botão vai carregar (RF9).
 *
 * Contra Postgres de verdade, pelo mesmo repositório que a rota usa.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { companyOccurrenceTypes, tripOccurrenceCases } from '../../src/database/trip.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import {
  findOccurrenceType,
  listDocumentProducts,
  listTripOccurrences,
  readOccurrenceTemplateValues,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleTripDocumentRepository } from '../../src/trips/infrastructure/drizzle-trip-document.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const LEAVES_BEHIND_TYPE_NAME = 'Item faltante'
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

describe('leavesBehindOnDispatch no detalhe da viagem (spec 185 T6.1)', () => {
  testWithPostgres(
    'marca true na nota deixada para trás, false nas demais, e false na carregada com a mesma ocorrência',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 3 })
        const [leftBehindId, untouchedId, loadedId] = trip.tripDocumentIds as [
          string,
          string,
          string,
        ]

        const occurrenceTypeId = crypto.randomUUID()
        await database.db.insert(companyOccurrenceTypes).values({
          companyId: trip.companyId,
          id: occurrenceTypeId,
          leavesDocumentBehind: true,
          name: LEAVES_BEHIND_TYPE_NAME,
          stage: 'separation',
        })

        // A nota deixada para trás: ocorrência de nota inteira, ainda pendente.
        await registerOccurrence(database, trip, leftBehindId, occurrenceTypeId)

        // A nota carregada: mesma ocorrência, mas já `loaded` — continua carga (D1).
        await moveDocument(database, trip, loadedId, ['separate', 'load'])
        await registerOccurrence(database, trip, loadedId, occurrenceTypeId)

        const repository = new DrizzleTripRepository(database.db)
        const detail = await repository.findById({ companyId: trip.companyId, tripId: trip.tripId })
        const byId = new Map((detail?.documents ?? []).map((document) => [document.id, document]))

        expect(byId.get(leftBehindId)?.leavesBehindOnDispatch).toBe(true)
        expect(byId.get(untouchedId)?.leavesBehindOnDispatch).toBe(false)
        expect(byId.get(loadedId)?.leavesBehindOnDispatch).toBe(false)
      })
    },
    30_000,
  )

  /**
   * Revisão da spec 185 (RF1): o detalhe lê a mesma consulta do despacho — ocorrência cuja tratativa
   * foi cancelada não é mais "aberta", e a nota volta a contar como carga a levar.
   */
  testWithPostgres(
    'tratativa cancelada: a nota deixa de ser marcada para ficar para trás',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [cancelledCaseId] = trip.tripDocumentIds as [string, string]

        const occurrenceTypeId = crypto.randomUUID()
        await database.db.insert(companyOccurrenceTypes).values({
          companyId: trip.companyId,
          id: occurrenceTypeId,
          leavesDocumentBehind: true,
          name: LEAVES_BEHIND_TYPE_NAME,
          stage: 'separation',
        })
        const occurrenceId = await registerOccurrence(
          database,
          trip,
          cancelledCaseId,
          occurrenceTypeId,
        )
        await database.db.insert(tripOccurrenceCases).values({
          companyId: trip.companyId,
          occurrenceId,
          redeliveryPolicy: 'allowed',
          resolvedAt: new Date(),
          status: 'cancelled',
        })

        const detail = await new DrizzleTripRepository(database.db).findById({
          companyId: trip.companyId,
          tripId: trip.tripId,
        })
        const document = detail?.documents.find((candidate) => candidate.id === cancelledCaseId)

        expect(document?.leavesBehindOnDispatch).toBe(false)
      })
    },
    30_000,
  )
})

type SeededTrip = {
  readonly companyId: string
  readonly tripDocumentIds: readonly string[]
  readonly tripId: string
  readonly userId: string
}

async function seedPlannedTrip(
  database: TestDatabase,
  input: { readonly documentCount: number },
): Promise<SeededTrip> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId,
  })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'ABC1D25',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    name: 'Motorista 185 T6',
    taxId: '33333333333',
  })

  const tripRepository = new DrizzleTripRepository(database.db)
  const trip = await tripRepository.create({
    actorUserId: userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId,
    crew: [{ driverId, driverName: 'Motorista 185 T6', driverTaxId: '33333333333', position: 1 }],
    vehicleId,
  })

  const tripDocumentIds: string[] = []
  for (let index = 1; index <= input.documentCount; index += 1) {
    const nfeDocumentId = await seedNfeDocument(database, {
      companyId,
      suffix: String(index),
      userId,
    })
    const linked = await tripRepository.linkDocument({
      companyId,
      freightCalculationId: null,
      nfeDocumentId,
      tripId: trip.id,
    })
    tripDocumentIds.push(linked.id)
  }

  await planTripRoute({
    actorUserId: userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId,
    repository: new DrizzleTripRouteRepository(database.db),
    tripId: trip.id,
  })

  return { companyId, tripDocumentIds, tripId: trip.id, userId }
}

async function moveDocument(
  database: TestDatabase,
  trip: SeededTrip,
  documentId: string,
  actions: readonly ('load' | 'separate')[],
): Promise<void> {
  const repository = new DrizzleTripDocumentRepository(database.db)
  for (const action of actions) {
    await transitionTripDocument({
      action,
      actorUserId: trip.userId,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: trip.companyId,
      documentId,
      repository,
      tripId: trip.tripId,
    })
  }
}

/** Ocorrência de separação sobre a nota inteira — sem `autoDispatch`, nunca dispara o despacho. */
async function registerOccurrence(
  database: TestDatabase,
  trip: SeededTrip,
  documentId: string,
  occurrenceTypeId: string,
): Promise<string> {
  const registered = await registerTripOccurrence({
    actorUserId: trip.userId,
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    companyId: trip.companyId,
    documentId,
    note: 'Item não encontrado no galpão.',
    occurredOn: '24/09/2026',
    occurrenceTypeId,
    productCode: '',
    repository: {
      findOccurrenceType: (query) => findOccurrenceType(database.db, query),
      listDocumentProducts: (query) => listDocumentProducts(database.db, query),
      listOccurrences: (query) => listTripOccurrences(database.db, query),
      readTemplateValues: (query) => readOccurrenceTemplateValues(database.db, query),
      saveOccurrence: (query) =>
        persistSeparationOccurrenceWithAttachment({
          attachment: query.attachment,
          input: {
            actorUserId: query.actorUserId,
            companyId: query.companyId,
            documentId: query.documentId,
            items: query.items,
            note: query.note,
            occurrenceTypeId: query.occurrenceTypeId,
            productCode: query.productCode,
            productCodes: query.productCodes,
            stage: query.stage,
            tripId: query.tripId,
            typeName: query.typeName,
          },
          maxOriginalBytes: 960 * 1024,
          newObjectId: () => crypto.randomUUID(),
          now: () => new Date(),
          storage: {
            remove: async () => {},
            store: async () => ({ sha256: '0'.repeat(64) }),
          },
          unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
        }),
    },
    tripId: trip.tripId,
  })
  if (registered === null) throw new Error('EXPECTED_OCCURRENCE')
  return registered.id
}

async function seedNfeDocument(
  database: TestDatabase,
  input: { readonly companyId: string; readonly suffix: string; readonly userId: string },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = input.suffix.repeat(64)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/185-t6-${input.suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-185-t6-${input.suffix}`,
    id: importId,
    idempotencyKey: `spec-185-t6-${input.suffix}`,
    requestFingerprint: `fingerprint-185-t6-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.suffix}${'2'.repeat(43)}`,
    authorizationProtocol: `protocol-185-t6-${input.suffix}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-24T12:00:00.000Z'),
    model: '55',
    number: input.suffix,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '10000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '10000.0000',
    xmlObjectId,
    xmlSha256: sha,
  })

  const participantId = crypto.randomUUID()
  await database.db.insert(nfeParticipants).values({
    companyId: input.companyId,
    documentId,
    id: participantId,
    role: 'recipient',
    taxId: '12345678000188',
  })
  await database.db.insert(nfeAddresses).values({
    city: 'Ribeirao Preto',
    cityCode: '3543402',
    companyId: input.companyId,
    number: '100',
    participantId,
    postalCode: '14010100',
    state: 'SP',
    street: 'Rua do Detalhe da Viagem',
  })

  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_s185t6_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      await admin.end()
    }
  }
}
