/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T401, contra Postgres real: os CHECKs e as FKs compostas das tabelas da conversa recusam
 * o que a política também recusa — a conversa amarrada à contratante de outra empresa, a mensagem
 * enviada sem operador, a recebida com dois autores, o e-mail "lido" e o portal "na fila".
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  contractors,
  identityUsers,
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../src/database/database.schema.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function seedCompany(database: TestDatabase) {
  const companyId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(contractors).values({
    companyId,
    displayName: 'Contratante Sintética',
    id: contractorId,
    taxId: '30290856000160',
  })
  return { companyId, contractorId, userId }
}

async function rejectedBy(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation()
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
    return cause instanceof Error ? cause.message : String(cause)
  }
  throw new Error('EXPECTED_REJECTION')
}

function publicRef(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

describe('as tabelas da conversa contra Postgres (spec 183 T401)', () => {
  testWithPostgres(
    'a conversa só amarra contratante da mesma empresa, e cada participante tem a sua forma',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const other = await seedCompany(database)
        const base = {
          companyId: company.companyId,
          occurrenceId: crypto.randomUUID(),
          occurrenceKind: 'document' as const,
        }

        expect(
          await rejectedBy(() =>
            database.db.insert(occurrenceConversations).values({
              ...base,
              contractorId: other.contractorId,
              participant: 'contractor',
              publicRef: publicRef(),
            }),
          ),
        ).toContain('occurrence_conversations_contractor_fk')
        expect(
          await rejectedBy(() =>
            database.db.insert(occurrenceConversations).values({
              ...base,
              contractorId: company.contractorId,
              participant: 'contractor',
            }),
          ),
        ).toContain('occurrence_conversations_participant_shape_check')
        expect(
          await rejectedBy(() =>
            database.db.insert(occurrenceConversations).values({
              ...base,
              driverUserId: company.userId,
              participant: 'driver',
              publicRef: publicRef(),
            }),
          ),
        ).toContain('occurrence_conversations_participant_shape_check')

        await database.db.insert(occurrenceConversations).values({
          ...base,
          contractorId: company.contractorId,
          participant: 'contractor',
          publicRef: publicRef(),
        })
        expect(
          await rejectedBy(() =>
            database.db.insert(occurrenceConversations).values({
              ...base,
              contractorId: company.contractorId,
              participant: 'contractor',
              publicRef: publicRef(),
            }),
          ),
        ).toContain('occurrence_conversations_occurrence_participant_unique')
      })
    },
    30_000,
  )

  testWithPostgres(
    'autor e status da mensagem seguem a direção e o que o canal confirma',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const conversationId = crypto.randomUUID()
        await database.db.insert(occurrenceConversations).values({
          companyId: company.companyId,
          contractorId: company.contractorId,
          id: conversationId,
          occurrenceId: crypto.randomUUID(),
          occurrenceKind: 'stop',
          participant: 'contractor',
          publicRef: publicRef(),
        })
        const base = { companyId: company.companyId, conversationId }
        const insert = (values: Partial<typeof occurrenceConversationMessages.$inferInsert>) =>
          database.db.insert(occurrenceConversationMessages).values({
            channel: 'email',
            direction: 'outbound',
            ...base,
            ...values,
          })

        expect(await rejectedBy(() => insert({ status: 'queued' }))).toContain(
          'occurrence_conversation_messages_author_check',
        )
        expect(
          await rejectedBy(() => insert({ authorUserId: company.userId, status: 'read' })),
        ).toContain('occurrence_conversation_messages_email_never_read_check')
        expect(
          await rejectedBy(() =>
            insert({ authorUserId: company.userId, channel: 'portal', status: 'queued' }),
          ),
        ).toContain('occurrence_conversation_messages_portal_status_check')
        expect(await rejectedBy(() => insert({ authorUserId: company.userId }))).toContain(
          'occurrence_conversation_messages_status_direction_check',
        )
        expect(
          await rejectedBy(() =>
            insert({
              direction: 'inbound',
              driverUserId: company.userId,
              senderAddress: 'contato@example.test',
            }),
          ),
        ).toContain('occurrence_conversation_messages_author_check')
        expect(
          await rejectedBy(() =>
            insert({ authorUserId: company.userId, channel: 'email', direction: 'inbound' }),
          ),
        ).toContain('occurrence_conversation_messages_author_check')

        await insert({ authorUserId: company.userId, status: 'queued' })
        await insert({ direction: 'inbound', senderAddress: 'contato@example.test' })
        await insert({ authorUserId: company.userId, channel: 'portal', direction: 'inbound' })
      })
    },
    30_000,
  )
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_occonv_${crypto.randomUUID().replaceAll('-', '')}`
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
