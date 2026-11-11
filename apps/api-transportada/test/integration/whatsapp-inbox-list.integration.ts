/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T5 contra Postgres de verdade: a lista da caixa (filtros, não lido, paginação por cursor, só da empresa), o
 * histórico paginado, marcar como lido e a trilha de auditoria de assumir e devolver.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createWhatsAppChatTakeoverService } from '../../src/whatsapp-inbox/application/whatsapp-chat-takeover.service.js'
import { createWhatsAppInboxUseCase } from '../../src/whatsapp-inbox/application/whatsapp-inbox.use-case.js'
import { createDrizzleWhatsAppChatRepository } from '../../src/whatsapp-inbox/infrastructure/drizzle-whatsapp-chat.repository.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>

const jid = (n: number) => `55169910000${String(n).padStart(2, '0')}@s.whatsapp.net`
const T0 = new Date('2026-11-10T22:00:00.000Z')
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

async function seed(database: TestDatabase) {
  const companyId = crypto.randomUUID()
  const foreignCompanyId = crypto.randomUUID()
  const ana = crypto.randomUUID()
  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: foreignCompanyId, status: 'active' },
  ])
  await database.db.insert(identityUsers).values([{ id: ana, status: 'active' }])
  await database.db
    .insert(userCompanyMemberships)
    .values([{ companyId, status: 'active', userId: ana }])
  const repository = createDrizzleWhatsAppChatRepository(database.db)
  const clock = { now: T0 }
  const takeover = createWhatsAppChatTakeoverService({ clock: () => clock.now, repository })
  const inbox = createWhatsAppInboxUseCase({ clock: () => clock.now, repository, takeover })
  return { ana, clock, companyId, foreignCompanyId, inbox, repository }
}

describe('caixa de conversas do WhatsApp, lista e histórico (spec 319 T5)', () => {
  testWithPostgres('a lista é da empresa, filtra e pagina por cursor', async () => {
    await withDisposableDatabase(async (database) => {
      const { ana, companyId, foreignCompanyId, inbox, repository } = await seed(database)
      const chats = []
      for (let n = 1; n <= 5; n += 1) {
        const chat = await repository.ensureChat({ chatJid: jid(n), companyId, kind: 'direct' })
        await repository.appendMessage({
          author: 'driver',
          bodyText: `oi ${n}`,
          chatId: chat.id,
          companyId,
          occurredAt: at(n * 10),
          providerMessageId: `P${n}`,
        })
        chats.push(chat)
      }
      const foreign = await repository.ensureChat({
        chatJid: jid(99),
        companyId: foreignCompanyId,
        kind: 'direct',
      })
      await repository.ensureChat({
        chatJid: '120363025246125486@g.us',
        companyId,
        kind: 'group',
      })
      await inbox.takeOver({
        chatId: chats[0]?.id ?? '',
        companyId,
        correlationId: 'c',
        userId: ana,
      })

      const first = await inbox.list({ companyId, kind: 'direct', limit: 2 })
      expect(first.items).toHaveLength(2)
      expect(first.nextCursor).not.toBeNull()
      const second = await inbox.list({
        companyId,
        cursor: first.nextCursor,
        kind: 'direct',
        limit: 2,
      })
      const third = await inbox.list({
        companyId,
        cursor: second.nextCursor,
        kind: 'direct',
        limit: 2,
      })
      const ids = [...first.items, ...second.items, ...third.items].map((chat) => chat.id)
      expect(new Set(ids).size).toBe(5)
      expect(ids).not.toContain(foreign.id)
      expect(third.nextCursor).toBeNull()

      const taken = await inbox.list({ companyId, limit: 10, state: 'operator' })
      expect(taken.items.map((chat) => chat.id)).toEqual([chats[0]?.id ?? ''])
      const groups = await inbox.list({ companyId, kind: 'group', limit: 10 })
      expect(groups.items).toHaveLength(1)
    })
  })

  testWithPostgres('não lido some ao marcar como lido e volta com mensagem nova', async () => {
    await withDisposableDatabase(async (database) => {
      const { clock, companyId, inbox, repository } = await seed(database)
      const chat = await repository.ensureChat({ chatJid: jid(1), companyId, kind: 'direct' })
      await repository.appendMessage({
        author: 'driver',
        bodyText: 'oi',
        chatId: chat.id,
        companyId,
        occurredAt: at(5),
        providerMessageId: 'P1',
      })
      expect((await inbox.list({ companyId, limit: 10, unreadOnly: true })).items).toHaveLength(1)

      clock.now = at(60)
      await inbox.markRead({ chatId: chat.id, companyId })
      expect((await inbox.list({ companyId, limit: 10, unreadOnly: true })).items).toHaveLength(0)

      await repository.appendMessage({
        author: 'driver',
        bodyText: 'de novo',
        chatId: chat.id,
        companyId,
        occurredAt: at(120),
        providerMessageId: 'P2',
      })
      expect((await inbox.list({ companyId, limit: 10, unreadOnly: true })).items).toHaveLength(1)
    })
  })

  testWithPostgres('o histórico pagina do mais novo ao mais antigo e é da empresa', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, foreignCompanyId, inbox, repository } = await seed(database)
      const chat = await repository.ensureChat({ chatJid: jid(1), companyId, kind: 'direct' })
      for (let n = 1; n <= 3; n += 1) {
        await repository.appendMessage({
          author: 'driver',
          bodyText: `m${n}`,
          chatId: chat.id,
          companyId,
          occurredAt: at(n),
          providerMessageId: `M${n}`,
        })
      }
      const page1 = await inbox.messages({ chatId: chat.id, companyId, limit: 2 })
      expect(page1.items.map((message) => message.bodyText)).toEqual(['m3', 'm2'])
      const page2 = await inbox.messages({
        chatId: chat.id,
        companyId,
        cursor: page1.nextCursor,
        limit: 2,
      })
      expect(page2.items.map((message) => message.bodyText)).toEqual(['m1'])
      expect(page2.nextCursor).toBeNull()

      let refused = false
      try {
        await inbox.messages({ chatId: chat.id, companyId: foreignCompanyId, limit: 2 })
      } catch {
        refused = true
      }
      expect(refused).toBe(true)
    })
  })

  testWithPostgres('assumir e devolver gravam a trilha de auditoria da empresa', async () => {
    await withDisposableDatabase(async (database) => {
      const { ana, clock, companyId, inbox, repository } = await seed(database)
      const chat = await repository.ensureChat({ chatJid: jid(1), companyId, kind: 'direct' })
      await inbox.takeOver({ chatId: chat.id, companyId, correlationId: 'c1', userId: ana })
      // Renovar é um segundo toque do mesmo atendente num instante posterior (o relógio da T2 decide "renovou").
      clock.now = at(30)
      await inbox.takeOver({ chatId: chat.id, companyId, correlationId: 'c2', userId: ana })
      await inbox.release({ chatId: chat.id, companyId, correlationId: 'c3', userId: ana })
      await inbox.release({ chatId: chat.id, companyId, correlationId: 'c4', userId: ana })

      const rows = await database.db
        .select({ action: auditLogs.action, actor: auditLogs.actorUserId })
        .from(auditLogs)
        .where(eq(auditLogs.companyId, companyId))
      expect(rows.map((row) => row.action).sort()).toEqual([
        'whatsapp_chat.released',
        'whatsapp_chat.taken_over',
      ])
      expect(rows.every((row) => row.actor === ana)).toBe(true)
    })
  })
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_t319d',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 5, max: 4, queryTimeoutMs: 10_000 },
        url: connectionString,
      }),
    operation,
  })
}
