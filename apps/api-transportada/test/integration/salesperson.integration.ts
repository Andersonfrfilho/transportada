/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 316 T1.2/T1.3: o que só um Postgres de verdade prova no cadastro do vendedor. E-mail e celular são únicos na
 * empresa (409 estável), o vendedor atende várias contratantes, a carteira é substituída por inteiro e só aceita cliente
 * cadastrado da mesma empresa, desligar a contratante leva a carteira junto e toda escrita audita na mesma transação.
 */
import { describe, expect, test } from 'bun:test'
import { asc, eq } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  contractors,
  deliveryClients,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { contractorSalespersonClients } from '../../src/database/salesperson.schema.js'
import { DrizzleSalespersonRepository } from '../../src/salespeople/infrastructure/drizzle-salesperson.repository.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>
type Tenant = { readonly companyId: string; readonly userId: string }

const IP_ADDRESS = '203.0.113.7'
const ANA = {
  email: 'ana@loja.com.br',
  name: 'Ana',
  status: 'active',
  whatsappE164: '+5511999998888',
  whatsappPhoneKey: '551199998888',
} as const

function actorOf(tenant: Tenant, correlationId: string) {
  return {
    companyId: tenant.companyId,
    correlationId,
    ipAddress: IP_ADDRESS,
    userId: tenant.userId,
  }
}

