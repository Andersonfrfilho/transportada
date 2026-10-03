/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.3 (ADR-0094): a rota, o caso de uso e o repositório de verdade contra Postgres — o
 * perfil ausente é `null`, o `PUT` repetido não regrava nem audita, o contratante de outra empresa é
 * 404, e as faixas valem no banco mesmo por fora da API.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  createGetContractorReceivingProfileUseCase,
  createSaveContractorReceivingProfileUseCase,
} from '../../src/cargo-receiving/application/contractor-receiving-profile.use-case.js'
import { DrizzleContractorReceivingProfileRepository } from '../../src/cargo-receiving/infrastructure/drizzle-contractor-receiving-profile.repository.js'
import { createContractorReceivingProfileRoutes } from '../../src/cargo-receiving/presentation/contractor-receiving-profile.routes.js'
import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  contractorReceivingProfiles,
  contractors,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { findPostgresError } from '../../src/database/postgres-error.support.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/freight-region-http.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>

const RULES = {
  arrivalReferencePattern: 'NroCarga\\s*[:=]?\\s*(\\d+)',
  deliveryDeadlineBusinessDays: 3,
  isEnabled: true,
  matchWindowDays: 15,
  previewColumnMap: { routeName: 'RouteName', value: 'VALOR', weightKg: 'PESO TOTAL' },
  previewEnabled: true,
  previewSheetName: 'IMPORTAÇÃO',
  requiresDamageCheck: true,
  separationWindowHours: 24,
  weightTolerancePercent: 0.5,
}

type Seed = { readonly contractorId: string; readonly foreignContractorId: string }

describe('o perfil de recebimento contra Postgres (spec 237 T1.3)', () => {
  testWithPostgres('ausência é null; PUT cria, repetido não audita, mudado audita', async () => {
    await withDisposableDatabase(async (database, seed) => {
      const handle = createHandler(database)
      const path = `/contractors/${seed.contractorId}/receiving-profile`

      const empty = await handle(jsonRequest({ method: 'GET', path }))
      expect(empty.status).toBe(200)
      expect(await empty.json()).toEqual({ data: null })

      const created = await handle(jsonRequest({ body: RULES, method: 'PUT', path }))
      expect(created.status).toBe(200)
      const first = await responseData<{ readonly updatedAt: string }>(created)
      expect(first).toMatchObject({ ...RULES, contractorId: seed.contractorId })

      const repeated = await handle(jsonRequest({ body: RULES, method: 'PUT', path }))
      expect(await responseData(repeated)).toEqual(first)
      expect(await countAudits(database)).toBe(1)

      const changed = { ...RULES, separationWindowHours: 48 }
      expect((await handle(jsonRequest({ body: changed, method: 'PUT', path }))).status).toBe(200)
      const read = await handle(jsonRequest({ method: 'GET', path }))
      expect(await responseData(read)).toMatchObject(changed)
      expect(await countAudits(database)).toBe(2)
      expect(await countProfiles(database, COMPANY_CONTEXT.companyId)).toBe(1)
    })
  })

  testWithPostgres('contratante de outra empresa é 404 na leitura e na gravação', async () => {
    await withDisposableDatabase(async (database, seed) => {
      const handle = createHandler(database)
      const path = `/contractors/${seed.foreignContractorId}/receiving-profile`

      const read = await handle(jsonRequest({ method: 'GET', path }))
      expect(read.status).toBe(404)
      expect((await responseApiError(read)).code).toBe('CONTRACTOR_NOT_FOUND')

      const written = await handle(jsonRequest({ body: RULES, method: 'PUT', path }))
      expect(written.status).toBe(404)
      expect((await responseApiError(written)).code).toBe('CONTRACTOR_NOT_FOUND')
      expect(await database.db.select().from(contractorReceivingProfiles)).toEqual([])
      expect(await countAudits(database)).toBe(0)
    })
  })

  testWithPostgres(
    'as faixas e a coerência da prévia valem no banco, por fora da API',
    async () => {
      await withDisposableDatabase(async (database, seed) => {
        const base = { companyId: COMPANY_CONTEXT.companyId, contractorId: seed.contractorId }
        const violations = [
          { ...base, separationWindowHours: 0 },
          { ...base, deliveryDeadlineBusinessDays: 61 },
          { ...base, matchWindowDays: 61 },
          { ...base, weightTolerancePercent: '100.01' },
          { ...base, previewEnabled: true },
          { ...base, previewSheetName: 'x'.repeat(32) },
          { ...base, arrivalReferencePattern: '' },
        ]

        for (const values of violations) {
          const failure = await captureFailure(() =>
            database.db.insert(contractorReceivingProfiles).values(values),
          )
          expect(failure).toBe('23514')
        }
        const raw = new SQL(connectionStringOf(database), { max: 1 })
        try {
          const failure = await captureFailure(
            () =>
              raw`insert into contractor_receiving_profiles (company_id, contractor_id, preview_column_map) values (${base.companyId}, ${base.contractorId}, '["VALOR"]'::jsonb)`,
          )
          expect(failure).toBe('23514')
        } finally {
          await raw.close({ timeout: 0 })
        }
      })
    },
  )
})

