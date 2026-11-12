/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  companyFiscalProfiles,
  identityUsers,
  nfeAccessKeyLookups,
  nfeDocuments,
  nfeImports,
  processingOutbox,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { createGetAccessKeyLookupUseCase } from '../../src/nfe-access-key-lookups/application/get-access-key-lookup.use-case'
import { createRequestAccessKeyLookupUseCase } from '../../src/nfe-access-key-lookups/application/request-access-key-lookup.use-case'
import { DrizzleNfeAccessKeyLookupRepository } from '../../src/nfe-access-key-lookups/infrastructure/drizzle-nfe-access-key-lookup.repository'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import { captureApiError } from '../fixtures/nfe-import-use-case.fixture'
import { ACCESS_KEY, OTHER_ACCESS_KEY } from '../fixtures/nfe-access-key-lookup.fixture'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const SHA = 'd'.repeat(64)
const HOUR_MS = 60 * 60 * 1000
const CORRELATION_ID = 'access-key-lookup-integration'

describe('nfe access key lookups integration (spec 298 T1.2)', () => {
  testWithPostgres(
    'creates import, lookup and outbox in one transaction, with no full key in the event',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database, { environment: 'production' })
        const { request } = createUseCases(database)

        const result = await request.execute(requestInput(scenario.contextA))

        expect(result).toMatchObject({ kind: 'created', lookup: { status: 'queued' } })
        const [lookup] = await database.db.select().from(nfeAccessKeyLookups)
        const [created] = await database.db.select().from(nfeImports)
        const [event] = await database.db.select().from(processingOutbox)
        expect(lookup).toMatchObject({
          accessKey: ACCESS_KEY,
          companyId: scenario.companyIdA,
          environment: 'production',
          importId: created?.id,
          requestedByUserId: scenario.userId,
          status: 'queued',
        })
        expect(created).toMatchObject({
          companyId: scenario.companyIdA,
          failedCount: 0n,
          importedCount: 0n,
          processedCount: 0n,
          receivedCount: 0n,
          source: 'access_key',
          status: 'queued',
          triggeredBy: 'user',
        })
        expect(created?.idempotencyKey).toContain(lookup?.id ?? 'missing')
        expect(event).toMatchObject({
          aggregateId: created?.id,
          aggregateType: 'nfe_import',
          companyId: scenario.companyIdA,
          eventType: 'transportada.nfe.access-key.requested',
        })
        expect(event?.payload).toEqual({
          companyId: scenario.companyIdA,
          importId: created?.id,
          lookupId: lookup?.id,
        })
        expect(JSON.stringify(event?.payload)).not.toContain(ACCESS_KEY)
      })
    },
    60_000,
  )

  testWithPostgres(
    'rolls everything back when the outbox write fails',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const repository = new DrizzleNfeAccessKeyLookupRepository(database.db)
        const request = createRequestAccessKeyLookupUseCase({
          clock: { now: () => new Date() },
          fingerprintService: { create: async () => SHA },
          unitOfWork: {
            execute: (operation) =>
              repository.execute((transaction) =>
                operation(
                  Object.assign(Object.create(transaction) as typeof transaction, {
                    saveOutbox: async (): Promise<void> => {
                      throw new Error('outbox unavailable')
                    },
                  }),
                ),
              ),
          },
        })

        await expect(request.execute(requestInput(scenario.contextA))).rejects.toThrow(
          'outbox unavailable',
        )

        expect(await database.db.select().from(nfeAccessKeyLookups)).toEqual([])
        expect(await database.db.select().from(nfeImports)).toEqual([])
        expect(await database.db.select().from(processingOutbox)).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'found: a note already registered for the company creates no lookup, import or event',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const documentId = await seedDocument(database, scenario)
        const { request } = createUseCases(database)

        const result = await request.execute(requestInput(scenario.contextA))

        expect(result).toEqual({ documentId, kind: 'found' })
        expect(await database.db.select().from(nfeAccessKeyLookups)).toEqual([])
        expect(await database.db.select().from(processingOutbox)).toEqual([])
        expect(await database.db.select().from(nfeImports)).toHaveLength(1)
      })
    },
    60_000,
  )

  testWithPostgres(
    'a repeated request returns the active lookup and creates nothing new',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const { request } = createUseCases(database)

        const first = (await request.execute(requestInput(scenario.contextA))) as {
          lookup: { id: string }
        }
        const second = await request.execute(requestInput(scenario.contextA))

        expect(second).toMatchObject({
          kind: 'existing',
          lookup: { id: first.lookup.id, status: 'queued' },
        })
        expect(await database.db.select().from(nfeAccessKeyLookups)).toHaveLength(1)
        expect(await database.db.select().from(nfeImports)).toHaveLength(1)
        expect(await database.db.select().from(processingOutbox)).toHaveLength(1)
      })
    },
    60_000,
  )

  testWithPostgres(
    'concurrent duplicate requests produce one lookup, one import and one event',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const { request } = createUseCases(database)

        const results = await Promise.all(
          Array.from({ length: 8 }, () => request.execute(requestInput(scenario.contextA))),
        )

        const kinds = results.map((result) => (result as { kind: string }).kind)
        expect(kinds.filter((kind) => kind === 'created')).toHaveLength(1)
        expect(kinds.filter((kind) => kind === 'existing')).toHaveLength(7)
        const [lookup] = await database.db.select().from(nfeAccessKeyLookups)
        for (const result of results) {
          const view = (result as { lookup: { id: string } }).lookup
          expect(view.id).toBe(lookup?.id ?? 'missing')
        }
        expect(await database.db.select().from(nfeAccessKeyLookups)).toHaveLength(1)
        expect(await database.db.select().from(nfeImports)).toHaveLength(1)
        expect(await database.db.select().from(processingOutbox)).toHaveLength(1)
      })
    },
    60_000,
  )

  testWithPostgres(
    'RF8: a definitive refusal finished inside 24 hours is reused; older or non-definitive ones are not',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const { request } = createUseCases(database)
        const recentRefusal = await seedFinishedLookup(database, scenario, {
          accessKey: ACCESS_KEY,
          ageMs: 23 * HOUR_MS,
          reason: 'not_found',
          status: 'refused',
        })
        await seedFinishedLookup(database, scenario, {
          accessKey: OTHER_ACCESS_KEY,
          ageMs: 25 * HOUR_MS,
          reason: 'not_found',
          status: 'refused',
        })

        const reused = await request.execute(requestInput(scenario.contextA))
        const afterWindow = await request.execute(requestInput(scenario.contextA, OTHER_ACCESS_KEY))

        expect(reused).toMatchObject({
          kind: 'existing',
          lookup: { id: recentRefusal, reason: 'not_found', status: 'refused' },
        })
        expect(afterWindow).toMatchObject({ kind: 'created' })
      })
    },
    60_000,
  )

  testWithPostgres(
    'RF8: a transient failure is asked again, even when it finished a minute ago',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const { request } = createUseCases(database)
        await seedFinishedLookup(database, scenario, {
          accessKey: ACCESS_KEY,
          ageMs: 60_000,
          reason: 'sefaz_unavailable',
          status: 'failed',
        })

        const result = await request.execute(requestInput(scenario.contextA))

        expect(result).toMatchObject({ kind: 'created' })
      })
    },
    60_000,
  )

  testWithPostgres(
    '409 NFE_DISTRIBUTION_NOT_CONFIGURED without a fiscal profile, creating nothing',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database, { withFiscalProfile: false })
        const { request } = createUseCases(database)

        const error = await captureApiError(() => request.execute(requestInput(scenario.contextA)))

        expect(error.code).toBe('NFE_DISTRIBUTION_NOT_CONFIGURED')
        expect(await database.db.select().from(nfeAccessKeyLookups)).toEqual([])
        expect(await database.db.select().from(nfeImports)).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'GET: the owner reads the lookup, another company gets 404 never 403',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const { get, request } = createUseCases(database)
        const created = (await request.execute(requestInput(scenario.contextA))) as {
          lookup: { id: string }
        }

        const own = await get.execute({ context: scenario.contextA, lookupId: created.lookup.id })
        const foreign = await captureApiError(() =>
          get.execute({ context: scenario.contextB, lookupId: created.lookup.id }),
        )
        const unknown = await captureApiError(() =>
          get.execute({ context: scenario.contextA, lookupId: crypto.randomUUID() }),
        )

        expect(own).toEqual({
          documentId: null,
          id: created.lookup.id,
          notBefore: null,
          reason: null,
          status: 'queued',
        })
        expect(foreign.status).toBe(404)
        expect(foreign.code).toBe('NFE_ACCESS_KEY_LOOKUP_NOT_FOUND')
        expect(unknown.status).toBe(404)
        expect(
          await database.db
            .select()
            .from(nfeAccessKeyLookups)
            .where(eq(nfeAccessKeyLookups.companyId, scenario.companyIdB)),
        ).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'a claim lost to a winner that already finished returns the latest lookup, in any status',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database, { environment: 'homologation' })
        const finishedId = await seedFinishedLookup(database, scenario, {
          accessKey: ACCESS_KEY,
          ageMs: 1000,
          reason: 'sefaz_unavailable',
          status: 'failed',
        })
        const repository = new DrizzleNfeAccessKeyLookupRepository(database.db)
        let claimAttempts = 0
        const racingUnitOfWork = {
          execute: <TResult>(operation: Parameters<typeof repository.execute<TResult>>[0]) =>
            repository.execute((transaction) =>
              operation(
                new Proxy(transaction, {
                  get(target, property, receiver) {
                    if (property !== 'claimLookup') return Reflect.get(target, property, receiver)
                    return async () => {
                      claimAttempts += 1
                      return null
                    }
                  },
                }),
              ),
            ),
        }
        const request = createRequestAccessKeyLookupUseCase({
          clock: { now: () => new Date() },
          fingerprintService: { create: async () => SHA },
          unitOfWork: racingUnitOfWork,
        })

        const result = await request.execute(requestInput(scenario.contextA))

        expect(claimAttempts).toBe(1)
        expect(result).toMatchObject({
          kind: 'existing',
          lookup: { id: finishedId, reason: 'sefaz_unavailable', status: 'failed' },
        })
        expect(await database.db.select().from(nfeImports)).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'counts only the active lookups of the company, inside the transaction',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database, { environment: 'homologation' })
        await seedFinishedLookup(database, scenario, {
          accessKey: OTHER_ACCESS_KEY,
          ageMs: 1000,
          reason: 'not_found',
          status: 'refused',
        })
        const { request } = createUseCases(database)
        await request.execute(requestInput(scenario.contextA))
        const repository = new DrizzleNfeAccessKeyLookupRepository(database.db)

        const own = await repository.execute((transaction) =>
          transaction.countActiveLookups({ companyId: scenario.companyIdA }),
        )
        const other = await repository.execute((transaction) =>
          transaction.countActiveLookups({ companyId: scenario.companyIdB }),
        )

        expect(own).toBe(1)
        expect(other).toBe(0)
      })
    },
    60_000,
  )
})

