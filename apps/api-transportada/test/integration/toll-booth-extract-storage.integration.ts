/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T301: prova contra o MinIO e o Postgres locais de verdade que `POST
 * /v1/toll-booths/extracts` nunca sobrescreve — nem a linha (`UNIQUE (dataset, observed_on)`), nem
 * o objeto (`create-only`). O contrato HTTP (`test/toll-booths/toll-booth-extract-routes.contract.ts`)
 * já cobre a forma da resposta com dependências dubladas; este arquivo é o único que fala com os
 * dois sistemas de verdade ao mesmo tempo.
 */
import { createHash } from 'node:crypto'

import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  createObjectStorageProvider,
  type ObjectStorageProvider,
} from '@adatechnology/object-storage-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { createCreateTollBoothExtractUseCase } from '../../src/toll-booths/application/create-toll-booth-extract.use-case.js'
import {
  TollBoothExtractDuplicateError,
  TollBoothExtractObjectConflictError,
} from '../../src/toll-booths/domain/toll-booth-extract.error.js'
import { buildExtractObjectKey } from '../../src/toll-booths/domain/toll-booth-extract.policy.js'
import { createDrizzleTollBoothExtractRepository } from '../../src/toll-booths/infrastructure/drizzle-toll-booth-extract.repository.js'
import { createTollBoothExtractStorageGateway } from '../../src/toll-booths/infrastructure/toll-booth-extract-storage.gateway.js'
import { createNfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL

const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? process.env.STORAGE_ENDPOINT
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET
const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY ?? process.env.STORAGE_ACCESS_KEY
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY ?? process.env.STORAGE_SECRET_KEY
const region = process.env.OBJECT_STORAGE_REGION ?? process.env.STORAGE_REGION ?? 'us-east-1'
const MAX_OBJECT_SIZE_BYTES = 25 * 1024 * 1024

const hasInfrastructure =
  databaseUrl !== undefined &&
  [endpoint, bucket, accessKeyId, secretAccessKey].every(
    (value) => value !== undefined && value.trim() !== '',
  )

const testWithInfrastructure = hasInfrastructure ? test : test.skip

const BUCKET = bucket ?? ''
const USER_ID = '44444444-4444-4444-4444-444444444444'

const BOOTH_ROW = {
  chargeCar: '4.2000',
  chargePerAxle: '4.2000',
  latitude: '-23.5101982',
  longitude: '-46.8172702',
  name: 'Barueri - 2',
  operator: 'Ecovias Raposo Castello',
  osmNodeId: '25937851',
} as const

function extractBytes(booths: readonly (typeof BOOTH_ROW)[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(booths))
}

function createProvider(): ObjectStorageProvider {
  return createObjectStorageProvider({
    accessKeyId: accessKeyId ?? '',
    endpoint: new URL(endpoint ?? ''),
    forcePathStyle: true,
    healthCheckBucket: BUCKET,
    maxObjectSizeBytes: MAX_OBJECT_SIZE_BYTES,
    region,
    secretAccessKey: secretAccessKey ?? '',
  })
}

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_toll_extract_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
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

describe('toll booth extract create-only integration (spec 154, T301)', () => {
  testWithInfrastructure(
    'stores the object once and registers the line; the retry hits 409 without touching the object',
    async () => {
      await withDisposableDatabase(async (database) => {
        const provider = createProvider()
        try {
          const storageGateway = createNfeStorageGateway({
            finalBucket: BUCKET,
            provider,
            stagingBucket: BUCKET,
          })
          const useCase = createCreateTollBoothExtractUseCase({
            extracts: createDrizzleTollBoothExtractRepository(database.db),
            storage: createTollBoothExtractStorageGateway({
              bucket: BUCKET,
              storage: storageGateway,
            }),
          })
          const dataset = `sudeste-${crypto.randomUUID().slice(0, 8)}`
          const observedOn = '2026-09-14'
          const rawBody = extractBytes([BOOTH_ROW])
          const objectKey = buildExtractObjectKey({ dataset, observedOn })

          const created = await useCase.execute({
            actorUserId: USER_ID,
            booths: [BOOTH_ROW],
            dataset,
            observedOn,
            rawBody,
          })

          expect(created.dataset).toBe(dataset)
          expect(created.sha256).toBe(createHash('sha256').update(rawBody).digest('hex'))
          const stored = await provider.head({ bucket: BUCKET, key: objectKey })
          expect(stored?.sha256).toBe(created.sha256)

          await expect(
            useCase.execute({
              actorUserId: USER_ID,
              booths: [BOOTH_ROW],
              dataset,
              observedOn,
              rawBody,
            }),
          ).rejects.toBeInstanceOf(TollBoothExtractDuplicateError)

          const afterRetry = await provider.head({ bucket: BUCKET, key: objectKey })
          expect(afterRetry?.sha256).toBe(created.sha256)
          expect(afterRetry?.contentLength).toBe(stored?.contentLength)

          const rows = await createDrizzleTollBoothExtractRepository(database.db).list()
          expect(rows.length).toBe(1)
        } finally {
          await provider.close()
        }
      })
    },
  )

  testWithInfrastructure(
    'refuses to overwrite an object already present under the key with different content',
    async () => {
      await withDisposableDatabase(async (database) => {
        const provider = createProvider()
        try {
          const storageGateway = createNfeStorageGateway({
            finalBucket: BUCKET,
            provider,
            stagingBucket: BUCKET,
          })
          const dataset = `sudeste-${crypto.randomUUID().slice(0, 8)}`
          const observedOn = '2026-09-14'
          const objectKey = buildExtractObjectKey({ dataset, observedOn })
          const foreignBody = new TextEncoder().encode('[]')
          await provider.put({
            body: foreignBody,
            bucket: BUCKET,
            contentLength: foreignBody.byteLength,
            contentType: 'application/json',
            key: objectKey,
            mode: 'create-only',
            sha256: createHash('sha256').update(foreignBody).digest('hex'),
          })

          const useCase = createCreateTollBoothExtractUseCase({
            extracts: createDrizzleTollBoothExtractRepository(database.db),
            storage: createTollBoothExtractStorageGateway({
              bucket: BUCKET,
              storage: storageGateway,
            }),
          })
          const rawBody = extractBytes([BOOTH_ROW])

          await expect(
            useCase.execute({
              actorUserId: USER_ID,
              booths: [BOOTH_ROW],
              dataset,
              observedOn,
              rawBody,
            }),
          ).rejects.toBeInstanceOf(TollBoothExtractObjectConflictError)

          const stillForeign = await provider.head({ bucket: BUCKET, key: objectKey })
          expect(stillForeign?.sha256).toBe(createHash('sha256').update(foreignBody).digest('hex'))

          const rows = await createDrizzleTollBoothExtractRepository(database.db).list()
          expect(rows.length).toBe(0)
        } finally {
          await provider.close()
        }
      })
    },
  )
})
