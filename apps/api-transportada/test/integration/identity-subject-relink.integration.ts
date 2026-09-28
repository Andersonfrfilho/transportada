/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `linkIdentitySubject` substitui, não soma. A constraint única é em `(issuer, subject)`, não em
 * `userId` sozinho — gravar o vínculo novo sem apagar o velho deixava os dois lado a lado, e a
 * reconciliação (que junta por `userId`) mostrava a mesma pessoa duas vezes: uma completa, uma
 * "sem acesso" para sempre, com o botão de conserto sem efeito nenhum. Achado em staging
 * (28/09/2026), depois de a T6.9 anterior desta spec já ter corrigido o sync para recriar contas
 * com `subject` órfão — a recriação funcionou, mas deixou o fantasma para trás.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  externalIdentities,
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

const ISSUER = 'https://keycloak.test/realms/transportada'

describe('religar o subject de uma identidade substitui o antigo', () => {
  testWithPostgres('duas ligações seguidas deixam só a mais nova', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const userId = await seedMember(db, companyId)
      const repository = new DrizzleCompanyUserRepository(db)

      await repository.linkIdentitySubject({ issuer: ISSUER, subject: 'subject-velho', userId })
      await repository.linkIdentitySubject({ issuer: ISSUER, subject: 'subject-novo', userId })

      const rows = await countIdentities(db, { issuer: ISSUER, userId })
      expect(rows).toEqual(['subject-novo'])
    })
  })

  /** Outro issuer é outra fronteira: religar num realm não pode apagar o vínculo de outro. */
  testWithPostgres('não apaga o vínculo de um issuer diferente', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const userId = await seedMember(db, companyId)
      const repository = new DrizzleCompanyUserRepository(db)
      const otherIssuer = 'https://keycloak.test/realms/outro-produto'

      await repository.linkIdentitySubject({
        issuer: otherIssuer,
        subject: 'subject-outro',
        userId,
      })
      await repository.linkIdentitySubject({ issuer: ISSUER, subject: 'subject-velho', userId })
      await repository.linkIdentitySubject({ issuer: ISSUER, subject: 'subject-novo', userId })

      expect(await countIdentities(db, { issuer: ISSUER, userId })).toEqual(['subject-novo'])
      expect(await countIdentities(db, { issuer: otherIssuer, userId })).toEqual(['subject-outro'])
    })
  })
})

async function countIdentities(
  db: TestDatabase['db'],
  input: { readonly issuer: string; readonly userId: string },
): Promise<readonly string[]> {
  const rows = await db
    .select({ subject: externalIdentities.subject })
    .from(externalIdentities)
    .where(
      and(eq(externalIdentities.issuer, input.issuer), eq(externalIdentities.userId, input.userId)),
    )
  return rows.map((row) => row.subject)
}

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function seedMember(db: TestDatabase['db'], companyId: string): Promise<string> {
  const userId = crypto.randomUUID()
  await db.insert(identityUsers).values({ id: userId })
  await db.insert(userCompanyMemberships).values({ companyId, status: 'active', userId })
  return userId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_subjectrelink_${crypto.randomUUID().replaceAll('-', '')}`
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