describe('salesperson repository integration (spec 316)', () => {
  testWithPostgres('creates the salesperson with one audit entry and no contact leak', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleSalespersonRepository(database.db)

      const created = await repository.create({ ...actorOf(tenant, 'c1'), fields: ANA })

      expect(created).toMatchObject({
        email: ANA.email,
        name: 'Ana',
        whatsappE164: '+5511999998888',
      })
      const audits = await readAudits(database, tenant.companyId)
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        action: 'salesperson.changed',
        actorUserId: tenant.userId,
        entityId: created.id,
        permission: 'settings.manage',
      })
      expect(JSON.stringify(audits[0])).not.toContain(ANA.email)
      expect(JSON.stringify(audits[0])).not.toContain('99999')
    })
  })

  testWithPostgres('a repeated e-mail or phone in the same company is a stable 409', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleSalespersonRepository(database.db)
      await repository.create({ ...actorOf(tenant, 'c1'), fields: ANA })

      await expect(
        repository.create({
          ...actorOf(tenant, 'c2'),
          fields: { ...ANA, whatsappE164: null, whatsappPhoneKey: null },
        }),
      ).rejects.toMatchObject({ code: 'SALESPERSON_EMAIL_CONFLICT', status: 409 })
      await expect(
        repository.create({
          ...actorOf(tenant, 'c3'),
          fields: { ...ANA, email: 'outra@loja.com.br' },
        }),
      ).rejects.toMatchObject({ code: 'SALESPERSON_PHONE_CONFLICT', status: 409 })
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres('the same e-mail in another company is allowed', async () => {
    await withDisposableDatabase(async (database) => {
      const first = await seedTenant(database)
      const second = await seedTenant(database)
      const repository = new DrizzleSalespersonRepository(database.db)
      await repository.create({ ...actorOf(first, 'c1'), fields: ANA })

      await repository.create({ ...actorOf(second, 'c2'), fields: ANA })

      expect(await repository.list({ companyId: second.companyId, search: null })).toHaveLength(1)
    })
  })

  testWithPostgres(
    'one salesperson serves several contractors, each with its own portfolio',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleSalespersonRepository(database.db)
        const alpha = await seedContractor(database, tenant, '11111111000111')
        const beta = await seedContractor(database, tenant, '22222222000122')
        await seedClient(database, tenant, '33333333000133')
        await seedClient(database, tenant, '44444444000144')
        const person = await repository.create({ ...actorOf(tenant, 'c1'), fields: ANA })

        await repository.linkContractor({
          ...actorOf(tenant, 'c2'),
          contractorId: alpha,
          id: person.id,
        })
        await repository.linkContractor({
          ...actorOf(tenant, 'c3'),
          contractorId: beta,
          id: person.id,
        })
        await repository.replacePortfolio({
          ...actorOf(tenant, 'c4'),
          contractorId: alpha,
          id: person.id,
          taxIds: ['33333333000133', '44444444000144'],
        })
        await repository.replacePortfolio({
          ...actorOf(tenant, 'c5'),
          contractorId: beta,
          id: person.id,
          taxIds: ['33333333000133'],
        })
        const replaced = await repository.replacePortfolio({
          ...actorOf(tenant, 'c6'),
          contractorId: alpha,
          id: person.id,
          taxIds: ['44444444000144'],
        })

        expect(replaced.map((client) => client.taxId)).toEqual(['44444444000144'])
        const [listed] = await repository.list({ companyId: tenant.companyId, search: null })
        expect(listed?.contractors.map((link) => link.clientCount).sort()).toEqual([1, 1])
        const betaPortfolio = await repository.readPortfolio({
          companyId: tenant.companyId,
          contractorId: beta,
          id: person.id,
        })
        expect(betaPortfolio.map((client) => client.taxId)).toEqual(['33333333000133'])
      })
    },
  )

  testWithPostgres(
    'the portfolio refuses a client that is not registered in the company',
    async () => {
      await withDisposableDatabase(async (database) => {
        const owner = await seedTenant(database)
        const stranger = await seedTenant(database)
        const repository = new DrizzleSalespersonRepository(database.db)
        const contractor = await seedContractor(database, owner, '11111111000111')
        await seedClient(database, stranger, '55555555000155')
        const person = await repository.create({ ...actorOf(owner, 'c1'), fields: ANA })
        await repository.linkContractor({
          ...actorOf(owner, 'c2'),
          contractorId: contractor,
          id: person.id,
        })

        await expect(
          repository.replacePortfolio({
            ...actorOf(owner, 'c3'),
            contractorId: contractor,
            id: person.id,
            taxIds: ['55555555000155'],
          }),
        ).rejects.toMatchObject({ code: 'SALESPERSON_PORTFOLIO_CLIENT_UNKNOWN', status: 422 })
        expect(await database.db.select().from(contractorSalespersonClients)).toEqual([])
      })
    },
  )

  testWithPostgres('unlinking the contractor takes its portfolio along', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleSalespersonRepository(database.db)
      const contractor = await seedContractor(database, tenant, '11111111000111')
      await seedClient(database, tenant, '33333333000133')
      const person = await repository.create({ ...actorOf(tenant, 'c1'), fields: ANA })
      await repository.linkContractor({
        ...actorOf(tenant, 'c2'),
        contractorId: contractor,
        id: person.id,
      })
      await repository.replacePortfolio({
        ...actorOf(tenant, 'c3'),
        contractorId: contractor,
        id: person.id,
        taxIds: ['33333333000133'],
      })

      await repository.unlinkContractor({
        ...actorOf(tenant, 'c4'),
        contractorId: contractor,
        id: person.id,
      })

      expect(await database.db.select().from(contractorSalespersonClients)).toEqual([])
      await expect(
        repository.readPortfolio({
          companyId: tenant.companyId,
          contractorId: contractor,
          id: person.id,
        }),
      ).rejects.toMatchObject({ code: 'SALESPERSON_LINK_NOT_FOUND', status: 404 })
    })
  })

  testWithPostgres('another company neither reads nor edits the salesperson', async () => {
    await withDisposableDatabase(async (database) => {
      const owner = await seedTenant(database)
      const stranger = await seedTenant(database)
      const repository = new DrizzleSalespersonRepository(database.db)
      const person = await repository.create({ ...actorOf(owner, 'c1'), fields: ANA })

      expect(await repository.list({ companyId: stranger.companyId, search: null })).toEqual([])
      await expect(
        repository.update({
          ...actorOf(stranger, 'c2'),
          fields: { ...ANA, name: 'X' },
          id: person.id,
        }),
      ).rejects.toMatchObject({ code: 'SALESPERSON_NOT_FOUND', status: 404 })
    })
  })

  testWithPostgres('the database refuses a salesperson with no channel', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleSalespersonRepository(database.db)

      await expect(
        repository.create({
          ...actorOf(tenant, 'c1'),
          fields: {
            email: null,
            name: 'Ana',
            status: 'active',
            whatsappE164: null,
            whatsappPhoneKey: null,
          },
        }),
      ).rejects.toThrow()
      expect(await repository.list({ companyId: tenant.companyId, search: null })).toEqual([])
    })
  })
})

async function readAudits(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.companyId, companyId))
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
}

async function seedContractor(database: TestDatabase, tenant: Tenant, taxId: string) {
  const id = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: tenant.companyId, displayName: `Contratante ${taxId}`, id, taxId })
  return id
}

async function seedClient(database: TestDatabase, tenant: Tenant, taxId: string) {
  await database.db
    .insert(deliveryClients)
    .values({ companyId: tenant.companyId, displayName: `Cliente ${taxId}`, taxId })
}

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
    namePrefix: 'transportada_salesp',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 },
        url: connectionString,
      }),
    operation,
  })
}