function createUseCases(database: TestDatabase) {
  const repository = new DrizzleNfeAccessKeyLookupRepository(database.db)
  return {
    get: createGetAccessKeyLookupUseCase({ reader: repository }),
    request: createRequestAccessKeyLookupUseCase({
      clock: { now: () => new Date() },
      fingerprintService: { create: async () => SHA },
      unitOfWork: repository,
    }),
  }
}

function requestInput(context: CompanyContext, accessKey: string = ACCESS_KEY) {
  return { accessKey, context, correlationId: CORRELATION_ID }
}

type Scenario = {
  readonly companyIdA: string
  readonly companyIdB: string
  readonly contextA: CompanyContext
  readonly contextB: CompanyContext
  readonly userId: string
}

async function seedScenario(
  database: TestDatabase,
  options: {
    readonly environment?: 'homologation' | 'production'
    readonly withFiscalProfile?: boolean
  } = {},
): Promise<Scenario> {
  const companyIdA = crypto.randomUUID()
  const companyIdB = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipIdA = crypto.randomUUID()
  const membershipIdB = crypto.randomUUID()
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(companies).values([
    { id: companyIdA, status: 'active' },
    { id: companyIdB, status: 'active' },
  ])
  await database.db.insert(userCompanyMemberships).values([
    { companyId: companyIdA, id: membershipIdA, status: 'active', userId },
    { companyId: companyIdB, id: membershipIdB, status: 'active', userId },
  ])
  if (options.withFiscalProfile !== false) {
    await database.db.insert(companyFiscalProfiles).values({
      city: 'Ribeirao Preto',
      cityIbgeCode: '3543402',
      cnpj: '11111111000191',
      companyId: companyIdA,
      complement: '',
      district: 'Centro',
      email: 'fiscal@example.test',
      environment: options.environment ?? 'homologation',
      legalName: 'Transportadora Teste Ltda',
      municipalRegistration: '123456',
      number: '100',
      phone: '1630000000',
      postalCode: '14000000',
      rntrc: '58151044',
      state: 'SP',
      stateRegistration: '110000000000',
      street: 'Rua da Transportadora',
      taxRegime: '1',
      tradeName: 'Transportadora Teste',
    })
  }
  const context = (companyId: string, membershipId: string): CompanyContext => ({
    companyId,
    kind: 'company',
    membershipId,
    permissions: new Set(['invoices.import', 'invoices.read']),
    roles: [],
    userId,
  })
  return {
    companyIdA,
    companyIdB,
    contextA: context(companyIdA, membershipIdA),
    contextB: context(companyIdB, membershipIdB),
    userId,
  }
}

