/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão de arquitetura de 23/09 do lote da spec 179 (`specs/179-a-recusa-sai-com-foto/`), achados
 * [1] e [2]: contra o Postgres de verdade, não um dublê.
 *
 * [1] O reenvio da fila offline chama `confirm` de novo depois que a primeira chamada já fechou a
 * confirmação. `findPendingUpload` só acha `status = 'pending'`, então sem o recall o reenvio levava
 * 404 (`TripOccurrenceUploadNotReachableError`) em vez do mesmo resultado.
 *
 * [2] Dois `confirm` concorrentes para o mesmo pedido faziam os dois tentarem inserir
 * `stored_objects` com o mesmo `id` (PK) — violação de unicidade, 500 genérico. O `UPDATE` agora
 * corre primeiro, condicionado a `status = 'pending'`, e só quem afeta a linha chega ao `INSERT`.
 */
import { createHash } from 'node:crypto'

import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  createObjectStorageProvider,
  type ObjectStorageProvider,
} from '@adatechnology/object-storage-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { createNfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { companies, fleetVehicles, storedObjects } from '../../src/database/database.schema.js'
import { tripOccurrenceUploads, trips } from '../../src/database/trip.schema.js'
import { confirmOccurrenceUpload } from '../../src/trips/application/confirm-occurrence-upload.use-case.js'
import { TripOccurrenceUploadNotReachableError } from '../../src/trips/domain/trip.error.js'
import { DrizzleOccurrenceUploadRepository } from '../../src/trips/infrastructure/drizzle-occurrence-upload.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-09-23T12:00:00.000Z')

/** Um JPEG de verdade e mínimo (assinatura `FF D8 FF`), pequeno o bastante para caber no teto. */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

/** Um JPEG mínimo de verdade, com bytes suficientes para o PUT tardio trocar só o último. */
const REAL_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])

const storageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? process.env.STORAGE_ENDPOINT
const storageBucket = process.env.OBJECT_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET
const storageAccessKey = process.env.OBJECT_STORAGE_ACCESS_KEY ?? process.env.STORAGE_ACCESS_KEY
const storageSecretKey = process.env.OBJECT_STORAGE_SECRET_KEY ?? process.env.STORAGE_SECRET_KEY
const storageRegion = process.env.OBJECT_STORAGE_REGION ?? process.env.STORAGE_REGION ?? 'us-east-1'
const STORAGE_BUCKET = storageBucket ?? ''

/**
 * A CI carrega o `.env.example` (com `STORAGE_ENDPOINT`) sem subir o MinIO: a variável sozinha não
 * diz que o S3 está de pé. Qualquer resposta HTTP do endpoint conta como alcançável.
 */
async function isStorageReachable(): Promise<boolean> {
  const configured = [storageEndpoint, storageBucket, storageAccessKey, storageSecretKey].every(
    (value) => value !== undefined && value.trim() !== '',
  )
  if (!configured || databaseUrl === undefined) return false
  try {
    await fetch(storageEndpoint ?? '', { signal: AbortSignal.timeout(2_000) })
    return true
  } catch {
    return false
  }
}
const testWithStorage = (await isStorageReachable()) ? test : test.skip

/**
 * O `object-storage-provider@0.3.0` assina o PUT com o checksum do corpo vazio sem esta variável, e
 * o storage que confere o checksum recusa o upload real — o mesmo achado da spec 183 T702a.
 */
process.env.AWS_REQUEST_CHECKSUM_CALCULATION ??= 'WHEN_REQUIRED'

function createStorageProvider(): ObjectStorageProvider {
  return createObjectStorageProvider({
    accessKeyId: storageAccessKey ?? '',
    endpoint: new URL(storageEndpoint ?? ''),
    forcePathStyle: true,
    healthCheckBucket: STORAGE_BUCKET,
    maxObjectSizeBytes: 25 * 1024 * 1024,
    region: storageRegion,
    secretAccessKey: storageSecretKey ?? '',
  })
}

type Company = { readonly companyId: string; readonly vehicleId: string }
type SeededTrip = { readonly tripId: string }