function createHandler(database: TestDatabase): (request: Request) => Promise<Response> {
  const repository = new DrizzleContractorReceivingProfileRepository(database.db)
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router: createTestRouter({
      context: authenticatedContext(COMPANY_CONTEXT.permissions),
      routes: createContractorReceivingProfileRoutes({
        getProfile: createGetContractorReceivingProfileUseCase({ repository }),
        saveProfile: createSaveContractorReceivingProfileUseCase({ repository }),
      }),
    }),
  })
  return (request) => handleRequest(request, { timeout() {} })
}

async function captureFailure(operation: () => PromiseLike<unknown>): Promise<string> {
  try {
    await operation()
    return 'no-failure'
  } catch (error) {
    return findPostgresError({ error })?.sqlState ?? 'not-a-postgres-error'
  }
}

async function countAudits(database: TestDatabase): Promise<number> {
  const rows = await database.db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(eq(auditLogs.entityType, 'contractor-receiving-profile'))
  return rows.length
}

async function countProfiles(database: TestDatabase, companyId: string): Promise<number> {
  const rows = await database.db
    .select({ id: contractorReceivingProfiles.id })
    .from(contractorReceivingProfiles)
    .where(and(eq(contractorReceivingProfiles.companyId, companyId)))
  return rows.length
}

async function seedTenants(database: TestDatabase): Promise<Seed> {
  const foreignCompanyId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const foreignContractorId = crypto.randomUUID()
  await database.db.insert(companies).values([
    { id: COMPANY_CONTEXT.companyId, status: 'active' },
    { id: foreignCompanyId, status: 'active' },
  ])
  await database.db.insert(identityUsers).values({ id: COMPANY_CONTEXT.userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId: COMPANY_CONTEXT.companyId,
    id: COMPANY_CONTEXT.membershipId,
    status: 'active',
    userId: COMPANY_CONTEXT.userId,
  })
  await database.db.insert(contractors).values([
    { companyId: COMPANY_CONTEXT.companyId, id: contractorId, taxId: '30290856000160' },
    { companyId: foreignCompanyId, id: foreignContractorId, taxId: '30290856000160' },
  ])
  return { contractorId, foreignContractorId }
}

const connectionStrings = new WeakMap<TestDatabase, string>()

function connectionStringOf(database: TestDatabase): string {
  const connectionString = connectionStrings.get(database)
  if (connectionString === undefined) throw new Error('Disposable database URL is missing')
  return connectionString
}

async function withDisposableDatabase(
  operation: (database: TestDatabase, seed: Seed) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_rcvprof_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDatabaseProvider({
      pool: { connectTimeoutSeconds: 10, max: 4, queryTimeoutMs: 20_000 },
      url: disposableUrl.toString(),
    })
    connectionStrings.set(database, disposableUrl.toString())
    await operation(database, await seedTenants(database))
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