async function seedDocument(database: TestDatabase, scenario: Scenario): Promise<string> {
  const documentId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: scenario.companyIdA,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${scenario.companyIdA}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: scenario.companyIdA,
    correlationId: `correlation-${scenario.companyIdA}`,
    id: importId,
    idempotencyKey: `import-${scenario.companyIdA}`,
    requestFingerprint: `fingerprint-${scenario.companyIdA}`,
    requestedByUserId: scenario.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: ACCESS_KEY,
    authorizationProtocol: 'protocol-0001',
    companyId: scenario.companyIdA,
    createdByUserId: scenario.userId,
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-01T12:00:00.000Z'),
    model: '55',
    number: '31',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: SHA,
  })
  return documentId
}

async function seedFinishedLookup(
  database: TestDatabase,
  scenario: Scenario,
  input: {
    readonly accessKey: string
    readonly ageMs: number
    readonly reason: 'not_found' | 'sefaz_unavailable'
    readonly status: 'failed' | 'refused'
  },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(nfeAccessKeyLookups).values({
    accessKey: input.accessKey,
    companyId: scenario.companyIdA,
    correlationId: CORRELATION_ID,
    environment: 'homologation',
    finishedAt: new Date(Date.now() - input.ageMs),
    id,
    reason: input.reason,
    requestedByUserId: scenario.userId,
    status: input.status,
  })
  return id
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_access_key_lookups',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
