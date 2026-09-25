/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Remover o vínculo de quem já foi convidado. `user_invitations` e `password_reset_requests` têm FK
 * `ON DELETE RESTRICT` para a membership, e nenhum outro teste passava por este caminho: a hipótese
 * da spec 191 (T0.2) é que o `DELETE` bate no `23503` e a rota responde 500.
 *
 * A falha é capturada como `{ sqlState, constraint }` para que o vermelho diga qual FK barrou, e a
 * T2.2 é quem põe o teste verde.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  passwordResetRequests,
  userCompanyMemberships,
  userInvitations,
} from '../../src/database/database.schema.js'
import {
  findPostgresError,
  type PostgresErrorDetails,
} from '../../src/database/postgres-error.support.js'
import { DrizzleCompanyUserRepository } from '../../src/identity/infrastructure/drizzle-company-user.repository.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const ISSUED_AT = new Date('2026-09-01T12:00:00.000Z')
const EXPIRES_AT = new Date('2026-09-02T12:00:00.000Z')

describe('remover vínculo com histórico de convite e de recuperação', () => {
  testWithPostgres('(a) convidado ainda não ativado: o vínculo sai', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const userId = await seedMember(db, companyId)
      await seedInvitation(db, { accepted: false, companyId, userId })

      const failure = await captureDatabaseFailure(() =>
        new DrizzleCompanyUserRepository(db).removeMembership({ companyId, userId }),
      )

      expect(failure).toBeUndefined()
      expect(await countMemberships(db, { companyId, userId })).toBe(0)
    })
  })

  testWithPostgres('(b) ativado, com um pedido de recuperação: o vínculo sai', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const userId = await seedMember(db, companyId)
      await seedInvitation(db, { accepted: true, companyId, userId })
      await seedPasswordResetRequest(db, { companyId, userId })

      const failure = await captureDatabaseFailure(() =>
        new DrizzleCompanyUserRepository(db).removeMembership({ companyId, userId }),
      )

      expect(failure).toBeUndefined()
      expect(await countMemberships(db, { companyId, userId })).toBe(0)
    })
  })

  /**
   * No (b) a FK do convite barra antes e esconde a do pedido. O vínculo sem convite existe de
   * verdade (o primeiro administrador nasce sem convite), e isola a segunda FK.
   */
  testWithPostgres('(c) sem convite, com um pedido de recuperação: o vínculo sai', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const userId = await seedMember(db, companyId)
      await seedPasswordResetRequest(db, { companyId, userId })

      const failure = await captureDatabaseFailure(() =>
        new DrizzleCompanyUserRepository(db).removeMembership({ companyId, userId }),
      )

      expect(failure).toBeUndefined()
      expect(await countMemberships(db, { companyId, userId })).toBe(0)
    })
  })
})

async function captureDatabaseFailure(
  operation: () => Promise<void>,
): Promise<PostgresErrorDetails | undefined> {
  try {
    await operation()
    return undefined
  } catch (error) {
    return (
      findPostgresError({ error }) ?? { constraint: undefined, sqlState: 'not-a-postgres-error' }
    )
  }
}

async function countMemberships(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly userId: string },
): Promise<number> {
  const rows = await db
    .select({ id: userCompanyMemberships.id })
    .from(userCompanyMemberships)
    .where(
      and(
        eq(userCompanyMemberships.companyId, input.companyId),
        eq(userCompanyMemberships.userId, input.userId),
      ),
    )
  return rows.length
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

async function seedInvitation(
  db: TestDatabase['db'],
  input: { readonly accepted: boolean; readonly companyId: string; readonly userId: string },
): Promise<void> {
  await db.insert(userInvitations).values({
    acceptedAt: input.accepted ? EXPIRES_AT : null,
    codeHash: randomHash(),
    companyId: input.companyId,
    createdAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    status: input.accepted ? 'accepted' : 'pending',
    userId: input.userId,
  })
}

async function seedPasswordResetRequest(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly userId: string },
): Promise<void> {
  await db.insert(passwordResetRequests).values({
    codeHash: randomHash(),
    companyId: input.companyId,
    createdAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    sealedCode: { ciphertext: 'selado', version: 1 },
    userId: input.userId,
  })
}

function randomHash(): string {
  return new Bun.CryptoHasher('sha256').update(crypto.randomUUID()).digest('hex')
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_userremoval_${crypto.randomUUID().replaceAll('-', '')}`
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
