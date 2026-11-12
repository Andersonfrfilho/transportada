/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 290 — o quadro de mensagens enviadas contra Postgres. O que só o banco prova: as três consultas rodam nas tabelas
 * migradas, a fila (`queued`) não conta, falha conta à parte e uma empresa não enxerga o volume da outra.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { runNotificationSchemaMigrations } from '../../src/database/notification-migration.service.js'
import { companies, identityUsers } from '../../src/database/database.schema.js'
import { createSentMessagesUseCase } from '../../src/operations/application/sent-messages.use-case.js'
import { createDrizzleSentMessagesSources } from '../../src/operations/infrastructure/drizzle-sent-messages.sources.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_290_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${name}"`)
    await runDatabaseMigrations({ connectionString: url.toString() })
    await runNotificationSchemaMigrations({ connectionString: url.toString() })
    shared = { database: createDrizzleProvider({ connection: url.toString() }), name }
  } finally {
    await admin.close({ timeout: 0 })
  }
}, 90_000)

afterAll(async () => {
  if (databaseUrl === undefined || shared === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    await shared.database.close()
    await admin.unsafe(`drop database if exists "${shared.name}" with (force)`)
  } finally {
    await admin.close({ timeout: 0 })
  }
})

async function seedCompany(database: TestDatabase) {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  return { companyId, userId }
}

async function seedClientConversation(database: TestDatabase, companyId: string) {
  const conversationId = crypto.randomUUID()
  await database.db.execute(
    sql`insert into occurrence_conversations (id, company_id, occurrence_kind, occurrence_id, participant, client_tax_id)
        values (${conversationId}::uuid, ${companyId}::uuid, 'document', ${crypto.randomUUID()}::uuid, 'client', '12345678000199')`,
  )
  for (const [channel, status] of [
    ['whatsapp', 'sent'],
    ['whatsapp', 'failed'],
    ['email', 'delivered'],
    ['email', 'queued'],
  ] as const) {
    await database.db.execute(
      sql`insert into occurrence_conversation_messages (company_id, conversation_id, channel, direction, status, automatic)
          values (${companyId}::uuid, ${conversationId}::uuid, ${channel}, 'outbound', ${status}, true)`,
    )
  }
}

async function seedNotifications(database: TestDatabase, companyId: string, userId: string) {
  const notificationId = crypto.randomUUID()
  await database.db.execute(
    sql`insert into notification.notifications (id, company_id, recipient_user_id, category, template_key, title, body)
        values (${notificationId}::uuid, ${companyId}::uuid, ${userId}::uuid, 'driver', 'driver.alert', 't', 'b')`,
  )
  for (const [channel, status] of [
    ['whatsapp', 'sent'],
    ['email', 'failed'],
    ['push', 'queued'],
  ] as const) {
    await database.db.execute(
      sql`insert into notification.deliveries (notification_id, company_id, channel, status, sent_at)
          values (${notificationId}::uuid, ${companyId}::uuid, ${channel}, ${status}, now())`,
    )
  }
}

function useCaseFor(database: TestDatabase) {
  return createSentMessagesUseCase({
    now: () => new Date(),
    sources: createDrizzleSentMessagesSources(database.db),
  })
}

function contextOf(companyId: string, userId: string) {
  return { companyId, permissions: new Set(['operations.read']), userId }
}

describe('o quadro de mensagens enviadas contra Postgres (spec 290)', () => {
  testWithPostgres(
    'conta conversas e notificações, deixa a fila de fora e separa a falha',
    async () => {
      if (shared === undefined) return
      const { database } = shared
      const { companyId, userId } = await seedCompany(database)
      await seedClientConversation(database, companyId)
      await seedNotifications(database, companyId, userId)

      const result = await useCaseFor(database).read({ context: contextOf(companyId, userId) })

      expect(result.unavailable).toEqual([])
      expect(result.total).toEqual({ failed: 2, sent: 3, total: 5 })
      expect(result.byCategory.map((entry) => [entry.category, entry.total])).toEqual([
        ['occurrence', 3],
        ['notification', 2],
      ])
      const whatsapp = result.byChannel.find((entry) => entry.channel === 'whatsapp')
      expect(whatsapp).toEqual({ channel: 'whatsapp', failed: 1, sent: 2, total: 3 })
      const clientRow = result.bySubcategory.find(
        (entry) => entry.category === 'occurrence' && entry.channel === 'whatsapp',
      )
      expect(clientRow).toMatchObject({ audience: 'client', subcategory: 'sem_tipo', total: 2 })
    },
  )

  testWithPostgres('uma empresa não enxerga o volume da outra', async () => {
    if (shared === undefined) return
    const { database } = shared
    const first = await seedCompany(database)
    const second = await seedCompany(database)
    await seedClientConversation(database, first.companyId)

    const result = await useCaseFor(database).read({
      context: contextOf(second.companyId, second.userId),
    })

    expect(result.unavailable).toEqual([])
    expect(result.total.total).toBe(0)
  })
})
