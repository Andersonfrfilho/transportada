/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 T4.1 (CA01, CA02, CA03, ADR-0074 §1/§2): carregar a última nota — na linha ou em lote —
 * despacha a viagem sozinha, com o ator e o canal da própria carga; um gate recusado (parada sem
 * agendamento) deixa a nota carregada e a viagem esperando o botão, sem erro. A ocorrência que
 * libera a última nota pendente (spec 185 RF2, D1) também tenta o gatilho.
 *
 * Contra Postgres de verdade, pelos mesmos caso de uso e repositório que as rotas usam.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc, eq, inArray } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  deliveryClients,
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
import {
  companyOccurrenceTypes,
  tripDispatchSnapshots,
  tripDocumentOccurrences,
  tripDocuments,
  trips,
  tripStatusEvents,
  type TripStatus,
} from '../../src/database/trip.schema.js'
import type { DispatchTripPort } from '../../src/trips/application/dispatch-trip.use-case.js'
import type { DriverFieldReportTransactionPort } from '../../src/trips/application/driver-field-report.port.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import { transitionTripDocumentsBatch } from '../../src/trips/application/transition-trip-documents-batch.use-case.js'
import { withFieldReport } from '../../src/trips/application/trip-field-report.port.js'
import type { AutoDispatchLogger } from '../../src/trips/application/try-auto-dispatch-trip.use-case.js'
import {
  buildOccurrenceAttachmentCreateFingerprint,
  OCCURRENCE_ATTACHMENT_CREATE_OPERATION,
  sha256Hex,
} from '../../src/trips/domain/occurrence-attachment.policy.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import {
  findOccurrenceType,
  findTripOccurrenceById,
  listDocumentProducts,
  listTripOccurrences,
  readOccurrenceTemplateValues,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleTripDocumentBatchRepository } from '../../src/trips/infrastructure/drizzle-trip-document-batch.repository.js'
import { DrizzleTripDocumentRepository } from '../../src/trips/infrastructure/drizzle-trip-document.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const SCHEDULING_CLIENT_TAX_ID = '12345678000188'
const LEAVES_BEHIND_TYPE_NAME = 'Item faltante'
const SILENT_AUTO_DISPATCH_LOGGER = { error: () => {} }
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

