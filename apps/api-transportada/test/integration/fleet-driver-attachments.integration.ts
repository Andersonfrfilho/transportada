/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 091: o isolamento por empresa, o único parcial e a baixa do objeto são condições do banco, e
 * nada disso aparece em teste com repositório falso — lá o `where` é uma string que ninguém executa.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDriverAttachmentOutbox,
  fleetDriverAttachments,
  fleetDrivers,
  storedObjects,
} from '../../src/database/database.schema.js'
import type { FleetDriverAttachmentType } from '../../src/database/fleet-driver-attachment.schema.js'
import { FleetDriverAttachmentTypeTakenError } from '../../src/fleet/domain/fleet-driver-attachment.error.js'
import { FleetDriverNotFoundError } from '../../src/fleet/domain/fleet.error.js'
import { createDrizzleFleetDriverAttachmentRepository } from '../../src/fleet/infrastructure/drizzle-fleet-driver-attachment.repository.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test
const DISPOSABLE_DATABASE_TIMEOUT_MS = 60_000
const USER_ID = '00000000-0000-4000-8000-0000000000a1'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

let driverSequence = 0

async function seedDriver(db: TestDatabase['db'], companyId: string): Promise<string> {
  driverSequence += 1
  const [driver] = await db
    .insert(fleetDrivers)
    .values({
      companyId,
      name: 'Motorista de Teste',
      taxId: String(10_000_000_000 + driverSequence),
    })
    .returning({ id: fleetDrivers.id })
  if (driver === undefined) throw new Error('driver not seeded')
  return driver.id
}

