/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 209: a foto do "Deu problema" contra o Postgres de verdade. O contrato com dublê
 * (`test/trip-occurrence/stop-upload.contract.ts`) prova as barreiras; aqui se prova o SQL — o
 * `where` do anexo que completa uma vez, o recorte por empresa/viagem/motorista do upload, e que
 * nada disto encosta em `trip_delivery_proofs` (a pontualidade e a nota do motorista).
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
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  tripDeliveryProofs,
  tripDrivers,
  tripOccurrenceUploads,
  tripStopOccurrences,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { confirmOccurrenceUpload } from '../../src/trips/application/confirm-occurrence-upload.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import {
  TripOccurrenceUploadNotReachableError,
  TripStopNotReachableError,
} from '../../src/trips/domain/trip.error.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleOccurrenceUploadRepository } from '../../src/trips/infrastructure/drizzle-occurrence-upload.repository.js'
import {
  attachUploadToStopOccurrence,
  findDriverReachableStop,
} from '../../src/trips/infrastructure/stop-occurrence-attachment.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-09-25T12:00:00.000Z')
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

type World = {
  readonly companyId: string
  readonly driverId: string
  readonly stopId: string
  readonly tripId: string
  readonly userId: string
}

describe('a foto do "Deu problema" é anexo da ocorrência de parada (spec 209)', () => {
  testWithPostgres(
    'long_wait com foto grava o anexo na ocorrência, e nenhum canhoto nasce',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const objectId = await seedConfirmedUpload(database, world)

        const result = await reportStopOccurrence(
          occurrenceInput(database, world, { attachmentObjectId: objectId, key: 'chave-1' }),
        )

        expect(await readAttachment(database, result.id)).toBe(objectId)
        expect(await database.db.select().from(tripDeliveryProofs)).toHaveLength(0)
      })
    },
  )

  testWithPostgres('o upload de outra empresa é 404, e nada é gravado', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const otherWorld = await seedWorld(database)
      const foreignObjectId = await seedConfirmedUpload(database, otherWorld)

      const rejected = await reportStopOccurrence(
        occurrenceInput(database, world, { attachmentObjectId: foreignObjectId, key: 'chave-1' }),
      ).catch((error: unknown) => error)

      expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
      expect(await database.db.select().from(tripStopOccurrences)).toHaveLength(0)
    })
  })

  testWithPostgres('o upload de outra viagem da mesma empresa é 404', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const otherTrip = await seedTrip(database, world)
      const objectId = await seedConfirmedUpload(database, { ...world, tripId: otherTrip })

      const rejected = await reportStopOccurrence(
        occurrenceInput(database, world, { attachmentObjectId: objectId, key: 'chave-1' }),
      ).catch((error: unknown) => error)

      expect(rejected).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
      expect(await database.db.select().from(tripStopOccurrences)).toHaveLength(0)
    })
  })

  testWithPostgres(
    'o reenvio pela mesma chave completa a foto uma vez, e nunca a troca',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const firstObject = await seedConfirmedUpload(database, world)
        const secondObject = await seedConfirmedUpload(database, world)

        const recorded = await reportStopOccurrence(
          occurrenceInput(database, world, { attachmentObjectId: null, key: 'chave-1' }),
        )
        expect(await readAttachment(database, recorded.id)).toBeNull()

        const withPhoto = await reportStopOccurrence(
          occurrenceInput(database, world, { attachmentObjectId: firstObject, key: 'chave-1' }),
        )
        const replayed = await reportStopOccurrence(
          occurrenceInput(database, world, { attachmentObjectId: secondObject, key: 'chave-1' }),
        )

        expect(withPhoto.id).toBe(recorded.id)
        expect(replayed.id).toBe(recorded.id)
        expect(await database.db.select().from(tripStopOccurrences)).toHaveLength(1)
        expect(await readAttachment(database, recorded.id)).toBe(firstObject)
      })
    },
  )

  testWithPostgres('a parada só resolve a viagem na rua do próprio motorista', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const otherWorld = await seedWorld(database)
      const driverTarget = { driverId: world.driverId, kind: 'driver' as const }

      expect(
        await findDriverReachableStop(database.db, {
          companyId: world.companyId,
          stopId: world.stopId,
          target: driverTarget,
        }),
      ).toEqual({ tripId: world.tripId })
      expect(
        await findDriverReachableStop(database.db, {
          companyId: world.companyId,
          stopId: otherWorld.stopId,
          target: driverTarget,
        }),
      ).toBeNull()

      await database.db.update(trips).set({ status: 'completed' }).where(eq(trips.id, world.tripId))
      expect(
        await findDriverReachableStop(database.db, {
          companyId: world.companyId,
          stopId: world.stopId,
          target: driverTarget,
        }),
      ).toBeNull()

      const rejected = await reportStopOccurrence(
        occurrenceInput(database, world, { attachmentObjectId: null, key: 'chave-2' }),
      ).catch((error: unknown) => error)
      expect(rejected).toBeInstanceOf(TripStopNotReachableError)
    })
  })
})

