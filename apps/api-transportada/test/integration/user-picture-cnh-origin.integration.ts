/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: "a CNH nunca sobrescreve `self`/`admin`" é um `where` do `ON CONFLICT`, e a
 * resolução anexo → usuário é um `JOIN` de três tabelas: só o banco de verdade executa os dois.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  identityUserPictures,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import type { FleetDriverAttachmentType } from '../../src/database/fleet-driver-attachment.schema.js'
import { createDrizzleDriverCnhPictureLookupRepository } from '../../src/fleet/infrastructure/drizzle-driver-cnh-picture-lookup.repository.js'
import { createDrizzleFleetDriverAttachmentRepository } from '../../src/fleet/infrastructure/drizzle-fleet-driver-attachment.repository.js'
import { DrizzleUserPictureRepository } from '../../src/identity/infrastructure/drizzle-user-picture.repository.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test
const DISPOSABLE_DATABASE_TIMEOUT_MS = 60_000
const UPLOADER_ID = '00000000-0000-4000-8000-0000000000a1'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_t295',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}

function pictureInput(input: {
  readonly companyId: string
  readonly seed: string
  readonly userId: string
}) {
  const content = Buffer.from(`imagem-${input.seed}`)
  return {
    byteSize: content.byteLength,
    companyId: input.companyId,
    contentBase64: content.toString('base64'),
    mimeType: 'image/webp' as const,
    sha256: input.seed.repeat(64).slice(0, 64),
    userId: input.userId,
  }
}

async function seedLinkedDriver(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly linked: boolean },
) {
  const userId = crypto.randomUUID()
  await db.insert(identityUsers).values({ id: userId })
  const [membership] = await db
    .insert(userCompanyMemberships)
    .values({ companyId: input.companyId, status: 'active', userId })
    .returning({ id: userCompanyMemberships.id })
  const [driver] = await db
    .insert(fleetDrivers)
    .values({
      companyId: input.companyId,
      membershipId: input.linked ? (membership?.id ?? null) : null,
      name: 'Motorista de Teste',
      taxId: String(10_000_000_000 + Math.floor(Math.random() * 1_000_000)),
    })
    .returning({ id: fleetDrivers.id })
  if (driver === undefined) throw new Error('driver not seeded')
  return { driverId: driver.id, userId }
}

async function seedAttachment(
  db: TestDatabase['db'],
  input: {
    readonly companyId: string
    readonly driverId: string
    readonly type: FleetDriverAttachmentType
  },
): Promise<string> {
  const storedObjectId = crypto.randomUUID()
  const created = await createDrizzleFleetDriverAttachmentRepository(db).create({
    bucket: 'test-bucket',
    companyId: input.companyId,
    correlationId: 'correlation-295',
    driverId: input.driverId,
    mimeType: 'application/pdf',
    objectKey: `tenants/${input.companyId}/fleet-driver-attachments/${input.driverId}/${input.type}/${storedObjectId}`,
    provider: 'object-storage',
    sha256: 'a'.repeat(64),
    sizeBytes: 1024,
    storedObjectId,
    type: input.type,
    uploadedBy: UPLOADER_ID,
  })
  return created.id
}

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

describe('foto da CNH do motorista, contra Postgres (spec 295)', () => {
  testWithPostgres(
    'a CNH entra sem foto e troca a foto anterior da CNH, mas nunca a self nem a admin',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const { userId } = await seedLinkedDriver(db, { companyId, linked: true })
        const repository = new DrizzleUserPictureRepository(db)

        const first = await repository.saveFromCnh(pictureInput({ companyId, seed: 'a', userId }))
        const second = await repository.saveFromCnh(pictureInput({ companyId, seed: 'b', userId }))

        expect(first).not.toBeNull()
        expect(second?.sha256).toBe('b'.repeat(64))
        expect((await repository.find({ companyId, userId }))?.origin).toBe('cnh')

        for (const origin of ['self', 'admin'] as const) {
          await repository.save({ ...pictureInput({ companyId, seed: 'c', userId }), origin })

          const blocked = await repository.saveFromCnh(
            pictureInput({ companyId, seed: 'd', userId }),
          )

          expect(blocked).toBeNull()
          const [row] = await db
            .select({ origin: identityUserPictures.origin, sha256: identityUserPictures.sha256 })
            .from(identityUserPictures)
            .where(eq(identityUserPictures.userId, userId))
          expect(row).toEqual({ origin, sha256: 'c'.repeat(64) })
        }
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'envio próprio ou do administrador sobrescreve a foto da CNH e muda a origem',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const { userId } = await seedLinkedDriver(db, { companyId, linked: true })
        const repository = new DrizzleUserPictureRepository(db)
        await repository.saveFromCnh(pictureInput({ companyId, seed: 'a', userId }))

        await repository.save({ ...pictureInput({ companyId, seed: 'b', userId }), origin: 'self' })

        expect((await repository.find({ companyId, userId }))?.origin).toBe('self')
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'o vínculo da CNH resolve o usuário só na empresa do anexo e só para o tipo cnh',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const otherCompanyId = await seedCompany(db)
        const linked = await seedLinkedDriver(db, { companyId, linked: true })
        const unlinked = await seedLinkedDriver(db, { companyId, linked: false })
        const cnhAttachmentId = await seedAttachment(db, {
          companyId,
          driverId: linked.driverId,
          type: 'cnh',
        })
        const unlinkedAttachmentId = await seedAttachment(db, {
          companyId,
          driverId: unlinked.driverId,
          type: 'cnh',
        })
        const proofAttachmentId = await seedAttachment(db, {
          companyId,
          driverId: linked.driverId,
          type: 'address_proof',
        })
        const lookup = createDrizzleDriverCnhPictureLookupRepository(db)

        expect(await lookup.findDriverUser({ attachmentId: cnhAttachmentId, companyId })).toEqual({
          userId: linked.userId,
        })
        expect(
          await lookup.findDriverUser({ attachmentId: unlinkedAttachmentId, companyId }),
        ).toEqual({ userId: undefined })
        expect(
          await lookup.findDriverUser({ attachmentId: cnhAttachmentId, companyId: otherCompanyId }),
        ).toBeUndefined()
        expect(
          await lookup.findDriverUser({ attachmentId: proofAttachmentId, companyId }),
        ).toBeUndefined()
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
})