function fakeStorage() {
  return {
    async deleteObject() {},
    async getObjectStream() {
      return new Response(JPEG_BYTES).body as ReadableStream<Uint8Array>
    },
    async headObject() {
      return { contentLength: JPEG_BYTES.byteLength }
    },
    async storeObject() {
      return undefined
    },
  }
}

describe('confirmar o upload de ocorrência contra o Postgres (achados [1] e [2] da revisão de 23/09)', () => {
  testWithPostgres(
    'achado [1]: reenvio depois de confirmado devolve o mesmo resultado, não 404',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company)
        const repository = new DrizzleOccurrenceUploadRepository(database.db)
        const objectId = crypto.randomUUID()
        await seedPendingUpload(database, company, trip, objectId)

        const first = await confirmOccurrenceUpload({
          companyId: company.companyId,
          id: objectId,
          now: NOW,
          repository,
          storage: fakeStorage(),
          tripId: trip.tripId,
        })
        expect(first.id).toBe(objectId)

        const second = await confirmOccurrenceUpload({
          companyId: company.companyId,
          id: objectId,
          now: new Date(NOW.getTime() + 1_000),
          repository,
          storage: fakeStorage(),
          tripId: trip.tripId,
        })
        expect(second.id).toBe(objectId)

        const stored = await database.db
          .select({ id: storedObjects.id })
          .from(storedObjects)
          .where(eq(storedObjects.id, objectId))
        expect(stored).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'achado [1]: objeto de outra viagem continua 404, mesmo já confirmado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company)
        const otherTrip = await seedTrip(database, company)
        const repository = new DrizzleOccurrenceUploadRepository(database.db)
        const objectId = crypto.randomUUID()
        await seedPendingUpload(database, company, trip, objectId)

        await confirmOccurrenceUpload({
          companyId: company.companyId,
          id: objectId,
          now: NOW,
          repository,
          storage: fakeStorage(),
          tripId: trip.tripId,
        })

        await expect(
          confirmOccurrenceUpload({
            companyId: company.companyId,
            id: objectId,
            now: NOW,
            repository,
            storage: fakeStorage(),
            tripId: otherTrip.tripId,
          }),
        ).rejects.toBeInstanceOf(TripOccurrenceUploadNotReachableError)
      })
    },
  )

  testWithPostgres(
    'achado [2]: dois confirms concorrentes para o mesmo pedido não dão 500, e só um objeto é gravado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company)
        const repository = new DrizzleOccurrenceUploadRepository(database.db)
        const objectId = crypto.randomUUID()
        await seedPendingUpload(database, company, trip, objectId)

        const outcomes = await Promise.all(
          [0, 1].map(() =>
            confirmOccurrenceUpload({
              companyId: company.companyId,
              id: objectId,
              now: NOW,
              repository,
              storage: fakeStorage(),
              tripId: trip.tripId,
            }),
          ),
        )

        expect(outcomes[0]?.id).toBe(objectId)
        expect(outcomes[1]?.id).toBe(objectId)

        const stored = await database.db
          .select({ id: storedObjects.id })
          .from(storedObjects)
          .where(eq(storedObjects.id, objectId))
        expect(stored).toHaveLength(1)

        const [upload] = await database.db
          .select({ status: tripOccurrenceUploads.status })
          .from(tripOccurrenceUploads)
          .where(
            and(
              eq(tripOccurrenceUploads.companyId, company.companyId),
              eq(tripOccurrenceUploads.id, objectId),
            ),
          )
        expect(upload?.status).toBe('confirmed')
      })
    },
  )
})

/**
 * A URL de PUT assinada vale 15 minutos e segue valendo depois da confirmação. Contra o S3 de
 * verdade: um PUT tardio na mesma URL, com outros bytes do mesmo tamanho, não muda o que o registro
 * confirmado devolve — ele aponta para a cópia final dos bytes conferidos, não para a chave da
 * subida. Pula quando o S3 local não responde (a CI não sobe o MinIO).
 */
