/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O cargo mora na membership (`user_company_memberships.job_title`), e a mesma pessoa pode ter
 * vínculo com mais de uma empresa: gravar o cargo de uma não pode tocar a outra. Só um banco de
 * verdade prova o `WHERE (user_id, company_id)`.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUserProfiles,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { DrizzleCompanyUserRepository } from '../../src/identity/infrastructure/drizzle-company-user.repository.js'
import { toCompanyUserView } from '../../src/identity/domain/company-user.policy.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('cargo do usuário da empresa — banco', () => {
  testWithPostgres('grava, lê de volta e limpa, sem tocar a outra empresa', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const otherCompanyId = await seedCompany(db)
      const userId = await seedUserWithProfile(db)
      await seedMembership(db, { companyId, userId })
      await seedMembership(db, { companyId: otherCompanyId, userId })
      const repository = new DrizzleCompanyUserRepository(db)

      await repository.updateJobTitle({ companyId, jobTitle: 'Gerente Comercial', userId })

      const record = await repository.findByUserId({ companyId, userId })
      expect(record?.jobTitle).toBe('Gerente Comercial')
      expect(toCompanyUserView(record!).jobTitle).toBe('Gerente Comercial')
      expect(await readJobTitle(db, { companyId: otherCompanyId, userId })).toBeNull()

      await repository.updateJobTitle({ companyId, jobTitle: null, userId })
      expect(await readJobTitle(db, { companyId, userId })).toBeNull()
    })
  })

  testWithPostgres('empresa do contexto que não é a do vínculo não grava nada', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const strangerCompanyId = await seedCompany(db)
      const userId = await seedUserWithProfile(db)
      await seedMembership(db, { companyId, userId })

      await new DrizzleCompanyUserRepository(db).updateJobTitle({
        companyId: strangerCompanyId,
        jobTitle: 'Invasor',
        userId,
      })

      expect(await readJobTitle(db, { companyId, userId })).toBeNull()
    })
  })

  testWithPostgres('o CHECK do banco recusa 81 caracteres', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const userId = await seedUserWithProfile(db)
      await seedMembership(db, { companyId, userId })

      await expect(
        new DrizzleCompanyUserRepository(db).updateJobTitle({
          companyId,
          jobTitle: 'a'.repeat(81),
          userId,
        }),
      ).rejects.toThrow()
    })
  })
})

async function readJobTitle(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly userId: string },
): Promise<string | null | undefined> {
  const [row] = await db
    .select({ jobTitle: userCompanyMemberships.jobTitle })
    .from(userCompanyMemberships)
    .where(
      and(
        eq(userCompanyMemberships.companyId, input.companyId),
        eq(userCompanyMemberships.userId, input.userId),
      ),
    )
  return row?.jobTitle
}

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function seedUserWithProfile(db: TestDatabase['db']): Promise<string> {
  const userId = crypto.randomUUID()
  await db.insert(identityUsers).values({ id: userId })
  await db.insert(identityUserProfiles).values({
    contactAddress: 'pessoa@empresa.test',
    contactChannel: 'email',
    email: 'pessoa@empresa.test',
    name: 'Pessoa Com Cargo',
    phone: '',
    taxId: '',
    userId,
    username: `pessoa-${userId.slice(0, 8)}`,
  })
  return userId
}

async function seedMembership(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly userId: string },
): Promise<void> {
  await db.insert(userCompanyMemberships).values({
    companyId: input.companyId,
    status: 'active',
    userId: input.userId,
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_jobtitle',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
