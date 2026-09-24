/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T4 (ADR-0067 §2) contra o Postgres de verdade: o canal e o motorista em nome de quem se
 * registrou, gravados pelos mesmos casos de uso que o PWA, o escritório e o WhatsApp usam — sem
 * caminho paralelo. O molde de `withDisposableDatabase`/`seedCompany`/`seedTrip` é o mesmo de
 * `field-trip-target.integration.ts` (T3), reduzido ao que esta prova precisa.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrences,
  tripDocuments,
  tripDrivers,
  tripFieldReports,
  tripOccurrenceUploads,
  tripStopEvents,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import type { DriverOccurrenceReadPort } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import {
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceNoteRequiredError,
} from '../../src/trips/domain/trip.error.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import { DrizzleOccurrenceUploadRepository } from '../../src/trips/infrastructure/drizzle-occurrence-upload.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-09-18T13:00:00.000Z')

type Company = {
  readonly companyId: string
  readonly driverId: string
  readonly userId: string
  readonly vehicleId: string
}

type SeededTrip = {
  readonly documentId: string
  readonly stopId: string
  readonly tripId: string
}

describe('a autoria do registro de campo contra o Postgres (spec 156 T4, ADR-0067 §2)', () => {
  testWithPostgres(
    'o motorista pelo PWA grava driver_app por omissão, sem precisar mandar o canal',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company)
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')

        await reportDocumentDelivery({
          actorUserId: company.userId,
          companyId: company.companyId,
          documentId: trip.documentId,
          driverId: company.driverId,
          idempotencyKey: 'pwa-delivery',
          location: null,
          now: NOW,
          unitOfWork,
        })

        const [event] = await database.db
          .select({
            channel: tripStopEvents.channel,
            onBehalfOfDriverId: tripStopEvents.onBehalfOfDriverId,
          })
          .from(tripStopEvents)
          .where(eq(tripStopEvents.tripDocumentId, trip.documentId))
        expect(event).toEqual({ channel: 'driver_app', onBehalfOfDriverId: null })

        const [claim] = await database.db
          .select({ channel: tripFieldReports.channel })
          .from(tripFieldReports)
          .where(
            and(
              eq(tripFieldReports.companyId, company.companyId),
              eq(tripFieldReports.idempotencyKey, 'pwa-delivery'),
            ),
          )
        expect(claim?.channel).toBe('driver_app')
      })
    },
  )

  testWithPostgres(
    'o motorista pelo WhatsApp grava whatsapp — mesmo reportDocumentDelivery do PWA',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company)
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')

        await reportDocumentDelivery({
          actorUserId: company.userId,
          channel: 'whatsapp',
          companyId: company.companyId,
          documentId: trip.documentId,
          driverId: company.driverId,
          idempotencyKey: 'whatsapp-delivery',
          location: null,
          now: NOW,
          unitOfWork,
        })

        const [event] = await database.db
          .select({
            channel: tripStopEvents.channel,
            onBehalfOfDriverId: tripStopEvents.onBehalfOfDriverId,
          })
          .from(tripStopEvents)
          .where(eq(tripStopEvents.tripDocumentId, trip.documentId))
        expect(event).toEqual({ channel: 'whatsapp', onBehalfOfDriverId: null })
      })
    },
  )

  testWithPostgres(
    'o escritório grava office com o motorista efetivo — resolveFieldTripTarget + reportDocumentDelivery',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company)
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
        const target = await resolveFieldTripTarget({
          companyId: company.companyId,
          repository: new DrizzleFieldTripTargetRepository(database.db),
          target: { kind: 'trip', tripId: trip.tripId },
        })

        await reportDocumentDelivery({
          actorUserId: company.userId,
          companyId: company.companyId,
          documentId: trip.documentId,
          idempotencyKey: 'office-delivery',
          location: null,
          now: NOW,
          /**
           * Spec 156 T6, ADR-0067 §3: o canal `office` valida `deliveredAt` contra "agora" — sem
           * isto o teste ficaria refém do relógio de parede em vez do `NOW` fixo do arquivo.
           */
          recordedAt: NOW,
          target,
          unitOfWork,
        })

        const [event] = await database.db
          .select({
            channel: tripStopEvents.channel,
            onBehalfOfDriverId: tripStopEvents.onBehalfOfDriverId,
          })
          .from(tripStopEvents)
          .where(eq(tripStopEvents.tripDocumentId, trip.documentId))
        expect(event).toEqual({ channel: 'office', onBehalfOfDriverId: company.driverId })
      })
    },
  )

  testWithPostgres(
    'a ocorrência do motorista pelo WhatsApp grava whatsapp — mesmo registerDriverOccurrence do PWA',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company)
        const occurrenceTypeId = crypto.randomUUID()
        await database.db.insert(companyOccurrenceTypes).values({
          companyId: company.companyId,
          id: occurrenceTypeId,
          name: 'Recusa total',
          stage: 'delivery',
        })

        await registerDriverOccurrence({
          actorUserId: company.userId,
          channel: 'whatsapp',
          companyId: company.companyId,
          documentId: trip.documentId,
          driverId: company.driverId,
          idempotencyKey: crypto.randomUUID(),
          note: 'cliente recusou a carga',
          occurrenceTypeId,
          productCode: '',
          repository: {
            findConfirmedUpload: async () => null,
            findOccurrenceType: (query) => findOccurrenceType(database.db, query),
            findReachableDocument: (query) => findDriverReachableDocument(database.db, query),
            listDocumentProducts: (query) => listDocumentProducts(database.db, query),
          },
          unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
        })

        const [occurrence] = await database.db
          .select({
            channel: tripDocumentOccurrences.channel,
            onBehalfOfDriverId: tripDocumentOccurrences.onBehalfOfDriverId,
          })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.tripDocumentId, trip.documentId))
        expect(occurrence).toEqual({ channel: 'whatsapp', onBehalfOfDriverId: null })
      })
    },
  )
})