function attachmentInput(input: {
  readonly companyId: string
  readonly driverId: string
  readonly type: FleetDriverAttachmentType
}) {
  const storedObjectId = crypto.randomUUID()
  return {
    bucket: 'test-bucket',
    companyId: input.companyId,
    correlationId: 'correlation-091',
    driverId: input.driverId,
    mimeType: 'application/pdf',
    objectKey: `tenants/${input.companyId}/fleet-driver-attachments/${input.driverId}/${input.type}/${storedObjectId}`,
    provider: 'object-storage',
    sha256: 'a'.repeat(64),
    sizeBytes: 1024,
    storedObjectId,
    type: input.type,
    uploadedBy: USER_ID,
  } as const
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_t091',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}

describe('anexo do motorista, contra Postgres (spec 091)', () => {
  testWithPostgres(
    'grava o anexo e o objeto na mesma transação, e devolve só o que a ficha mostra',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const driverId = await seedDriver(db, companyId)
        const repository = createDrizzleFleetDriverAttachmentRepository(db)

        const created = await repository.create(
          attachmentInput({ companyId, driverId, type: 'cnh' }),
        )

        expect(Object.keys(created).sort()).toEqual(['createdAt', 'id', 'type', 'uploadedBy'])
        const [object] = await db.select().from(storedObjects)
        expect(object?.purpose).toBe('fleet_driver_attachment')
        expect(object?.status).toBe('final')
        expect(await repository.driverExists({ companyId, driverId })).toBe(true)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'motorista de outra empresa não recebe anexo, e nenhum objeto sobra',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const otherCompanyId = await seedCompany(db)
        const foreignDriverId = await seedDriver(db, otherCompanyId)
        const repository = createDrizzleFleetDriverAttachmentRepository(db)

        await expect(
          repository.create(attachmentInput({ companyId, driverId: foreignDriverId, type: 'cnh' })),
        ).rejects.toBeInstanceOf(FleetDriverNotFoundError)

        expect(await db.select().from(storedObjects)).toEqual([])
        expect(await repository.driverExists({ companyId, driverId: foreignDriverId })).toBe(false)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'um documento vivo por tipo, e só o outro aceita vários',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const driverId = await seedDriver(db, companyId)
        const repository = createDrizzleFleetDriverAttachmentRepository(db)

        await repository.create(attachmentInput({ companyId, driverId, type: 'cnh' }))
        await expect(
          repository.create(attachmentInput({ companyId, driverId, type: 'cnh' })),
        ).rejects.toBeInstanceOf(FleetDriverAttachmentTypeTakenError)
        await repository.create(attachmentInput({ companyId, driverId, type: 'other' }))
        await repository.create(attachmentInput({ companyId, driverId, type: 'other' }))

        const rows = await db.select().from(fleetDriverAttachments)
        expect(rows.map((row) => row.type).sort()).toEqual(['cnh', 'other', 'other'])
        // A transação do perdedor desfez o objeto dele junto: três linhas, três objetos.
        expect(await db.select().from(storedObjects)).toHaveLength(3)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'só localiza e remove o anexo da própria empresa e do próprio motorista',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const otherCompanyId = await seedCompany(db)
        const driverId = await seedDriver(db, companyId)
        const otherDriverId = await seedDriver(db, companyId)
        const repository = createDrizzleFleetDriverAttachmentRepository(db)
        const created = await repository.create(
          attachmentInput({ companyId, driverId, type: 'cnh' }),
        )
        const target = { attachmentId: created.id, companyId, driverId }

        for (const wrong of [
          { ...target, companyId: otherCompanyId },
          { ...target, driverId: otherDriverId },
        ]) {
          expect(await repository.findLocation(wrong)).toBeNull()
          expect(await repository.remove(wrong)).toBe(false)
        }
        expect(await db.select().from(fleetDriverAttachments)).toHaveLength(1)

        expect((await repository.findLocation(target))?.bucket).toBe('test-bucket')
        expect(await repository.remove(target)).toBe(true)

        expect(await db.select().from(fleetDriverAttachments)).toEqual([])
        const [object] = await db
          .select()
          .from(storedObjects)
          .where(eq(storedObjects.purpose, 'fleet_driver_attachment'))
        expect(object?.status).toBe('deleted')
        expect(object?.deletedAt).not.toBeNull()
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  /**
   * ADR-0053: a API nunca lê o documento na requisição. A linha do anexo e o pedido de leitura saem
   * na mesma transação, e só a CNH é lida (D4) — os outros tipos não ganham pedido nenhum.
   */
  testWithPostgres(
    'a CNH nasce com o pedido de leitura na mesma transação, e os outros tipos não',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const driverId = await seedDriver(db, companyId)
        const repository = createDrizzleFleetDriverAttachmentRepository(db)
        const cnh = attachmentInput({ companyId, driverId, type: 'cnh' })

        const created = await repository.create(cnh)
        for (const type of ['address_proof', 'identity_document', 'other'] as const) {
          await repository.create(attachmentInput({ companyId, driverId, type }))
        }

        const events = await db.select().from(fleetDriverAttachmentOutbox)
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
          attachmentId: created.id,
          companyId,
          correlationId: 'correlation-091',
          eventType: 'attachment.extraction.requested',
          payload: {
            attachmentId: created.id,
            bucket: 'test-bucket',
            objectKey: cnh.objectKey,
            type: 'cnh',
          },
          publishedAt: null,
        })
        // O payload é referência: nenhum byte do documento viaja na fila.
        expect(Object.keys(events[0]?.payload as object).sort()).toEqual([
          'attachmentId',
          'bucket',
          'objectKey',
          'type',
        ])
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'a corrida perdida do mesmo tipo não deixa pedido de leitura órfão',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const driverId = await seedDriver(db, companyId)
        const repository = createDrizzleFleetDriverAttachmentRepository(db)

        await repository.create(attachmentInput({ companyId, driverId, type: 'cnh' }))
        await expect(
          repository.create(attachmentInput({ companyId, driverId, type: 'cnh' })),
        ).rejects.toBeInstanceOf(FleetDriverAttachmentTypeTakenError)

        expect(await db.select().from(fleetDriverAttachmentOutbox)).toHaveLength(1)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
})
