/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T302: Postgres descartável + storage em memória, com os casos de uso **reais** de
 * subida e recarga. O storage era o MinIO; desde que a MinIO tirou as imagens públicas (2026-09-24)
 * a CI não o sobe, e o provedor é o dublê de `in-memory-object-storage.fixture.ts`. `createDatabaseProvider` (`prepare: false`), nunca o provider cru: com ele a
 * transação da recarga parava ociosa (spec 137, `apps/api-transportada/CLAUDE.md`).
 */
import { createHash } from 'node:crypto'

import { SQL } from 'bun'
import type { ObjectStorageProvider } from '@adatechnology/object-storage-provider'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createNfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { createCreateTollBoothExtractUseCase } from '../../src/toll-booths/application/create-toll-booth-extract.use-case.js'
import { createReloadTollBoothCatalogUseCase } from '../../src/toll-booths/application/reload-toll-booth-catalog.use-case.js'
import { createDrizzleTollBoothCatalogReloadRepository } from '../../src/toll-booths/infrastructure/drizzle-toll-booth-catalog-reload.repository.js'
import { createDrizzleTollBoothExtractRepository } from '../../src/toll-booths/infrastructure/drizzle-toll-booth-extract.repository.js'
import { createInMemoryTollBoothAxleChargeGapCache } from '../../src/toll-booths/infrastructure/in-memory-toll-booth-axle-charge-gap-cache.js'
import { buildExtractObjectKey } from '../../src/toll-booths/domain/toll-booth-extract.policy.js'
import { createTollBoothExtractStorageGateway } from '../../src/toll-booths/infrastructure/toll-booth-extract-storage.gateway.js'
import { createInMemoryObjectStorageProvider } from './in-memory-object-storage.fixture.js'

export const reloadDatabaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL

const bucket = 'transportada-test'

/** Só o banco é infraestrutura real: o storage é o dublê em memória, que ninguém precisa subir. */
export const hasReloadInfrastructure = reloadDatabaseUrl !== undefined

export const RELOAD_BUCKET = bucket

export type ReloadWorld = Awaited<ReturnType<typeof createReloadWorld>>

export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function createReloadWorld(url: string) {
  const database = createDatabaseProvider({
    pool: { connectTimeoutSeconds: 10, max: 5, queryTimeoutMs: 20_000 },
    url,
  })
  const provider: ObjectStorageProvider = createInMemoryObjectStorageProvider({
    maxObjectSizeBytes: 25 * 1024 * 1024,
  })
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })

  const extracts = createDrizzleTollBoothExtractRepository(database.db)
  const storage = createTollBoothExtractStorageGateway({
    bucket,
    storage: createNfeStorageGateway({ finalBucket: bucket, provider, stagingBucket: bucket }),
  })
  const upload = createCreateTollBoothExtractUseCase({ extracts, storage })
  const reload = createReloadTollBoothCatalogUseCase({
    axleChargeGapCache: createInMemoryTollBoothAxleChargeGapCache({
      clock: { now: () => new Date() },
    }),
    catalogReload: createDrizzleTollBoothCatalogReloadRepository(database.db),
    extracts,
    logger: { warn() {} },
    storage,
  })

  return {
    companyId,
    database,
    extracts,
    provider,
    reload: (key: { readonly dataset: string; readonly observedOn: string }) =>
      reload.execute({ ...key, actorUserId: userId, companyId, correlationId: 'reload-it' }),
    upload,
    userId,
  }
}

export async function withReloadWorld(
  operation: (world: ReloadWorld, url: string) => Promise<void>,
): Promise<void> {
  if (reloadDatabaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(reloadDatabaseUrl, { max: 1 })
  const databaseName = `transportada_toll_reload_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(reloadDatabaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let world: ReloadWorld | undefined
  try {
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    world = await createReloadWorld(disposableUrl.toString())
    await operation(world, disposableUrl.toString())
  } finally {
    await world?.provider.close()
    await world?.database.close()
    await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
    await admin.close({ timeout: 0 })
  }
}

export async function putObject(world: ReloadWorld, key: string, bytes: Uint8Array): Promise<void> {
  await world.provider.put({
    body: bytes,
    bucket: RELOAD_BUCKET,
    contentLength: bytes.byteLength,
    contentType: 'application/json',
    key,
    mode: 'create-only',
    sha256: sha256Of(bytes),
  })
}

export async function registerWithoutObject(world: ReloadWorld, bytes: Uint8Array) {
  const key = { dataset: `sudeste-${crypto.randomUUID().slice(0, 8)}`, observedOn: '2026-09-14' }
  const objectKey = buildExtractObjectKey(key)
  await world.extracts.create({
    ...key,
    boothCount: 1,
    boothsWithAxleCharge: 1,
    boothsWithCharge: 1,
    objectKey,
    sha256: sha256Of(bytes),
    uploadedByUserId: world.userId,
  })
  return { key, objectKey }
}