/**
 * Spec 179 T203 (RF3/RF2b) contra o Postgres de verdade: o arquiteto (23/09) marcou como não
 * confirmado se o repositório Drizzle do motorista aceita `attachmentObjectId` — esta prova fecha a
 * pendência, contra o banco real, não um dublê.
 */
describe('a exigência de comprovante no registro do motorista contra o Postgres (spec 179 T203)', () => {
  testWithPostgres(
    'tipo required recusa sem anexo e sem motivo, e aceita com o upload confirmado desta viagem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company)
        const occurrenceTypeId = crypto.randomUUID()
        await database.db.insert(companyOccurrenceTypes).values({
          attachmentMode: 'required',
          companyId: company.companyId,
          id: occurrenceTypeId,
          name: 'Recusa total',
          stage: 'delivery',
        })

        const occurrenceUploadRepository = new DrizzleOccurrenceUploadRepository(database.db)
        const repository: DriverOccurrenceReadPort = {
          findConfirmedUpload: (query) => occurrenceUploadRepository.findConfirmedUpload(query),
          findOccurrenceType: (query) => findOccurrenceType(database.db, query),
          findReachableDocument: (query) => findDriverReachableDocument(database.db, query),
          listDocumentProducts: (query) => listDocumentProducts(database.db, query),
        }
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')

        await expect(
          registerDriverOccurrence({
            actorUserId: company.userId,
            companyId: company.companyId,
            documentId: trip.documentId,
            driverId: company.driverId,
            idempotencyKey: crypto.randomUUID(),
            note: '',
            occurrenceTypeId,
            productCode: '',
            repository,
            unitOfWork,
          }),
        ).rejects.toBeInstanceOf(TripOccurrenceNoteRequiredError)

        await expect(
          registerDriverOccurrence({
            actorUserId: company.userId,
            companyId: company.companyId,
            documentId: trip.documentId,
            driverId: company.driverId,
            idempotencyKey: crypto.randomUUID(),
            note: 'cliente recusou o volume',
            occurrenceTypeId,
            productCode: '',
            repository,
            unitOfWork,
          }),
        ).rejects.toBeInstanceOf(TripOccurrenceAttachmentRequiredError)

        const objectId = crypto.randomUUID()
        const objectKey = `tenants/${company.companyId}/trip-occurrence-uploads/${trip.tripId}/${objectId}`
        await database.db.insert(storedObjects).values({
          bucket: 'test-bucket',
          companyId: company.companyId,
          id: objectId,
          mimeType: 'image/jpeg',
          objectKey,
          provider: 's3',
          purpose: 'trip_occurrence_attachment',
          retentionUntil: new Date('2031-09-21T00:00:00.000Z'),
          sha256: '0'.repeat(64),
          sizeBytes: 10n,
          status: 'final',
        })
        await database.db.insert(tripOccurrenceUploads).values({
          bucket: 'test-bucket',
          companyId: company.companyId,
          confirmedAt: NOW,
          declaredSizeBytes: 10n,
          driverId: company.driverId,
          expiresAt: new Date('2026-09-19T00:00:00.000Z'),
          id: objectId,
          mimeType: 'image/jpeg',
          objectKey,
          status: 'confirmed',
          tripId: trip.tripId,
        })

        const saved = await registerDriverOccurrence({
          actorUserId: company.userId,
          attachmentObjectId: objectId,
          companyId: company.companyId,
          documentId: trip.documentId,
          driverId: company.driverId,
          idempotencyKey: crypto.randomUUID(),
          note: 'cliente recusou o volume',
          occurrenceTypeId,
          productCode: '',
          repository,
          unitOfWork,
        })

        const [occurrence] = await database.db
          .select({ attachmentObjectId: tripDocumentOccurrences.attachmentObjectId })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.id, saved.id))
        expect(occurrence).toEqual({ attachmentObjectId: objectId })
      })
    },
  )
})

