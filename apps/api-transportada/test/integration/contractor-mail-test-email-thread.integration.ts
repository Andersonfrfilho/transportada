/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Correção pós-entrega da T009 (spec 143): `reserveSetupTestThread` (a corrida de criação da
 * conversa) e `recordTestEmailMessage` (mensagem `queued` + evento no outbox) só se provam contra
 * um Postgres de verdade — `ON CONFLICT DO NOTHING` + `SELECT` de desempate na mesma transação, e o
 * `unique(company_id, subject_type, subject_id)` que os dois se apoiam.
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

describe('contractor mail test email thread integration (spec 143, T009 — correção pós-entrega)', () => {
  testWithPostgres(
    'reserves the setup_test thread with the candidate id and hash when none exists yet',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)
        const candidateThreadId = crypto.randomUUID()
        const candidateReplyTokenHash = 'a'.repeat(64)

        const result = await repository.reserveSetupTestThread({
          candidateReplyTokenHash,
          candidateThreadId,
          companyId,
        })

        expect(result.threadId).toBe(candidateThreadId)
        const [thread] = await database.db
          .select()
          .from(contractorMailThreads)
          .where(eq(contractorMailThreads.id, candidateThreadId))
        expect(thread?.companyId).toBe(companyId)
        expect(thread?.contractorId).toBeNull()
        expect(thread?.subjectType).toBe('setup_test')
        expect(thread?.subjectId).toBe(companyId)
        expect(thread?.replyTokenHash).toBe(candidateReplyTokenHash)
      })
    },
    30_000,
  )

  /** RF7: a segunda tentativa nunca sobrepõe a conversa existente — devolve o threadId dela. */
  testWithPostgres(
    'a second reservation for the same company returns the existing threadId, hash untouched',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)

        const first = await repository.reserveSetupTestThread({
          candidateReplyTokenHash: 'b'.repeat(64),
          candidateThreadId: crypto.randomUUID(),
          companyId,
        })
        const second = await repository.reserveSetupTestThread({
          candidateReplyTokenHash: 'c'.repeat(64),
          candidateThreadId: crypto.randomUUID(),
          companyId,
        })

        expect(second.threadId).toBe(first.threadId)
        const [thread] = await database.db
          .select({ replyTokenHash: contractorMailThreads.replyTokenHash })
          .from(contractorMailThreads)
          .where(eq(contractorMailThreads.id, first.threadId))
        expect(thread?.replyTokenHash).toBe('b'.repeat(64))

        const threadCount = await database.db
          .select({ id: contractorMailThreads.id })
          .from(contractorMailThreads)
          .where(eq(contractorMailThreads.companyId, companyId))
        expect(threadCount).toHaveLength(1)
      })
    },
    30_000,
  )

  testWithPostgres(
    'keeps the setup_test thread reservation isolated per company',
    async () => {
      await withDisposableDatabase(async (database) => {
        const first = await seedTenant(database)
        const second = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)

        await repository.reserveSetupTestThread({
          candidateReplyTokenHash: 'd'.repeat(64),
          candidateThreadId: crypto.randomUUID(),
          companyId: first.companyId,
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

  testWithPostgres(
    'records the message and the outbox event together, with a payload carrying only the reference',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, userId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)
        const { threadId } = await repository.reserveSetupTestThread({
          candidateReplyTokenHash: 'e'.repeat(64),
          candidateThreadId: crypto.randomUUID(),
          companyId,
        })

        const result = await repository.recordTestEmailMessage({
          actorUserId: userId,
          bodyText: 'Este é um e-mail de teste.',
          companyId,
          correlationId: 'contractor-mail-test-email-0001',
          fromAddress: 'ocorrencias@fernandes-transportadora.com.br',
          subject: 'Teste de configuração de e-mail com contratantes',
          threadId,
          toAddresses: ['admin@fernandes-transportadora.com.br'],
        })

        expect(result.threadId).toBe(threadId)

        const messages = await database.db
          .select()
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.threadId, threadId))
        expect(messages).toHaveLength(1)
        expect(messages[0]?.direction).toBe('outbound')
        expect(messages[0]?.deliveryStatus).toBe('queued')
        expect(messages[0]?.actorUserId).toBe(userId)
        expect(messages[0]?.subject).toBe('Teste de configuração de e-mail com contratantes')
        expect(messages[0]?.toAddresses).toEqual(['admin@fernandes-transportadora.com.br'])

        const outboxRows = await database.db
          .select()
          .from(contractorMailOutbox)
          .where(eq(contractorMailOutbox.companyId, companyId))
        expect(outboxRows).toHaveLength(1)
        expect(outboxRows[0]?.messageId).toBe(messages[0]?.id)
        expect(outboxRows[0]?.eventType).toBe('message.send.requested')
        expect(outboxRows[0]?.payload).toEqual({})
      })
    },
    30_000,
  )

  testWithPostgres(
    'a second test email on the same thread queues a new message, one outbox row per message',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, userId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)
        const { threadId } = await repository.reserveSetupTestThread({
          candidateReplyTokenHash: 'f'.repeat(64),
          candidateThreadId: crypto.randomUUID(),
          companyId,
        })

        await repository.recordTestEmailMessage({
          actorUserId: userId,
          bodyText: 'Primeiro teste.',
          companyId,
          correlationId: 'contractor-mail-test-email-0002',
          fromAddress: 'ocorrencias@fernandes-transportadora.com.br',
          subject: 'Teste de configuração de e-mail com contratantes',
          threadId,
          toAddresses: ['admin@fernandes-transportadora.com.br'],
        })
        await repository.recordTestEmailMessage({
          actorUserId: userId,
          bodyText: 'Segundo teste.',
          companyId,
          correlationId: 'contractor-mail-test-email-0003',
          fromAddress: 'ocorrencias@fernandes-transportadora.com.br',
          subject: 'Teste de configuração de e-mail com contratantes',
          threadId,
          toAddresses: ['admin@fernandes-transportadora.com.br'],
        })

        const messages = await database.db
          .select()
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.threadId, threadId))
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
