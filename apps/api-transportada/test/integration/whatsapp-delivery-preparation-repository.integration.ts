/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: a entrega em preparo contra Postgres de verdade, pelo cliente da aplicação — uma aberta
 * por nota (também sob concorrência), versão, localização e fotos gravadas, fechamento e isolamento por
 * empresa.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { tripDocuments } from '../../src/database/database.schema.js'
import { createDrizzleWhatsAppDeliveryPreparationRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-delivery-preparation.repository.js'
import { seedCargoTenants } from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { seedDriverAccount } from '../fixtures/driver-holiday-warning-seed.fixture.js'
import { seedTripWithStops } from '../fixtures/trip-holiday-warning-seed.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>

describe('entrega em preparo, repositório (spec 293 T15)', () => {
  testWithPostgres('uma aberta por nota, também com chamadas ao mesmo tempo', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, documentIds, driverId, preparations } = await setUp(database)
      const [documentId] = documentIds
      if (documentId === undefined) throw new Error('no document')
      const open = () =>
        preparations.open({
          companyId,
          documentId,
          documentNumber: '17234',
          driverId,
          originChannel: 'group',
        })
      const results = await Promise.all([open(), open(), open()])
      expect(results.filter((item) => item !== null)).toHaveLength(1)
      const found = await preparations.findOpenByDocument({ companyId, documentId })
      expect(found).toMatchObject({
        awaiting: null,
        documentNumber: '17234',
        location: null,
        originChannel: 'group',
        photos: [],
        skipped: [],
        version: 1n,
      })
    })
  })

  testWithPostgres('grava com a versão lida; localização e fotos voltam como foram', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, documentIds, driverId, preparations } = await setUp(database)
      const [documentId] = documentIds
      if (documentId === undefined) throw new Error('no document')
      const opened = await preparations.open({
        companyId,
        documentId,
        documentNumber: '17234',
        driverId,
        originChannel: 'individual',
      })
      if (opened === null) throw new Error('not opened')
      const changes = {
        awaiting: 'received_by',
        location: {
          accuracyMeters: null,
          capturedAt: '2026-11-04T12:00:00.000Z',
          latitude: '-21.123456',
          longitude: '-47.654321',
        },
        photos: [
          {
            kind: 'photo' as const,
            mimeType: 'image/jpeg',
            objectKey: 'tenants/x/whatsapp-delivery-preparations/p/1',
            providerMessageId: 'M1',
            sha256: 'a'.repeat(64),
            sizeBytes: 3,
          },
        ],
        receivedBy: 'doorman' as const,
        receiverName: 'Maria',
        skipped: ['location'],
      }
      const scope = { companyId, id: opened.id }
      expect(await preparations.save({ ...scope, changes, version: 1n })).toBe(true)
      expect(await preparations.save({ ...scope, changes, version: 1n })).toBe(false)
      const [listed] = await preparations.listOpenForDriver({ companyId, driverId })
      expect(listed).toMatchObject({ ...changes, version: 2n })

      expect(await preparations.close({ ...scope, status: 'completed', version: 2n })).toBe(true)
      expect(await preparations.findOpenByDocument({ companyId, documentId })).toBeNull()
      // Fechada, a nota pode abrir outra preparação.
      expect(
        await preparations.open({
          companyId,
          documentId,
          documentNumber: '17234',
          driverId,
          originChannel: 'group',
        }),
      ).not.toBeNull()
    })
  })

  testWithPostgres('a preparação aberta traz a hora da última pergunta (updatedAt)', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, documentIds, driverId, preparations } = await setUp(database)
      const [documentId] = documentIds
      if (documentId === undefined) throw new Error('no document')
      const before = Date.now() - 1000
      const opened = await preparations.open({
        companyId,
        documentId,
        documentNumber: '17234',
        driverId,
        originChannel: 'individual',
      })
      if (opened === null) throw new Error('not opened')
      const [first] = await preparations.listOpenForDriver({ companyId, driverId })
      if (first === undefined) throw new Error('not listed')
      expect(first.updatedAt).toBeInstanceOf(Date)
      expect(first.updatedAt?.getTime()).toBeGreaterThanOrEqual(before)
      await Bun.sleep(20)
      await preparations.save({
        changes: { ...first, awaiting: 'received_by' },
        companyId,
        id: opened.id,
        version: 1n,
      })
      const [second] = await preparations.listOpenForDriver({ companyId, driverId })
      expect(second?.updatedAt?.getTime()).toBeGreaterThan(first.updatedAt?.getTime() ?? 0)
    })
  })

  testWithPostgres('outra empresa não vê nem fecha a preparação', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, documentIds, driverId, foreignCompanyId, preparations } =
        await setUp(database)
      const [documentId] = documentIds
      if (documentId === undefined) throw new Error('no document')
      const opened = await preparations.open({
        companyId,
        documentId,
        documentNumber: '17234',
        driverId,
        originChannel: 'group',
      })
      if (opened === null) throw new Error('not opened')
      const otherCompanyId = foreignCompanyId
      expect(
        await preparations.findOpenByDocument({ companyId: otherCompanyId, documentId }),
      ).toBeNull()
      expect(await preparations.listOpenForDriver({ companyId: otherCompanyId, driverId })).toEqual(
        [],
      )
      expect(
        await preparations.close({
          companyId: otherCompanyId,
          id: opened.id,
          status: 'cancelled',
          version: 1n,
        }),
      ).toBe(false)
    })
  })
})

async function setUp(database: TestDatabase) {
  const { foreignCompanyId } = await seedCargoTenants(database)
  const companyId = COMPANY_CONTEXT.companyId
  const driver = await seedDriverAccount(database, companyId)
  const seeded = await seedTripWithStops(database, {
    companyId,
    stops: [{ cityCode: '3543402', estimatedArrivalAt: null }],
  })
  const rows = await database.db
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(eq(tripDocuments.tripId, seeded.tripId))
  return {
    companyId,
    foreignCompanyId,
    documentIds: rows.map((row) => row.id),
    driverId: driver.driverId,
    preparations: createDrizzleWhatsAppDeliveryPreparationRepository(database.db),
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_t293p',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 5, max: 4, queryTimeoutMs: 10_000 },
        url: connectionString,
      }),
    operation,
  })
}
