/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: a ocorrência em coleta contra Postgres de verdade, pelo cliente da aplicação — uma aberta
 * por motorista (também sob concorrência), versão, número, valor, fotos e localização gravados,
 * fechamento e isolamento por empresa.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { tripDocuments } from '../../src/database/database.schema.js'
import { createDrizzleWhatsAppOccurrenceDraftRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-occurrence-draft.repository.js'
import { seedCargoTenants } from '../fixtures/cargo-arrival-database.fixture.js'
import { seedOccurrenceType } from '../fixtures/cargo-arrival-occurrence.fixture.js'
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

describe('ocorrência em coleta, repositório (spec 293 T15)', () => {
  testWithPostgres('uma aberta por motorista, também com chamadas ao mesmo tempo', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, documentId, driverId, drafts, occurrenceTypeId } = await setUp(database)
      const open = () =>
        drafts.open({
          companyId,
          documentId,
          documentNumber: '17234',
          driverId,
          location: null,
          note: 'cliente devolveu',
          occurrenceTypeId,
          originChannel: 'group',
        })
      const results = await Promise.all([open(), open(), open()])
      expect(results.filter((item) => item !== null)).toHaveLength(1)
      expect(await drafts.findOpenForDriver({ companyId, driverId })).toMatchObject({
        awaiting: null,
        declaredAmount: null,
        documentNumber: '17234',
        location: null,
        note: 'cliente devolveu',
        occurrenceTypeId,
        originChannel: 'group',
        photos: [],
        referenceNumber: null,
        skipped: [],
        version: 1n,
      })
    })
  })

  testWithPostgres(
    'grava com a versão lida; número, valor, fotos e localização voltam como foram',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, documentId, driverId, drafts, occurrenceTypeId } = await setUp(database)
        const opened = await drafts.open({
          companyId,
          documentId,
          documentNumber: '17234',
          driverId,
          location: null,
          note: '',
          occurrenceTypeId,
          originChannel: 'individual',
        })
        if (opened === null) throw new Error('not opened')
        const changes = {
          awaiting: 'declared_amount',
          declaredAmount: '120.50',
          location: {
            accuracyMeters: null,
            capturedAt: '2026-11-04T12:00:00.000Z',
            latitude: '-21.123456',
            longitude: '-47.654321',
          },
          photos: [{ providerMessageId: 'M1', uploadId: crypto.randomUUID() }],
          referenceNumber: 'DEV-77',
          skipped: ['photo'],
        }
        const scope = { companyId, id: opened.id }
        expect(await drafts.save({ ...scope, changes, version: 1n })).toBe(true)
        expect(await drafts.save({ ...scope, changes, version: 1n })).toBe(false)
        expect(await drafts.findOpenForDriver({ companyId, driverId })).toMatchObject({
          ...changes,
          version: 2n,
        })

        expect(await drafts.close({ ...scope, status: 'completed', version: 2n })).toBe(true)
        expect(await drafts.findOpenForDriver({ companyId, driverId })).toBeNull()
        // Fechada, o motorista pode abrir outra.
        expect(
          await drafts.open({
            companyId,
            documentId,
            documentNumber: '17234',
            driverId,
            location: null,
            note: '',
            occurrenceTypeId,
            originChannel: 'group',
          }),
        ).not.toBeNull()
      })
    },
  )

  testWithPostgres('outra empresa não vê nem fecha a coleta', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, documentId, driverId, drafts, foreignCompanyId, occurrenceTypeId } =
        await setUp(database)
      const opened = await drafts.open({
        companyId,
        documentId,
        documentNumber: '17234',
        driverId,
        location: null,
        note: '',
        occurrenceTypeId,
        originChannel: 'group',
      })
      if (opened === null) throw new Error('not opened')
      expect(await drafts.findOpenForDriver({ companyId: foreignCompanyId, driverId })).toBeNull()
      expect(
        await drafts.close({
          companyId: foreignCompanyId,
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
  const [row] = await database.db
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(eq(tripDocuments.tripId, seeded.tripId))
  if (row === undefined) throw new Error('no document')
  return {
    companyId,
    documentId: row.id,
    driverId: driver.driverId,
    drafts: createDrizzleWhatsAppOccurrenceDraftRepository(database.db),
    foreignCompanyId,
    occurrenceTypeId: await seedOccurrenceType(database, { companyId, stage: 'delivery' }),
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_t293o',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 5, max: 4, queryTimeoutMs: 10_000 },
        url: connectionString,
      }),
    operation,
  })
}