describe('o PUT tardio na URL de subida não troca o anexo confirmado (S3 local)', () => {
  testWithStorage(
    'depois de confirmar, o download devolve os bytes conferidos, não os do PUT tardio',
    async () => {
      await withDisposableDatabase(async (database) => {
        const storage = createNfeStorageGateway({
          finalBucket: STORAGE_BUCKET,
          provider: createStorageProvider(),
          stagingBucket: STORAGE_BUCKET,
        })
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company)
        const objectId = crypto.randomUUID()
        const stagingKey = `tenants/${company.companyId}/trip-occurrence-uploads/${trip.tripId}/${objectId}`
        await seedPendingUpload(database, company, trip, objectId, STORAGE_BUCKET)
        const uploadUrl = await storage.createSignedUpload({
          bucket: STORAGE_BUCKET,
          contentLength: REAL_JPEG.byteLength,
          contentType: 'image/jpeg',
          expiresInSeconds: 900,
          key: stagingKey,
        })
        let finalKey: string | undefined
        try {
          await put(uploadUrl, REAL_JPEG)

          await confirmOccurrenceUpload({
            companyId: company.companyId,
            id: objectId,
            now: NOW,
            repository: new DrizzleOccurrenceUploadRepository(database.db),
            storage,
            tripId: trip.tripId,
          })

          const [stored] = await database.db
            .select({ objectKey: storedObjects.objectKey, sha256: storedObjects.sha256 })
            .from(storedObjects)
            .where(eq(storedObjects.id, objectId))
          finalKey = stored?.objectKey
          expect(finalKey).toBeDefined()
          expect(finalKey).not.toBe(stagingKey)
          expect(stored?.sha256).toBe(createHash('sha256').update(REAL_JPEG).digest('hex'))
          expect(
            await storage.headObject({ bucket: STORAGE_BUCKET, key: stagingKey }),
          ).toBeUndefined()

          const swapped = REAL_JPEG.map((byte, index) =>
            index === REAL_JPEG.byteLength - 1 ? 0x58 : byte,
          )
          await put(uploadUrl, swapped)

          const downloaded = new Uint8Array(
            await new Response(
              await storage.getObjectStream({ bucket: STORAGE_BUCKET, key: finalKey ?? '' }),
            ).arrayBuffer(),
          )
          expect(downloaded).toEqual(REAL_JPEG)
        } finally {
          const keys = [stagingKey, ...(finalKey === undefined ? [] : [finalKey])]
          await Promise.allSettled(
            keys.map((key) => storage.deleteObject({ bucket: STORAGE_BUCKET, key })),
          )
        }
      })
    },
  )
})

async function put(url: URL, bytes: Uint8Array): Promise<void> {
  const response = await fetch(url, {
    body: bytes,
    headers: { 'content-length': String(bytes.byteLength), 'content-type': 'image/jpeg' },
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(`UPLOAD_FAILED_${String(response.status)} ${await response.text()}`)
  }
}

async function seedCompany(database: TestDatabase): Promise<Company> {
  const companyId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E48',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })

  return { companyId, vehicleId }
}

async function seedTrip(database: TestDatabase, company: Company): Promise<SeededTrip> {
  const tripId = crypto.randomUUID()

  await database.db.insert(trips).values({
    companyId: company.companyId,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    id: tripId,
    status: 'in_transit',
    vehicleId: company.vehicleId,
  })

  return { tripId }
}

async function seedPendingUpload(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  objectId: string,
  bucket = 'test-bucket',
): Promise<void> {
  await database.db.insert(tripOccurrenceUploads).values({
    bucket,
    companyId: company.companyId,
    declaredSizeBytes: BigInt(JPEG_BYTES.byteLength),
    driverId: crypto.randomUUID(),
    expiresAt: new Date(NOW.getTime() + 60_000),
    id: objectId,
    mimeType: 'image/jpeg',
    objectKey: `tenants/${company.companyId}/trip-occurrence-uploads/${trip.tripId}/${objectId}`,
    status: 'pending',
    tripId: trip.tripId,
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_179_confirm_${crypto.randomUUID().replaceAll('-', '')}`
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
