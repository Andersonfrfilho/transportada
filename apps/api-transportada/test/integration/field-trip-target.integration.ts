/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T3 — o alvo `trip` contra Postgres de verdade. Contrato com dublê passa com `where`
 * errado, e `where` errado num filtro de tenant é o defeito que ninguém vê até alguém ver a viagem
 * de outra empresa.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

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
  tripDocuments,
  tripDrivers,
  tripStatusEvents,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { ApiError } from '../../src/shared/api.error.js'
import type { ResolvedTripFieldTarget } from '../../src/trips/application/field-trip-target.types.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import { startFieldTrip } from '../../src/trips/application/start-field-trip.use-case.js'
import { findDriverReachableDocument } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-09-18T13:00:00.000Z')

type Company = {
  readonly companyId: string
  readonly driverIds: readonly string[]
  readonly userId: string
  readonly vehicleId: string
}

type SeededTrip = {
  readonly documentId: string
  readonly stopId: string
  readonly tripId: string
}

describe('o alvo trip do escritório contra o Postgres (spec 156 T3)', () => {
  testWithPostgres('a tripulação sai da empresa do contexto, ordenada por posição', async () => {
    await withDisposableDatabase(async (database) => {
      const first = await seedCompany(database, 2)
      const second = await seedCompany(database, 1)
      const crewTrip = await seedTrip(database, first, { driverIds: [...first.driverIds] })
      const emptyTrip = await seedTrip(database, first, { driverIds: [] })
      const repository = new DrizzleFieldTripTargetRepository(database.db)

      expect(
        await repository.findTripCrew({ companyId: first.companyId, tripId: crewTrip.tripId }),
      ).toEqual({
        drivers: [
          { driverId: first.driverIds[0] ?? '', position: 1 },
          { driverId: first.driverIds[1] ?? '', position: 2 },
        ],
        tripId: crewTrip.tripId,
        tripStatus: 'in_transit',
      })
      /** Outra empresa e viagem inexistente respondem igual: ausência (R6). */
      expect(
        await repository.findTripCrew({ companyId: second.companyId, tripId: crewTrip.tripId }),
      ).toBeNull()
      expect(
        await repository.findTripCrew({ companyId: first.companyId, tripId: crypto.randomUUID() }),
      ).toBeNull()
      expect(
        await repository.findTripCrew({ companyId: first.companyId, tripId: emptyTrip.tripId }),
      ).toEqual({ drivers: [], tripId: emptyTrip.tripId, tripStatus: 'in_transit' })

      const resolved = await resolveFieldTripTarget({
        companyId: first.companyId,
        repository,
        target: { kind: 'trip', tripId: crewTrip.tripId },
      })
      expect(resolved.onBehalfOfDriverId).toBe(first.driverIds[0] ?? '')

      await expectApiError(
        resolveFieldTripTarget({
          companyId: first.companyId,
          repository,
          target: { kind: 'trip', tripId: emptyTrip.tripId },
        }),
        { code: 'TRIP_WITHOUT_DRIVER', status: 422 },
      )
      await expectApiError(
        resolveFieldTripTarget({
          companyId: second.companyId,
          repository,
          target: { kind: 'trip', tripId: crewTrip.tripId },
        }),
        { code: 'TRIP_NOT_FOUND', status: 404 },
      )
    })
  })

  testWithPostgres('parada e nota de outra viagem da mesma empresa não se alcançam', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database, 1)
      const targetTrip = await seedTrip(database, company, { driverIds: [...company.driverIds] })
      const otherTrip = await seedTrip(database, company, { driverIds: [...company.driverIds] })
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)
      const target = await resolveOn(database, company, targetTrip.tripId)

      /** A parada é 404, a nota é 409: os códigos de hoje, iguais nos dois canais (R5). */
      await expectApiError(
        reportStopArrival({
          actorUserId: company.userId,
          companyId: company.companyId,
          idempotencyKey: 'office-other-stop',
          location: null,
          now: NOW,
          stopId: otherTrip.stopId,
          target,
          unitOfWork,
        }),
        { code: 'TRIP_STOP_NOT_REACHABLE', status: 404 },
      )
      await expectApiError(
        reportDocumentDelivery({
          actorUserId: company.userId,
          companyId: company.companyId,
          documentId: otherTrip.documentId,
          idempotencyKey: 'office-other-document',
          location: null,
          now: NOW,
          target,
          unitOfWork,
        }),
        { code: 'TRIP_DOCUMENT_NOT_REACHABLE', status: 409 },
      )

      const arrival = await reportStopArrival({
        actorUserId: company.userId,
        companyId: company.companyId,
        idempotencyKey: 'office-own-stop',
        location: null,
        now: NOW,
        stopId: targetTrip.stopId,
        target,
        unitOfWork,
      })
      expect(arrival.id).toBeString()
      const [stop] = await database.db
        .select({ arrivedAt: tripStops.arrivedAt })
        .from(tripStops)
        .where(eq(tripStops.id, targetTrip.stopId))
      expect(stop?.arrivedAt).toEqual(NOW)
    })
  })

  testWithPostgres('as consultas do alvo trip nunca atravessam a empresa', async () => {
    await withDisposableDatabase(async (database) => {
      const first = await seedCompany(database, 1)
      const second = await seedCompany(database, 1)
      const foreignTrip = await seedTrip(database, second, { driverIds: [...second.driverIds] })
      const foreignTarget = { kind: 'trip', tripId: foreignTrip.tripId } as const

      await new DrizzleDriverFieldReportUnitOfWork(database.db).execute(async (transaction) => {
        expect(
          await transaction.findStopForDriver({
            companyId: first.companyId,
            stopId: foreignTrip.stopId,
            target: foreignTarget,
          }),
        ).toBeNull()
        expect(
          await transaction.findDocumentForDriver({
            companyId: first.companyId,
            documentId: foreignTrip.documentId,
            target: foreignTarget,
          }),
        ).toBeNull()
      })
      expect(
        await findDriverReachableDocument(database.db, {
          companyId: first.companyId,
          documentId: foreignTrip.documentId,
          target: foreignTarget,
        }),
      ).toBeNull()
      expect(
        await new DrizzleDeliveryProofRepository(database.db).findDeliveryEventId({
          companyId: first.companyId,
          documentId: foreignTrip.documentId,
          target: foreignTarget,
        }),
      ).toBeNull()
    })
  })

  testWithPostgres('o comprovante alcança a entrega da viagem alvo, mesmo concluída', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database, 1)
      const targetTrip = await seedTrip(database, company, { driverIds: [...company.driverIds] })
      const otherTrip = await seedTrip(database, company, { driverIds: [...company.driverIds] })
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)

      /** A entrega foi do motorista, pelo PWA; o canhoto chega depois, pelo escritório. */
      await reportStopArrival({
        actorUserId: company.userId,
        companyId: company.companyId,
        driverId: company.driverIds[0] ?? '',
        idempotencyKey: 'driver-arrival',
        location: null,
        now: NOW,
        stopId: targetTrip.stopId,
        unitOfWork,
      })
      const delivery = await reportDocumentDelivery({
        actorUserId: company.userId,
        companyId: company.companyId,
        documentId: targetTrip.documentId,
        driverId: company.driverIds[0] ?? '',
        idempotencyKey: 'driver-delivery',
        location: null,
        now: NOW,
        unitOfWork,
      })
      await database.db
        .update(trips)
        .set({ status: 'completed' })
        .where(eq(trips.id, targetTrip.tripId))

      const proofs = new DrizzleDeliveryProofRepository(database.db)
      const tripTarget = { kind: 'trip', tripId: targetTrip.tripId } as const
      expect(
        await proofs.findDeliveryEventId({
          companyId: company.companyId,
          documentId: targetTrip.documentId,
          target: tripTarget,
        }),
      ).toBe(delivery.id)
      expect(
        await proofs.findDeliveryEventId({
          companyId: company.companyId,
          documentId: targetTrip.documentId,
          target: { kind: 'trip', tripId: otherTrip.tripId },
        }),
      ).toBeNull()
      expect(
        await findDriverReachableDocument(database.db, {
          companyId: company.companyId,
          documentId: targetTrip.documentId,
          target: tripTarget,
        }),
      ).toEqual({ tripId: targetTrip.tripId })
      expect(
        await findDriverReachableDocument(database.db, {
          companyId: company.companyId,
          documentId: otherTrip.documentId,
          target: tripTarget,
        }),
      ).toBeNull()
    })
  })

  testWithPostgres(
    'nota liberada da própria viagem não é alcançável, nem pelo motorista nem pelo escritório (T8b.1)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database, 1)
        const targetTrip = await seedTrip(database, company, {
          driverIds: [...company.driverIds],
        })

        /** Liberada como `markCancelled`/a fila de revisão fazem: marca, nunca apaga a linha. */
        await database.db
          .update(tripDocuments)
          .set({ releasedAt: NOW })
          .where(eq(tripDocuments.id, targetTrip.documentId))

        const driverTarget = { driverId: company.driverIds[0] ?? '', kind: 'driver' } as const
        const officeTarget = { kind: 'trip', tripId: targetTrip.tripId } as const

        expect(
          await findDriverReachableDocument(database.db, {
            companyId: company.companyId,
            documentId: targetTrip.documentId,
            target: driverTarget,
          }),
        ).toBeNull()
        expect(
          await findDriverReachableDocument(database.db, {
            companyId: company.companyId,
            documentId: targetTrip.documentId,
            target: officeTarget,
          }),
        ).toBeNull()

        /** A mesma viagem, nota **não** liberada: continua alcançável — não é regressão de tenant. */
        const otherDocument = (
          await seedTrip(database, company, {
            driverIds: [...company.driverIds],
          })
        ).documentId
        expect(
          await findDriverReachableDocument(database.db, {
            companyId: company.companyId,
            documentId: otherDocument,
            target: driverTarget,
          }),
        ).not.toBeNull()
      })
    },
  )

  testWithPostgres(
    'a viagem que concluiu entre a leitura e a gravação não regride (R2)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database, 1)
        const seeded = await seedTrip(database, company, {
          driverIds: [...company.driverIds],
          status: 'dispatched',
        })
        const real = new DrizzleCurrentDriverTripRepository(database.db)

        /** A corrida, determinística: a viagem fecha no instante entre ler e gravar. */
        const racing = {
          readCurrent: async (input: { readonly companyId: string; readonly driverId: string }) => {
            const current = await real.readCurrent(input)
            await database.db
              .update(trips)
              .set({ status: 'completed' })
              .where(eq(trips.id, seeded.tripId))
            return current
          },
          readStatus: (input: { readonly companyId: string; readonly tripId: string }) =>
            real.readStatus(input),
          updateStatus: (input: Parameters<typeof real.updateStatus>[0]) =>
            real.updateStatus(input),
        }

        await expectApiError(
          startFieldTrip({
            actorUserId: company.userId,
            companyId: company.companyId,
            driverId: company.driverIds[0] ?? '',
            repository: racing,
            step: 'confirmLoad',
          }),
          { code: 'STATE_TRANSITION_NOT_ALLOWED', status: 409 },
        )
        const [trip] = await database.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, seeded.tripId))
        expect(trip?.status).toBe('completed')
      })
    },
  )

  testWithPostgres(
    'aceite 1: o motorista inicia a rota e grava driver_app com from/to certos, sem duplicar ao repetir',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database, 1)
        const seeded = await seedTrip(database, company, {
          driverIds: [...company.driverIds],
          status: 'dispatched',
        })
        const repository = new DrizzleCurrentDriverTripRepository(database.db)

        const first = await startFieldTrip({
          actorUserId: company.userId,
          companyId: company.companyId,
          driverId: company.driverIds[0] ?? '',
          repository,
          step: 'confirmLoad',
        })
        expect(first).toEqual({
          changed: true,
          tripId: seeded.tripId,
          tripStatus: 'in_transit',
        })

        // Repetir o toque (rede do pátio caindo e o motorista tocando de novo) converge sem gravar
        // um segundo evento — idempotência do lado da tabela de histórico.
        const second = await startFieldTrip({
          actorUserId: company.userId,
          companyId: company.companyId,
          driverId: company.driverIds[0] ?? '',
          repository,
          step: 'confirmLoad',
        })
        expect(second).toEqual({
          changed: false,
          tripId: seeded.tripId,
          tripStatus: 'in_transit',
        })

        const events = await database.db
          .select()
          .from(tripStatusEvents)
          .where(eq(tripStatusEvents.tripId, seeded.tripId))
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
          actorUserId: company.userId,
          channel: 'driver_app',
          fromStatus: 'dispatched',
          onBehalfOfDriverId: null,
          toStatus: 'in_transit',
        })
      })
    },
  )
})