describe('carregar a última nota despacha a viagem sozinha (spec 185 T4.1)', () => {
  testWithPostgres(
    'CA01: carregar a última nota (linha) despacha, com o ator e o canal da carga',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [firstId, lastId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, firstId, ['separate', 'load'])
        await moveDocument(database, trip, lastId, ['separate'])

        const result = await transitionTripDocument({
          action: 'load',
          actorUserId: trip.userId,
          autoDispatch: {
            logger: SILENT_AUTO_DISPATCH_LOGGER,
            repository: new DrizzleTripRouteRepository(database.db),
          },
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          documentId: lastId,
          repository: new DrizzleTripDocumentRepository(database.db),
          tripId: trip.tripId,
        })

        expect(result.autoDispatch).toEqual({ outcome: 'dispatched' })
        expect(await readTripStatus(database, trip.tripId)).toBe('dispatched')

        const snapshot = await readSnapshot(database, trip.tripId)
        expect(snapshot).toMatchObject({ forceReason: null, forced: false })

        const statusEvents = await readStatusEvents(database, trip.tripId)
        expect(statusEvents.at(-1)).toEqual({
          actorUserId: trip.userId,
          channel: 'backoffice',
          toStatus: 'dispatched',
        })
      })
    },
    30_000,
  )

  testWithPostgres(
    'CA02: carregar a última nota pelo lote despacha, mesmo ator e canal',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [firstId, lastId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, firstId, ['separate', 'load'])
        await moveDocument(database, trip, lastId, ['separate'])

        const result = await transitionTripDocumentsBatch({
          action: 'load',
          actorUserId: trip.userId,
          autoDispatch: {
            logger: SILENT_AUTO_DISPATCH_LOGGER,
            repository: new DrizzleTripRouteRepository(database.db),
          },
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          documentIds: [lastId],
          repository: new DrizzleTripDocumentBatchRepository(database.db),
          tripId: trip.tripId,
        })

        expect(result.autoDispatch).toEqual({ outcome: 'dispatched' })
        expect(await readTripStatus(database, trip.tripId)).toBe('dispatched')

        const statusEvents = await readStatusEvents(database, trip.tripId)
        expect(statusEvents.at(-1)).toEqual({
          actorUserId: trip.userId,
          channel: 'backoffice',
          toStatus: 'dispatched',
        })
      })
    },
    30_000,
  )

  testWithPostgres(
    'CA03: parada sem agendamento — a nota fica carregada, a viagem espera, autoDispatch.blocked com os stopIds',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, {
          documentCount: 1,
          recipientRequiresScheduling: true,
        })
        const [documentId] = trip.tripDocumentIds as [string]
        await moveDocument(database, trip, documentId, ['separate'])

        const stopIds = await readTripStopIds(database, trip.tripId)

        const result = await transitionTripDocument({
          action: 'load',
          actorUserId: trip.userId,
          autoDispatch: {
            logger: SILENT_AUTO_DISPATCH_LOGGER,
            repository: new DrizzleTripRouteRepository(database.db),
          },
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          documentId,
          repository: new DrizzleTripDocumentRepository(database.db),
          tripId: trip.tripId,
        })

        expect(result.autoDispatch).toEqual({
          code: 'TRIP_HAS_UNSCHEDULED_STOPS',
          details: { stopIds },
          outcome: 'blocked',
        })
        expect(result.document.separationStatus).toBe('loaded')
        expect(await readTripStatus(database, trip.tripId)).toBe('loading')
        expect(await readSnapshot(database, trip.tripId)).toBeUndefined()
      })
    },
    30_000,
  )

  testWithPostgres(
    'carregar uma nota que não fecha a carga: sem autoDispatch, a viagem continua',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [firstId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, firstId, ['separate'])

        const result = await transitionTripDocument({
          action: 'load',
          actorUserId: trip.userId,
          autoDispatch: {
            logger: SILENT_AUTO_DISPATCH_LOGGER,
            repository: new DrizzleTripRouteRepository(database.db),
          },
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          documentId: firstId,
          repository: new DrizzleTripDocumentRepository(database.db),
          tripId: trip.tripId,
        })

        expect(result.autoDispatch).toBeUndefined()
        expect(await readTripStatus(database, trip.tripId)).toBe('loading')
      })
    },
    30_000,
  )

  testWithPostgres(
    'ocorrência de nota inteira "segue sem a nota" na última pendente despacha e libera a nota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [leftBehindId, loadedId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, loadedId, ['separate', 'load'])

        const occurrenceTypeId = crypto.randomUUID()
        await database.db.insert(companyOccurrenceTypes).values({
          companyId: trip.companyId,
          id: occurrenceTypeId,
          leavesDocumentBehind: true,
          name: LEAVES_BEHIND_TYPE_NAME,
          stage: 'separation',
        })

        const registered = await registerWholeDocumentOccurrence(database, trip, {
          documentId: leftBehindId,
          logger: SILENT_AUTO_DISPATCH_LOGGER,
          occurrenceTypeId,
          routeRepository: new DrizzleTripRouteRepository(database.db),
        })

        expect(registered.autoDispatch).toEqual({ outcome: 'dispatched' })
        expect(await readTripStatus(database, trip.tripId)).toBe('dispatched')
        expect(await readDocumentStates(database, [leftBehindId, loadedId])).toEqual(
          new Map([
            [leftBehindId, { isReleased: true, separationStatus: 'pending' }],
            [loadedId, { isReleased: false, separationStatus: 'loaded' }],
          ]),
        )
      })
    },
    30_000,
  )

  /**
   * Revisão da spec 185: o gatilho roda depois da carga ter comitado — falha inesperada do
   * despacho não pode virar erro sobre uma escrita que aconteceu.
   */
  testWithPostgres(
    'revisão: despacho que falha com erro genérico — a carga responde TRIP_AUTO_DISPATCH_FAILED e a nota fica loaded',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 3 })
        const [firstId, lineId, batchId] = trip.tripDocumentIds as [string, string, string]
        await moveDocument(database, trip, firstId, ['separate', 'load'])
        await moveDocument(database, trip, lineId, ['separate'])
        await moveDocument(database, trip, batchId, ['separate'])
        const logged: unknown[] = []
        const autoDispatch = {
          logger: { error: (message: string, meta?: unknown) => logged.push({ message, meta }) },
          repository: failingDispatchRepository(new DrizzleTripRouteRepository(database.db)),
        }

        // A linha carrega sem fechar a carga (sobra a do lote): nem tenta.
        const line = await transitionTripDocument({
          action: 'load',
          actorUserId: trip.userId,
          autoDispatch,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          documentId: lineId,
          repository: new DrizzleTripDocumentRepository(database.db),
          tripId: trip.tripId,
        })
        const batch = await transitionTripDocumentsBatch({
          action: 'load',
          actorUserId: trip.userId,
          autoDispatch,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          documentIds: [batchId],
          repository: new DrizzleTripDocumentBatchRepository(database.db),
          tripId: trip.tripId,
        })

        expect(line.autoDispatch).toBeUndefined()
        expect(batch.autoDispatch).toEqual({
          code: 'TRIP_AUTO_DISPATCH_FAILED',
          outcome: 'blocked',
        })
        expect(await readDocumentStates(database, [lineId, batchId])).toEqual(
          new Map([
            [lineId, { isReleased: false, separationStatus: 'loaded' }],
            [batchId, { isReleased: false, separationStatus: 'loaded' }],
          ]),
        )
        expect(await readTripStatus(database, trip.tripId)).toBe('loading')
        expect(await readSnapshot(database, trip.tripId)).toBeUndefined()
        expect(logged).toEqual([
          {
            message: 'trip_auto_dispatch_failed',
            meta: { companyId: trip.companyId, errorCode: 'Error', tripId: trip.tripId },
          },
        ])
      })
    },
    30_000,
  )

  testWithPostgres(
    'revisão: ocorrência dentro de withFieldReport com despacho falhando — a chave liquida e o reenvio não duplica',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [leftBehindId, loadedId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, loadedId, ['separate', 'load'])
        const occurrenceTypeId = crypto.randomUUID()
        await database.db.insert(companyOccurrenceTypes).values({
          companyId: trip.companyId,
          id: occurrenceTypeId,
          leavesDocumentBehind: true,
          name: LEAVES_BEHIND_TYPE_NAME,
          stage: 'separation',
        })

        const idempotencyKey = crypto.randomUUID()
        const register = () =>
          registerWithFieldReport(database, trip, {
            documentId: leftBehindId,
            idempotencyKey,
            occurrenceTypeId,
            routeRepository: failingDispatchRepository(new DrizzleTripRouteRepository(database.db)),
          })

        const first = await register()
        const replayed = await register()

        expect(first.autoDispatch).toEqual({
          code: 'TRIP_AUTO_DISPATCH_FAILED',
          outcome: 'blocked',
        })
        expect(replayed.id).toBe(first.id)
        const occurrences = await database.db
          .select({ id: tripDocumentOccurrences.id })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.tripDocumentId, leftBehindId))
        expect(occurrences).toEqual([{ id: first.id }])
        expect(await readTripStatus(database, trip.tripId)).toBe('loading')
      })
    },
    30_000,
  )
})