function occurrenceInput(
  database: TestDatabase,
  world: World,
  input: { readonly attachmentObjectId: string | null; readonly key: string },
) {
  const uploads = new DrizzleOccurrenceUploadRepository(database.db)
  return {
    actorUserId: world.userId,
    attachmentObjectId: input.attachmentObjectId,
    attachmentUploads: {
      attachUploadToStopOccurrence: (query: Parameters<typeof attachUploadToStopOccurrence>[1]) =>
        attachUploadToStopOccurrence(database.db, query),
      findConfirmedUpload: (query: Parameters<typeof uploads.findConfirmedUpload>[0]) =>
        uploads.findConfirmedUpload(query),
    },
    companyId: world.companyId,
    description: 'Duas horas na fila da doca',
    distanceMeters: null,
    documentId: null,
    driverId: world.driverId,
    idempotencyKey: input.key,
    kind: 'long_wait' as const,
    stopId: world.stopId,
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
  }
}

async function readAttachment(database: TestDatabase, occurrenceId: string) {
  const [row] = await database.db
    .select({ attachmentObjectId: tripStopOccurrences.attachmentObjectId })
    .from(tripStopOccurrences)
    .where(eq(tripStopOccurrences.id, occurrenceId))
  return row?.attachmentObjectId
}

/** O caminho da 179 de verdade: pedido `pending` e a confirmação que grava `stored_objects`. */
async function seedConfirmedUpload(database: TestDatabase, world: World): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(tripOccurrenceUploads).values({
    bucket: 'test-bucket',
    companyId: world.companyId,
    declaredSizeBytes: BigInt(JPEG_BYTES.byteLength),
    driverId: world.driverId,
    expiresAt: new Date(NOW.getTime() + 60_000),
    id,
    mimeType: 'image/jpeg',
    objectKey: `tenants/${world.companyId}/trip-occurrence-uploads/${world.tripId}/${id}`,
    status: 'pending',
    tripId: world.tripId,
  })
  await confirmOccurrenceUpload({
    companyId: world.companyId,
    id,
    now: NOW,
    repository: new DrizzleOccurrenceUploadRepository(database.db),
    storage: {
      getObjectStream: async () => new Response(JPEG_BYTES).body as ReadableStream<Uint8Array>,
      headObject: async () => ({ contentLength: JPEG_BYTES.byteLength }),
    },
    tripId: world.tripId,
  })
  return id
}

async function seedTrip(database: TestDatabase, world: World): Promise<string> {
  const [vehicle] = await database.db
    .select({ id: fleetVehicles.id })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.companyId, world.companyId))
  const tripId = crypto.randomUUID()
  await database.db.insert(trips).values({
    companyId: world.companyId,
    id: tripId,
    status: 'in_transit',
    vehicleId: vehicle?.id ?? '',
  })
  await database.db.insert(tripDrivers).values({
    companyId: world.companyId,
    driverId: world.driverId,
    driverName: 'Motorista de Campo',
    driverTaxId: '11111111111',
    position: 1n,
    tripId,
  })
  return tripId
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const stopId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: crypto.randomUUID(),
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista de Campo',
    taxId: '11111111111',
  })
  const partial = { companyId, driverId, stopId, tripId: '', userId }
  const tripId = await seedTrip(database, partial)
  await database.db.insert(tripStops).values({
    addressKey: '3550308|01001000|100',
    companyId,
    id: stopId,
    label: 'Centro, 100',
    sequence: 1n,
    tripId,
  })

  return { ...partial, tripId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_209_${crypto.randomUUID().replaceAll('-', '')}`
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
