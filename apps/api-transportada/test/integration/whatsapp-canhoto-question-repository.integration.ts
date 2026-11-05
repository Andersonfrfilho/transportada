/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8: a pergunta aberta sobre a foto do canhoto contra Postgres de verdade — uma por motorista (também sob
 * concorrência), a pergunta trocada pelo "não, é de outra", fechamento e isolamento por empresa.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { tripDocuments } from '../../src/database/database.schema.js'
import { whatsappCanhotoQuestions } from '../../src/database/whatsapp-canhoto-question.schema.js'
import { createDrizzleWhatsAppCanhotoQuestionRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-canhoto-question.repository.js'
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

const input = (companyId: string, driverId: string) => ({
  candidates: [{ documentId: 'DOC-A', documentNumber: '17234', label: 'NF 17234 · Mercado Sul' }],
  companyId,
  driverId,
  kind: 'confirm_note' as const,
  mimeType: 'image/jpeg',
  objectKey: 'tenants/x/whatsapp-delivery-preparations/q/1',
  originChannel: 'group' as const,
  providerMessageId: 'M1',
  sha256: 'a'.repeat(64),
  sizeBytes: 3,
})

describe('pergunta do canhoto, repositório (spec 294 T4.8)', () => {
  testWithPostgres('uma aberta por motorista, também com chamadas ao mesmo tempo', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, driverId, questions } = await setUp(database)
      const results = await Promise.all([
        questions.open(input(companyId, driverId)),
        questions.open(input(companyId, driverId)),
        questions.open(input(companyId, driverId)),
      ])
      expect(results.filter((item) => item !== null)).toHaveLength(1)
      const found = await questions.findOpen({ companyId, driverId })
      expect(found).toMatchObject({
        candidates: input(companyId, driverId).candidates,
        kind: 'confirm_note',
        objectKey: 'tenants/x/whatsapp-delivery-preparations/q/1',
        originChannel: 'group',
        providerMessageId: 'M1',
      })
      expect(found?.openedAt).toBeInstanceOf(Date)
    })
  })

  testWithPostgres(
    'reframe troca a pergunta; fechar libera o motorista para a próxima',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, driverId, questions } = await setUp(database)
        const opened = await questions.open(input(companyId, driverId))
        if (opened === null) throw new Error('not opened')
        await questions.reframe({ candidates: [], companyId, id: opened.id, kind: 'choose_note' })
        expect(await questions.findOpen({ companyId, driverId })).toMatchObject({
          candidates: [],
          kind: 'choose_note',
        })
        await questions.close({ companyId, id: opened.id, status: 'completed' })
        expect(await questions.findOpen({ companyId, driverId })).toBeNull()
        expect(await questions.open(input(companyId, driverId))).not.toBeNull()
      })
    },
  )

  testWithPostgres(
    'S5: a vencida é cancelada uma vez e devolve a foto; a recente segue aberta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, driverId, questions } = await setUp(database)
        const other = await seedDriverAccount(database, companyId)
        const old = await questions.open(input(companyId, driverId))
        const fresh = await questions.open(input(companyId, other.driverId))
        if (old === null || fresh === null) throw new Error('not opened')
        await database.db
          .update(whatsappCanhotoQuestions)
          .set({ openedAt: new Date(Date.now() - 31 * 60 * 1000) })
          .where(eq(whatsappCanhotoQuestions.id, old.id))

        const before = new Date(Date.now() - 30 * 60 * 1000)
        const expired = await questions.expireOpen({ before, limit: 10 })

        expect(expired).toEqual([{ companyId, objectKey: old.objectKey }])
        expect(await questions.expireOpen({ before, limit: 10 })).toEqual([])
        expect(await questions.findOpen({ companyId, driverId })).toBeNull()
        expect(await questions.findOpen({ companyId, driverId: other.driverId })).not.toBeNull()
      })
    },
  )

  testWithPostgres('outra empresa nem enxerga nem fecha a pergunta', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, driverId, foreignCompanyId, questions } = await setUp(database)
      const opened = await questions.open(input(companyId, driverId))
      if (opened === null) throw new Error('not opened')
      expect(await questions.findOpen({ companyId: foreignCompanyId, driverId })).toBeNull()
      await questions.close({ companyId: foreignCompanyId, id: opened.id, status: 'cancelled' })
      expect(await questions.findOpen({ companyId, driverId })).not.toBeNull()
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
    questions: createDrizzleWhatsAppCanhotoQuestionRepository(database.db),
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_t294q',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 5, max: 4, queryTimeoutMs: 10_000 },
        url: connectionString,
      }),
    operation,
  })
}
