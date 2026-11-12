/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 285: o que só um Postgres de verdade prova no cadastro da automação do fluxo semanal. Nasce
 * desligada; criar e editar auditam na mesma transação; o nome é único na empresa (409 estável); uma
 * empresa não lê nem edita a automação de outra; o banco recusa XML que não seja de CT-e e parte acima
 * de 100.
 */
import { describe, expect, test } from 'bun:test'
import { asc, eq } from 'drizzle-orm'

import { DrizzleContractorAutomationRepository } from '../../src/contractor-automations/infrastructure/drizzle-contractor-automation.repository.js'
import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  contractorAutomations,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>
type Tenant = { readonly companyId: string; readonly userId: string }

const IP_ADDRESS = '203.0.113.7'
const FIELDS = {
  billingDueDays: 15,
  enabled: false,
  name: 'Spani',
  nfseCity: 'RIBEIRAO PRETO',
  partSize: 100,
  recipients: ['michele@spani.com.br', 'vitor@spani.com.br'],
  xmlKind: 'cte',
} as const

function actorOf(tenant: Tenant, correlationId: string) {
  return {
    companyId: tenant.companyId,
    correlationId,
    ipAddress: IP_ADDRESS,
    userId: tenant.userId,
  }
}

async function readAudits(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.companyId, companyId))
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
}

describe('contractor automation repository integration (spec 285)', () => {
  testWithPostgres('creates the automation off, with one audit entry', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleContractorAutomationRepository(database.db)

      const created = await repository.create({ ...actorOf(tenant, 'corr-create'), fields: FIELDS })

      expect(created).toMatchObject({ ...FIELDS, recipients: [...FIELDS.recipients] })
      expect(await repository.list({ companyId: tenant.companyId })).toHaveLength(1)
      const audits = await readAudits(database, tenant.companyId)
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        action: 'contractor-automation.changed',
        actorUserId: tenant.userId,
        beforeSnapshot: null,
        correlationId: 'corr-create',
        entityId: created.id,
        metadata: { ipAddress: IP_ADDRESS },
        permission: 'settings.manage',
      })
      expect(audits[0]?.afterSnapshot).toMatchObject({ enabled: false, recipientCount: 2 })
    })
  })

  testWithPostgres('turning it on is an update that audits before and after', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleContractorAutomationRepository(database.db)
      const created = await repository.create({ ...actorOf(tenant, 'c1'), fields: FIELDS })

      const updated = await repository.update({
        ...actorOf(tenant, 'c2'),
        fields: { ...FIELDS, enabled: true, recipients: ['a@spani.com.br'] },
        id: created.id,
      })

      expect(updated).toMatchObject({ enabled: true, recipients: ['a@spani.com.br'] })
      const audits = await readAudits(database, tenant.companyId)
      expect(audits).toHaveLength(2)
      expect(audits[1]?.beforeSnapshot).toMatchObject({ enabled: false, recipientCount: 2 })
      expect(audits[1]?.afterSnapshot).toMatchObject({ enabled: true, recipientCount: 1 })
    })
  })

  testWithPostgres('a repeated name in the same company is a stable 409', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleContractorAutomationRepository(database.db)
      await repository.create({ ...actorOf(tenant, 'c1'), fields: FIELDS })

      await expect(
        repository.create({ ...actorOf(tenant, 'c2'), fields: FIELDS }),
      ).rejects.toMatchObject({ code: 'CONTRACTOR_AUTOMATION_NAME_CONFLICT', status: 409 })
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres('another company neither reads nor edits the automation', async () => {
    await withDisposableDatabase(async (database) => {
      const owner = await seedTenant(database)
      const stranger = await seedTenant(database)
      const repository = new DrizzleContractorAutomationRepository(database.db)
      const created = await repository.create({ ...actorOf(owner, 'c1'), fields: FIELDS })

      expect(await repository.list({ companyId: stranger.companyId })).toEqual([])
      await expect(
        repository.update({
          ...actorOf(stranger, 'c2'),
          fields: { ...FIELDS, enabled: true },
          id: created.id,
        }),
      ).rejects.toMatchObject({ code: 'CONTRACTOR_AUTOMATION_NOT_FOUND', status: 404 })
      const [row] = await database.db
        .select()
        .from(contractorAutomations)
        .where(eq(contractorAutomations.id, created.id))
      expect(row?.enabled).toBe(false)
    })
  })

  testWithPostgres('the database refuses non-CT-e XML and parts above 100', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleContractorAutomationRepository(database.db)

      await expect(
        repository.create({
          ...actorOf(tenant, 'c1'),
          fields: { ...FIELDS, xmlKind: 'nfe' as never },
        }),
      ).rejects.toThrow()
      await expect(
        repository.create({ ...actorOf(tenant, 'c2'), fields: { ...FIELDS, partSize: 101 } }),
      ).rejects.toThrow()
      expect(await repository.list({ companyId: tenant.companyId })).toEqual([])
    })
  })
})

async function seedTenant(database: TestDatabase): Promise<Tenant> {
  const tenant: Tenant = { companyId: crypto.randomUUID(), userId: crypto.randomUUID() }
  await database.db.insert(companies).values({ id: tenant.companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: tenant.userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId: tenant.companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: tenant.userId,
  })
  return tenant
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_autom',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 },
        url: connectionString,
      }),
    operation,
  })
}