async function seedCompany(database: TestDatabase): Promise<Company> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E48',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    name: 'Motorista Único',
    taxId: '11122233344',
  })

  return { companyId, driverId, userId, vehicleId }
}

async function seedTrip(database: TestDatabase, company: Company): Promise<SeededTrip> {
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const documentId = crypto.randomUUID()

  await database.db.insert(trips).values({
    companyId: company.companyId,
    /** Spec 156 T15 M9: sem despacho congelado, a hora informada não pode ser anterior a isto. */
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    id: tripId,
    status: 'in_transit',
    vehicleId: company.vehicleId,
  })
  await database.db.insert(tripDrivers).values({
    companyId: company.companyId,
    driverId: company.driverId,
    driverName: 'Motorista Único',
    driverTaxId: '11122233344',
    position: 1n,
    tripId,
  })
  await database.db.insert(tripStops).values({
    addressKey: `3550308|01001000|${tripId}`,
    /** O motorista já chegou — a chegada é passo de outra spec, fora do escopo desta prova. */
    arrivedAt: new Date('2026-09-18T09:00:00.000Z'),
    companyId: company.companyId,
    id: stopId,
    label: 'Centro, 100',
    sequence: 1n,
    tripId,
  })
  await database.db.insert(tripDocuments).values({
    companyId: company.companyId,
    id: documentId,
    loadedAt: new Date('2026-09-18T08:00:00.000Z'),
    nfeDocumentId: await seedNfeDocument(database, company),
    separatedAt: new Date('2026-09-18T07:00:00.000Z'),
    separationStatus: 'loaded',
    stopId,
    tripId,
  })

  return { documentId, stopId, tripId }
}

async function seedNfeDocument(database: TestDatabase, company: Company): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const suffix = documentId.replaceAll('-', '')
  const sha = suffix.padEnd(64, '0').slice(0, 64)
  const digits = suffix.replace(/[a-f]/g, (letter) => String(letter.charCodeAt(0) % 10))

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: company.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/trip-field-authorship-${suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: company.companyId,
    correlationId: `correlation-${suffix}`,
    id: importId,
    idempotencyKey: `trip-field-authorship-${suffix}`,
    requestFingerprint: `fingerprint-${suffix}`,
    requestedByUserId: company.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${digits}${'0'.repeat(12)}`,
    authorizationProtocol: `protocol-${suffix}`,
    companyId: company.companyId,
    createdByUserId: company.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-18T06:00:00.000Z'),
    model: '55',
    number: `1${digits.slice(0, 5)}`,
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

  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_156_t4_${crypto.randomUUID().replaceAll('-', '')}`
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
