/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Remover o vínculo de quem já foi convidado. `user_invitations` e `password_reset_requests` têm FK
 * `ON DELETE RESTRICT` para a membership — a hipótese da spec 191 (T0.2) era que o `DELETE` batia em
 * `23503` e virava 500, e o vermelho confirmou nas duas FKs (`evidence.md`).
 *
 * A T2.2 apaga o histórico (convites e pedidos de recuperação) na mesma transação do `DELETE`, com
 * trilha em `audit_logs` gravada **antes** das duas exclusões. Os três casos (a/b/c) provam a
 * remoção com histórico; o quarto prova que a remoção não vaza para o vínculo do mesmo usuário
 * numa empresa diferente.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
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
const CORRELATION_ID = 'corr-company-user-removal'

describe('remover vínculo com histórico de convite e de recuperação', () => {
  testWithPostgres('(a) convidado ainda não ativado: o vínculo sai', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const actorUserId = await seedMember(db, companyId)
      const userId = await seedMember(db, companyId)
      await seedInvitation(db, { accepted: false, companyId, userId })

      const failure = await captureDatabaseFailure(() =>
        new DrizzleCompanyUserRepository(db).removeMembership({
          actorUserId,
          companyId,
          correlationId: CORRELATION_ID,
          userId,
        }),
      )

      expect(failure).toBeUndefined()
      expect(await countMemberships(db, { companyId, userId })).toBe(0)
      expect(await countInvitations(db, { companyId, userId })).toBe(0)
    })
  })

  testWithPostgres('(b) ativado, com um pedido de recuperação: o vínculo sai', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const actorUserId = await seedMember(db, companyId)
      const userId = await seedMember(db, companyId)
      await seedInvitation(db, { accepted: true, companyId, userId })
      await seedPasswordResetRequest(db, { companyId, userId })

      const failure = await captureDatabaseFailure(() =>
        new DrizzleCompanyUserRepository(db).removeMembership({
          actorUserId,
          companyId,
          correlationId: CORRELATION_ID,
          userId,
        }),
      )

      expect(failure).toBeUndefined()
      expect(await countMemberships(db, { companyId, userId })).toBe(0)
      expect(await countInvitations(db, { companyId, userId })).toBe(0)
      expect(await countPasswordResetRequests(db, { companyId, userId })).toBe(0)

      /** A trilha grava as contagens do histórico apagado, e o `acceptedAt` do convite aceito. */
      const audit = await findMembershipRemovedAudit(db, { companyId, userId })
      expect(audit?.actorUserId).toBe(actorUserId)
      expect(audit?.metadata).toMatchObject({
        invitationAcceptedAt: EXPIRES_AT.toISOString(),
        invitationsDeleted: 1,
        passwordResetsDeleted: 1,
      })
    })
  })

  /**
   * No (b) a FK do convite barra antes e esconde a do pedido. O vínculo sem convite existe de
   * verdade (o primeiro administrador nasce sem convite), e isola a segunda FK.
   */
  testWithPostgres('(c) sem convite, com um pedido de recuperação: o vínculo sai', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const actorUserId = await seedMember(db, companyId)
      const userId = await seedMember(db, companyId)
      await seedPasswordResetRequest(db, { companyId, userId })

      const failure = await captureDatabaseFailure(() =>
        new DrizzleCompanyUserRepository(db).removeMembership({
          actorUserId,
          companyId,
          correlationId: CORRELATION_ID,
          userId,
        }),
      )

      expect(failure).toBeUndefined()
      expect(await countMemberships(db, { companyId, userId })).toBe(0)
      expect(await countPasswordResetRequests(db, { companyId, userId })).toBe(0)
    })
  })

  /**
   * Isolamento (aceite T2.2): convite e pedido do **mesmo** usuário, mas do vínculo com outra
   * empresa, sobrevivem — as duas tabelas são chaveadas por `(company_id, user_id)`, nunca só por
   * `user_id`. Um `DELETE` recortado incorretamente apagaria histórico de empresa nenhuma tem nada
   * a ver com a remoção pedida.
   */
  testWithPostgres(
    '(d) convite e pedido do mesmo usuário em outra empresa ficam intactos',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const otherCompanyId = await seedCompany(db)
        const actorUserId = await seedMember(db, companyId)
        const userId = await seedMember(db, companyId)
        await db.insert(userCompanyMemberships).values({
          companyId: otherCompanyId,
          status: 'active',
          userId,
        })
        await seedInvitation(db, { accepted: false, companyId, userId })
        await seedInvitation(db, { accepted: false, companyId: otherCompanyId, userId })
        await seedPasswordResetRequest(db, { companyId: otherCompanyId, userId })

        const failure = await captureDatabaseFailure(() =>
          new DrizzleCompanyUserRepository(db).removeMembership({
            actorUserId,
            companyId,
            correlationId: CORRELATION_ID,
            userId,
          }),
        )

        expect(failure).toBeUndefined()
        expect(await countMemberships(db, { companyId, userId })).toBe(0)
        expect(await countInvitations(db, { companyId, userId })).toBe(0)
        expect(await countMemberships(db, { companyId: otherCompanyId, userId })).toBe(1)
        expect(await countInvitations(db, { companyId: otherCompanyId, userId })).toBe(1)
        expect(await countPasswordResetRequests(db, { companyId: otherCompanyId, userId })).toBe(1)
      })
    },
  )
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

async function countInvitations(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly userId: string },
): Promise<number> {
  const rows = await db
    .select({ id: userInvitations.id })
    .from(userInvitations)
    .where(
      and(eq(userInvitations.companyId, input.companyId), eq(userInvitations.userId, input.userId)),
    )
  return rows.length
}

async function countPasswordResetRequests(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly userId: string },
): Promise<number> {
  const rows = await db
    .select({ id: passwordResetRequests.id })
    .from(passwordResetRequests)
    .where(
      and(
        eq(passwordResetRequests.companyId, input.companyId),
        eq(passwordResetRequests.userId, input.userId),
      ),
    )
  return rows.length
}

async function findMembershipRemovedAudit(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly userId: string },
): Promise<{ readonly actorUserId: string; readonly metadata: unknown } | undefined> {
  const [row] = await db
    .select({ actorUserId: auditLogs.actorUserId, metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, 'company-user.membership-removed'),
        eq(auditLogs.companyId, input.companyId),
        eq(auditLogs.entityId, input.userId),
      ),
    )
    .limit(1)
  return row
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
