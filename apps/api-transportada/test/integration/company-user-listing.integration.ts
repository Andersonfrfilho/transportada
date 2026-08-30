/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A listagem alcançava o perfil por `innerJoin`, e vínculo sem perfil — conta criada antes de o
 * perfil passar a ser gravado — desaparecia da tela inteira. A pessoa entrava no sistema, aparecia
 * no token, administrava usuários, e não se via na tela que administra usuários.
 *
 * Nenhum teste com repositório falso pega isto: o defeito é o `JOIN`, e só um banco de verdade tem
 * `JOIN`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUserProfiles,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { DrizzleCompanyUserRepository } from '../../src/identity/infrastructure/drizzle-company-user.repository.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('listagem de usuários — o vínculo sem perfil', () => {
  testWithPostgres('mostra quem tem vínculo e ainda não tem perfil', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const withProfile = await seedMember(db, { companyId, profile: true })
      const withoutProfile = await seedMember(db, { companyId, profile: false })

      const page = await new DrizzleCompanyUserRepository(db).listPage({
        companyId,
        cursor: null,
        limit: 50,
      })

      const listed = page.items.map((item) => item.userId)
      expect(listed).toContain(withProfile)
      expect(listed).toContain(withoutProfile)
    })
  })

  /**
   * O perfil ausente vira campo vazio, não linha escondida: a tela mostra que a pessoa existe e que
   * falta cadastro, e é assim que alguém a conserta. Esconder é o defeito, não a proteção.
   */
  testWithPostgres('entrega campo vazio no lugar do perfil que não existe', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const userId = await seedMember(db, { companyId, profile: false })

      const page = await new DrizzleCompanyUserRepository(db).listPage({
        companyId,
        cursor: null,
        limit: 50,
      })
      const item = page.items.find((entry) => entry.userId === userId)

      expect(item).toBeDefined()
      expect(item?.name).toBe('')
      expect(item?.email).toBe('')
      expect(item?.username).toBe('')
      // O canal precisa de um valor para o formato existir; o contato continua vazio.
      expect(item?.contactChannel).toBe('email')
      expect(item?.contactAddress).toBe('')
    })
  })

  testWithPostgres('não alcança vínculo de outra empresa', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const otherCompanyId = await seedCompany(db)
      await seedMember(db, { companyId: otherCompanyId, profile: false })

      const page = await new DrizzleCompanyUserRepository(db).listPage({
        companyId,
        cursor: null,
        limit: 50,
      })

      expect(page.items).toHaveLength(0)
    })
  })
})

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function seedMember(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly profile: boolean },
): Promise<string> {
  const userId = crypto.randomUUID()
  await db.insert(identityUsers).values({ id: userId })
  if (input.profile) {
    await db.insert(identityUserProfiles).values({
      contactAddress: 'pessoa@empresa.test',
      contactChannel: 'email',
      email: 'pessoa@empresa.test',
      name: 'Pessoa Com Perfil',
      phone: '',
      taxId: '',
      userId,
      username: `pessoa-${userId.slice(0, 8)}`,
    })
  }
  await db.insert(userCompanyMemberships).values({
    companyId: input.companyId,
    status: 'active',
    userId,
  })
  return userId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_userlist_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
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
