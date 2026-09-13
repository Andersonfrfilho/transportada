/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T009: a mesma transação cria (ou reaproveita) a conversa `setup_test`, a mensagem
 * `queued` e o evento em `contractor_mail_outbox` — só um Postgres de verdade confere que os três
 * nascem juntos e que um segundo clique gira o token sem duplicar a conversa.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { DrizzleContractorMailRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  contractorMailMessages,
  contractorMailOutbox,
  contractorMailThreads,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describe('contractor mail test email thread integration (spec 143, T009)', () => {
  testWithPostgres(
    'creates the setup_test thread, the queued message and the outbox event together',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, userId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)

        const result = await repository.openTestEmailThread({
          actorUserId: userId,
          bodyText: 'Este é um e-mail de teste.',
          companyId,
          correlationId: 'contractor-mail-test-email-0001',
          fromAddress: 'ocorrencias@fernandes-transportadora.com.br',
          replyToAddress: 'abcdefghijklmnopqrstuvwxyz@resposta.fernandes-transportadora.com.br',
          replyTokenHash: 'a'.repeat(64),
          toAddress: 'admin@fernandes-transportadora.com.br',
        })

        const [thread] = await database.db
          .select()
          .from(contractorMailThreads)
          .where(eq(contractorMailThreads.id, result.threadId))
        expect(thread?.companyId).toBe(companyId)
        expect(thread?.contractorId).toBeNull()
        expect(thread?.subjectType).toBe('setup_test')
        expect(thread?.subjectId).toBe(companyId)
        expect(thread?.replyTokenHash).toBe('a'.repeat(64))

        const messages = await database.db
          .select()
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.threadId, result.threadId))
        expect(messages).toHaveLength(1)
        expect(messages[0]?.direction).toBe('outbound')
        expect(messages[0]?.deliveryStatus).toBe('queued')
        expect(messages[0]?.actorUserId).toBe(userId)
        expect(messages[0]?.fromAddress).toBe('ocorrencias@fernandes-transportadora.com.br')

        const outboxRows = await database.db
          .select()
          .from(contractorMailOutbox)
          .where(eq(contractorMailOutbox.companyId, companyId))
        expect(outboxRows).toHaveLength(1)
        expect(outboxRows[0]?.messageId).toBe(messages[0]?.id)
        expect(outboxRows[0]?.eventType).toBe('message.send.requested')
        expect(outboxRows[0]?.payload).toEqual({
          replyToAddress: 'abcdefghijklmnopqrstuvwxyz@resposta.fernandes-transportadora.com.br',
          toAddress: 'admin@fernandes-transportadora.com.br',
        })
      })
    },
    30_000,
  )

  testWithPostgres(
    'a second test email reuses the same thread, rotates the token and queues a new message',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, userId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)

        const first = await repository.openTestEmailThread({
          actorUserId: userId,
          bodyText: 'Primeiro teste.',
          companyId,
          correlationId: 'contractor-mail-test-email-0002',
          fromAddress: 'ocorrencias@fernandes-transportadora.com.br',
          replyToAddress: 'first-token@resposta.fernandes-transportadora.com.br',
          replyTokenHash: 'b'.repeat(64),
          toAddress: 'admin@fernandes-transportadora.com.br',
        })

        const second = await repository.openTestEmailThread({
          actorUserId: userId,
          bodyText: 'Segundo teste.',
          companyId,
          correlationId: 'contractor-mail-test-email-0003',
          fromAddress: 'ocorrencias@fernandes-transportadora.com.br',
          replyToAddress: 'second-token@resposta.fernandes-transportadora.com.br',
          replyTokenHash: 'c'.repeat(64),
          toAddress: 'admin@fernandes-transportadora.com.br',
        })

        expect(second.threadId).toBe(first.threadId)

        const [thread] = await database.db
          .select()
          .from(contractorMailThreads)
          .where(eq(contractorMailThreads.id, first.threadId))
        expect(thread?.replyTokenHash).toBe('c'.repeat(64))

        const messages = await database.db
          .select()
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.threadId, first.threadId))
        expect(messages).toHaveLength(2)

        const outboxRows = await database.db
          .select()
          .from(contractorMailOutbox)
          .where(eq(contractorMailOutbox.companyId, companyId))
        expect(outboxRows).toHaveLength(2)
      })
    },
    30_000,
  )

  testWithPostgres(
    'keeps the setup_test thread isolated per company',
    async () => {
      await withDisposableDatabase(async (database) => {
        const first = await seedTenant(database)
        const second = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)

        await repository.openTestEmailThread({
          actorUserId: first.userId,
          bodyText: 'Teste da primeira empresa.',
          companyId: first.companyId,
          correlationId: 'contractor-mail-test-email-tenant-a',
          fromAddress: 'ocorrencias@fernandes-transportadora.com.br',
          replyToAddress: 'token-a@resposta.fernandes-transportadora.com.br',
          replyTokenHash: 'd'.repeat(64),
          toAddress: 'admin-a@fernandes-transportadora.com.br',
        })

        const secondThreads = await database.db
          .select()
          .from(contractorMailThreads)
          .where(eq(contractorMailThreads.companyId, second.companyId))
        expect(secondThreads).toHaveLength(0)
      })
    },
    30_000,
  )
})

async function seedTenant(
  database: TestDatabase,
): Promise<{ readonly companyId: string; readonly userId: string }> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  return { companyId, userId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_cmail_te_${crypto.randomUUID().replaceAll('-', '')}`
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
