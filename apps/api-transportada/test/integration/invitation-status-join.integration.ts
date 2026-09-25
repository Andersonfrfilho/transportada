/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0076 §8, spec 191 T2.3: `findByCodeHash`, `findLatestForUser` e `create` juntam a membership e
 * a identidade à linha do convite (`InvitationSnapshot.membershipStatus`/`identityStatus`), para que
 * `decideInvitationActivation` recuse um código válido de vínculo suspenso ou identidade desabilitada.
 * Nenhum teste com repositório falso prova isso — o defeito seria no `JOIN`, e só um banco de
 * verdade tem `JOIN`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { hashInvitationCode } from '../../src/identity/domain/invitation.policy.js'
import { DrizzleInvitationRepository } from '../../src/identity/infrastructure/drizzle-invitation.repository.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('o convite junta o status da membership e da identidade', () => {
  testWithPostgres(
    'findByCodeHash devolve o vínculo desabilitado que o convite pendente tem hoje',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const userId = await seedMember(db, { companyId, status: 'disabled' })
        const code = 'a'.repeat(16)
        const codeHash = hashInvitationCode(code)

        const created = await new DrizzleInvitationRepository(db).create({
          codeHash,
          companyId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          roles: [],
          sealedCode: { ciphertext: 'selado', keyId: 'test', version: 1 } as never,
          supersededInvitationId: undefined,
          userId,
        })
        expect(created.membershipStatus).toBe('disabled')
        expect(created.identityStatus).toBe('active')

        const found = await new DrizzleInvitationRepository(db).findByCodeHash({ codeHash })
        expect(found?.membershipStatus).toBe('disabled')
        expect(found?.identityStatus).toBe('active')

        const latest = await new DrizzleInvitationRepository(db).findLatestForUser({
          companyId,
          userId,
        })
        expect(latest?.membershipStatus).toBe('disabled')
      })
    },
  )
})

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function seedMember(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly status: 'active' | 'disabled' },
): Promise<string> {
  const userId = crypto.randomUUID()
  await db.insert(identityUsers).values({ id: userId })
  await db.insert(userCompanyMemberships).values({
    companyId: input.companyId,
    status: input.status,
    userId,
  })
  return userId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_invstatus_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
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