/** O repositório de verdade para ler; o despacho falha com um erro que nenhum gate conhece. */
function failingDispatchRepository(routeRepository: DrizzleTripRouteRepository): DispatchTripPort {
  return {
    dispatch: async () => {
      throw new Error('simulated dispatch failure')
    },
    readPreconditions: (input) => routeRepository.readPreconditions(input),
  }
}

async function registerWholeDocumentOccurrence(
  database: TestDatabase,
  trip: SeededTrip,
  input: {
    readonly documentId: string
    readonly logger: AutoDispatchLogger
    readonly occurrenceTypeId: string
    readonly routeRepository: DispatchTripPort
  },
) {
  return registerTripOccurrence({
    actorUserId: trip.userId,
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    autoDispatch: {
      channel: TRIP_FIELD_CHANNELS.backoffice,
      logger: input.logger,
      repository: input.routeRepository,
    },
    companyId: trip.companyId,
    documentId: input.documentId,
    note: 'Item não encontrado no galpão.',
    occurredOn: '24/09/2026',
    occurrenceTypeId: input.occurrenceTypeId,
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
}

/** Molde de `main.ts` (rota `POST .../occurrences`): o registro dentro de `withFieldReport`. */
async function registerWithFieldReport(
  database: TestDatabase,
  trip: SeededTrip,
  input: {
    readonly documentId: string
    readonly idempotencyKey: string
    readonly occurrenceTypeId: string
    readonly routeRepository: DispatchTripPort
  },
) {
  const fieldReports = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
  return withFieldReport({
    guard: {
      actorUserId: trip.userId,
      authorship: { channel: TRIP_FIELD_CHANNELS.driverApp, onBehalfOfDriverId: null },
      companyId: trip.companyId,
      idempotencyKey: input.idempotencyKey,
      operation: `${OCCURRENCE_ATTACHMENT_CREATE_OPERATION}:${buildOccurrenceAttachmentCreateFingerprint(
        {
          attachmentSha256: sha256Hex(JPEG_BYTES),
          documentId: input.documentId,
          note: 'Item não encontrado no galpão.',
          occurrenceTypeId: input.occurrenceTypeId,
          productCode: '',
        },
      )}`,
      transaction: {
        claim: (claim: Parameters<DriverFieldReportTransactionPort['claim']>[0]) =>
          fieldReports.execute((transaction) => transaction.claim(claim)),
        settle: (settle: Parameters<DriverFieldReportTransactionPort['settle']>[0]) =>
          fieldReports.execute((transaction) => transaction.settle(settle)),
      },
    },
    perform: () =>
      registerWholeDocumentOccurrence(database, trip, {
        documentId: input.documentId,
        logger: SILENT_AUTO_DISPATCH_LOGGER,
        occurrenceTypeId: input.occurrenceTypeId,
        routeRepository: input.routeRepository,
      }),
    recall: async (resultId) => {
      const occurrence = await findTripOccurrenceById(database.db, {
        companyId: trip.companyId,
        occurrenceId: resultId,
      })
      if (occurrence === null) return null
      return { ...occurrence, attachments: [], email: null }
    },
  })
}

type SeededTrip = {
  readonly companyId: string
  readonly tripDocumentIds: readonly string[]
  readonly tripId: string
  readonly userId: string
}

async function seedPlannedTrip(
  database: TestDatabase,
  input: { readonly documentCount: number; readonly recipientRequiresScheduling?: boolean },
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
    plate: 'ABC1D24',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    name: 'Motorista 185 T4',
    taxId: '22222222222',
  })
  if (input.recipientRequiresScheduling === true) {
    await database.db.insert(deliveryClients).values({
      companyId,
      displayName: 'Cliente que agenda',
      requiresScheduling: true,
      taxId: SCHEDULING_CLIENT_TAX_ID,
    })
  }

  const tripRepository = new DrizzleTripRepository(database.db)
  const trip = await tripRepository.create({
    actorUserId: userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId,
    crew: [{ driverId, driverName: 'Motorista 185 T4', driverTaxId: '22222222222', position: 1 }],
    vehicleId,
  })

  const tripDocumentIds: string[] = []
  for (let index = 1; index <= input.documentCount; index += 1) {
    const nfeDocumentId = await seedNfeDocument(database, {
      companyId,
      recipientTaxId: SCHEDULING_CLIENT_TAX_ID,
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

async function readDocumentStates(
  database: TestDatabase,
  tripDocumentIds: readonly string[],
): Promise<Map<string, { readonly isReleased: boolean; readonly separationStatus: string }>> {
  const rows = await database.db
    .select({
      id: tripDocuments.id,
      releasedAt: tripDocuments.releasedAt,
      separationStatus: tripDocuments.separationStatus,
    })
    .from(tripDocuments)
    .where(inArray(tripDocuments.id, [...tripDocumentIds]))

  return new Map(
    tripDocumentIds.map((id) => {
      const row = rows.find((candidate) => candidate.id === id)
      if (row === undefined) throw new Error('EXPECTED_TRIP_DOCUMENT')
      return [id, { isReleased: row.releasedAt !== null, separationStatus: row.separationStatus }]
    }),
  )
}

async function readSnapshot(
  database: TestDatabase,
  tripId: string,
): Promise<typeof tripDispatchSnapshots.$inferSelect | undefined> {
  const [row] = await database.db
    .select()
    .from(tripDispatchSnapshots)
    .where(eq(tripDispatchSnapshots.tripId, tripId))
  return row
}

async function readTripStatus(database: TestDatabase, tripId: string): Promise<TripStatus> {
  const [row] = await database.db
    .select({ status: trips.status })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1)
  if (row === undefined) throw new Error('EXPECTED_TRIP')
  return row.status
}

async function readTripStopIds(database: TestDatabase, tripId: string): Promise<readonly string[]> {
  const rows = await database.db
    .select({ id: tripDocuments.stopId })
    .from(tripDocuments)
    .where(eq(tripDocuments.tripId, tripId))
  return rows.map((row) => row.id).filter((id): id is string => id !== null)
}

async function readStatusEvents(
  database: TestDatabase,
  tripId: string,
): Promise<readonly { actorUserId: string; channel: string; toStatus: TripStatus }[]> {
  return database.db
    .select({
      actorUserId: tripStatusEvents.actorUserId,
      channel: tripStatusEvents.channel,
      toStatus: tripStatusEvents.toStatus,
    })
    .from(tripStatusEvents)
    .where(eq(tripStatusEvents.tripId, tripId))
    .orderBy(asc(tripStatusEvents.occurredAt), asc(tripStatusEvents.id))
}

async function seedNfeDocument(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly recipientTaxId: string
    readonly suffix: string
    readonly userId: string
  },
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
    objectKey: `nfe/185-t4-${input.suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-185-t4-${input.suffix}`,
    id: importId,
    idempotencyKey: `spec-185-t4-${input.suffix}`,
    requestFingerprint: `fingerprint-185-t4-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.suffix}${'2'.repeat(43)}`,
    authorizationProtocol: `protocol-185-t4-${input.suffix}`,
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
    taxId: input.recipientTaxId,
  })
  await database.db.insert(nfeAddresses).values({
    city: 'Ribeirao Preto',
    cityCode: '3543402',
    companyId: input.companyId,
    number: '100',
    participantId,
    postalCode: '14010100',
    state: 'SP',
    street: 'Rua do Gatilho Automático',
  })

  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_s185t41_${crypto.randomUUID().replaceAll('-', '')}`
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
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