async function resolveOn(
  database: TestDatabase,
  company: Company,
  tripId: string,
): Promise<ResolvedTripFieldTarget> {
  return resolveFieldTripTarget({
    companyId: company.companyId,
    repository: new DrizzleFieldTripTargetRepository(database.db),
    target: { kind: 'trip', tripId },
  })
}

async function expectApiError(
  operation: Promise<unknown>,
  expected: { readonly code: string; readonly status: number },
): Promise<void> {
  try {
    await operation
    throw new Error('EXPECTED_API_ERROR')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(expected.code)
    expect((error as ApiError).status).toBe(expected.status)
  }
}

async function seedCompany(database: TestDatabase, driverCount: number): Promise<Company> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })

  const driverIds = Array.from({ length: driverCount }, () => crypto.randomUUID())
  for (const [index, driverId] of driverIds.entries()) {
    await database.db.insert(fleetDrivers).values({
      companyId,
      id: driverId,
      name: `Motorista ${String(index + 1)}`,
      taxId: String(index + 1).repeat(11),
    })
  }

  return { companyId, driverIds, userId, vehicleId }
}

async function seedTrip(
  database: TestDatabase,
  company: Company,
  options: {
    readonly driverIds: readonly string[]
    readonly status?: 'dispatched' | 'in_transit'
  },
): Promise<SeededTrip> {
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const documentId = crypto.randomUUID()

  await database.db.insert(trips).values({
    companyId: company.companyId,
    id: tripId,
    status: options.status ?? 'in_transit',
    vehicleId: company.vehicleId,
  })
  for (const [index, driverId] of options.driverIds.entries()) {
    await database.db.insert(tripDrivers).values({
      companyId: company.companyId,
      driverId,
      driverName: `Motorista ${String(index + 1)}`,
      driverTaxId: String(index + 1).repeat(11),
      position: BigInt(index + 1),
      tripId,
    })
  }
  await database.db.insert(tripStops).values({
    addressKey: `3550308|01001000|${tripId}`,
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
    objectKey: `nfe/field-trip-target-${suffix}.xml`,
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
    idempotencyKey: `field-trip-target-${suffix}`,
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
  const databaseName = `transportada_156_${crypto.randomUUID().replaceAll('-', '')}`
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
