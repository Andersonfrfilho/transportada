/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T2: o estado e o histórico do chat do WhatsApp contra Postgres de verdade — assumir atômico entre dois
 * atendentes (também ao mesmo tempo), renovar, devolver, vencer em lote, o histórico deduplicado pelo id do provedor,
 * o status que só avança, os CHECKs (sem `@lid`, assumido com dono) e o isolamento por empresa.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  userCompanyMemberships,
  whatsappChatMessages,
  whatsappChats,
  whatsappEvolutionSettings,
} from '../../src/database/database.schema.js'
import { createWhatsAppChatTakeoverService } from '../../src/whatsapp-inbox/application/whatsapp-chat-takeover.service.js'
import { createDrizzleWhatsAppChatRepository } from '../../src/whatsapp-inbox/infrastructure/drizzle-whatsapp-chat.repository.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>

const GROUP = '120363025246125486@g.us'
const DIRECT = '5516991234567@s.whatsapp.net'
const T0 = new Date('2026-11-10T22:00:00.000Z')
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

async function seed(database: TestDatabase) {
  const companyId = crypto.randomUUID()
  const foreignCompanyId = crypto.randomUUID()
  const ana = crypto.randomUUID()
  const bia = crypto.randomUUID()
  const outsider = crypto.randomUUID()
  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: foreignCompanyId, status: 'active' },
  ])
  await database.db.insert(identityUsers).values([
    { id: ana, status: 'active' },
    { id: bia, status: 'active' },
    { id: outsider, status: 'active' },
  ])
  await database.db.insert(userCompanyMemberships).values([
    { companyId, status: 'active', userId: ana },
    { companyId, status: 'active', userId: bia },
    { companyId: foreignCompanyId, status: 'active', userId: outsider },
  ])
  const repository = createDrizzleWhatsAppChatRepository(database.db)
  const group = await repository.ensureChat({ chatJid: GROUP, companyId, kind: 'group' })
  return { ana, bia, companyId, foreignCompanyId, group, outsider, repository }
}

describe('chat do WhatsApp, repositório (spec 319 T2)', () => {
  testWithPostgres('criar o chat é idempotente, também ao mesmo tempo', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, group, repository } = await seed(database)
      const again = await Promise.all([
        repository.ensureChat({ chatJid: GROUP, companyId, kind: 'group' }),
        repository.ensureChat({ chatJid: GROUP, companyId, kind: 'group' }),
      ])
      expect(again.map((chat) => chat.id)).toEqual([group.id, group.id])
      expect(group).toMatchObject({ kind: 'group', state: 'bot', takenOverByUserId: null })
    })
  })

  testWithPostgres(
    'dois atendentes assumindo ao mesmo tempo: um assume, o outro recebe quem segura',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { ana, bia, companyId, group, repository } = await seed(database)
        const key = { chatId: group.id, companyId, expiresAt: at(1800), now: T0 }
        const results = await Promise.all([
          repository.takeOver({ ...key, userId: ana }),
          repository.takeOver({ ...key, userId: bia }),
        ])
        const winners = results.filter((result) => result.outcome === 'taken')
        const held = results.filter((result) => result.outcome === 'held')
        expect(winners).toHaveLength(1)
        expect(held).toHaveLength(1)
        const winner = winners[0]
        if (winner?.outcome !== 'taken') throw new Error('no winner')
        expect(held[0]).toEqual({
          expiresAt: at(1800),
          holderUserId: winner.chat.takenOverByUserId as string,
          outcome: 'held',
        })
      })
    },
  )

  testWithPostgres('o próprio renova sem trocar o início; vencido, outro assume', async () => {
    await withDisposableDatabase(async (database) => {
      const { ana, bia, companyId, group, repository } = await seed(database)
      const key = { chatId: group.id, companyId }
      await repository.takeOver({ ...key, expiresAt: at(1800), now: T0, userId: ana })
      const renewed = await repository.takeOver({
        ...key,
        expiresAt: at(1860),
        now: at(60),
        userId: ana,
      })
      expect(renewed).toMatchObject({ outcome: 'renewed' })
      if (renewed.outcome !== 'renewed') throw new Error('not renewed')
      expect(renewed.chat.takenOverAt).toEqual(T0)
      expect(renewed.chat.expiresAt).toEqual(at(1860))

      expect(
        (await repository.takeOver({ ...key, expiresAt: at(3600), now: at(1859), userId: bia }))
          .outcome,
      ).toBe('held')
      const taken = await repository.takeOver({
        ...key,
        expiresAt: at(3660),
        now: at(1860),
        userId: bia,
      })
      expect(taken).toMatchObject({ outcome: 'taken' })
      if (taken.outcome !== 'taken') throw new Error('not taken')
      expect(taken.chat).toMatchObject({ takenOverAt: at(1860), takenOverByUserId: bia })
    })
  })

  testWithPostgres('estender só vale para quem segura e antes de vencer', async () => {
    await withDisposableDatabase(async (database) => {
      const { ana, bia, companyId, group, repository } = await seed(database)
      const key = { chatId: group.id, companyId }
      await repository.takeOver({ ...key, expiresAt: at(1800), now: T0, userId: ana })
      expect(
        await repository.extendTakeover({ ...key, expiresAt: at(2400), now: at(600), userId: bia }),
      ).toBeNull()
      expect(
        (
          await repository.extendTakeover({
            ...key,
            expiresAt: at(2400),
            now: at(600),
            userId: ana,
          })
        )?.expiresAt,
      ).toEqual(at(2400))
      expect(
        await repository.extendTakeover({
          ...key,
          expiresAt: at(4800),
          now: at(2400),
          userId: ana,
        }),
      ).toBeNull()
    })
  })

  testWithPostgres('devolver grava quem e por quê; devolver com o bot não muda nada', async () => {
    await withDisposableDatabase(async (database) => {
      const { ana, bia, companyId, group, repository } = await seed(database)
      const key = { chatId: group.id, companyId }
      await repository.takeOver({ ...key, expiresAt: at(1800), now: T0, userId: ana })
      const released = await repository.release({ ...key, now: at(60), userId: bia })
      expect(released).toMatchObject({
        chat: {
          expiresAt: null,
          releaseReason: 'manual',
          releasedAt: at(60),
          releasedByUserId: bia,
          state: 'bot',
          takenOverAt: null,
          takenOverByUserId: null,
        },
        outcome: 'released',
      })
      expect((await repository.release({ ...key, now: at(120), userId: ana })).outcome).toBe(
        'already_bot',
      )
      const retaken = await repository.takeOver({
        ...key,
        expiresAt: at(1900),
        now: at(100),
        userId: ana,
      })
      if (retaken.outcome !== 'taken') throw new Error('not taken')
      expect(retaken.chat).toMatchObject({ releaseReason: null, releasedAt: null })
    })
  })

  testWithPostgres('o vencimento devolve em lote, uma vez, e diz quem segurava', async () => {
    await withDisposableDatabase(async (database) => {
      const { ana, bia, companyId, group, repository } = await seed(database)
      const direct = await repository.ensureChat({ chatJid: DIRECT, companyId, kind: 'direct' })
      await repository.takeOver({
        chatId: group.id,
        companyId,
        expiresAt: at(600),
        now: T0,
        userId: ana,
      })
      await repository.takeOver({
        chatId: direct.id,
        companyId,
        expiresAt: at(3600),
        now: T0,
        userId: bia,
      })
      expect(await repository.expireDue({ limit: 10, now: at(600) })).toEqual([
        { chatId: group.id, companyId, userId: ana },
      ])
      expect(await repository.expireDue({ limit: 10, now: at(600) })).toEqual([])
      expect(await repository.findChat({ chatId: group.id, companyId })).toMatchObject({
        releaseReason: 'expired',
        releasedAt: at(600),
        releasedByUserId: null,
        state: 'bot',
      })
      expect(await repository.findChat({ chatId: direct.id, companyId })).toMatchObject({
        state: 'operator',
        takenOverByUserId: bia,
      })
    })
  })

  testWithPostgres('o histórico deduplica pelo id do provedor e move o chat na lista', async () => {
    await withDisposableDatabase(async (database) => {
      const { ana, companyId, group, repository } = await seed(database)
      const inbound = await repository.appendMessage({
        author: 'driver',
        bodyText: 'oi',
        chatId: group.id,
        companyId,
        occurredAt: at(10),
        providerMessageId: 'AC37A',
        senderPhone: '5516991234567',
      })
      expect(inbound).toMatchObject({
        message: { direction: 'inbound', status: null },
        outcome: 'inserted',
      })
      const echo = await repository.appendMessage({
        author: 'driver',
        bodyText: 'oi de novo',
        chatId: group.id,
        companyId,
        providerMessageId: 'AC37A',
      })
      expect(echo).toEqual({ message: inbound.message, outcome: 'duplicate' })

      const queued = await repository.appendMessage({
        author: 'operator',
        authorUserId: ana,
        bodyText: 'Bom dia, aqui é a Ana.',
        chatId: group.id,
        companyId,
        occurredAt: at(20),
      })
      expect(queued.message).toMatchObject({
        direction: 'outbound',
        providerMessageId: null,
        status: 'queued',
      })
      const chat = await repository.findChat({ chatId: group.id, companyId })
      expect(chat).toMatchObject({ lastInboundAt: at(10), lastMessageAt: at(20) })
      const rows = await database.db
        .select({ id: whatsappChatMessages.id })
        .from(whatsappChatMessages)
        .where(eq(whatsappChatMessages.chatId, group.id))
      expect(rows).toHaveLength(2)
    })
  })

  testWithPostgres(
    'o status só avança; a falha guarda o motivo e o reenvio volta a `queued`',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { ana, companyId, group, repository } = await seed(database)
        const { message } = await repository.appendMessage({
          author: 'operator',
          authorUserId: ana,
          bodyText: 'Pode mandar a foto?',
          chatId: group.id,
          companyId,
        })
        const failed = await repository.updateMessageStatus({
          companyId,
          failureReason: 'disconnected',
          messageId: message.id,
          status: 'failed',
        })
        expect(failed).toMatchObject({ failureReason: 'disconnected', status: 'failed' })
        expect(
          await repository.updateMessageStatus({
            companyId,
            messageId: message.id,
            status: 'sent',
          }),
        ).toBeNull()
        expect(
          await repository.updateMessageStatus({
            companyId,
            messageId: message.id,
            status: 'queued',
          }),
        ).toMatchObject({ failureReason: null, status: 'queued' })
        expect(
          await repository.updateMessageStatus({
            companyId,
            messageId: message.id,
            providerMessageId: '3EB0ABC',
            status: 'sent',
          }),
        ).toMatchObject({ providerMessageId: '3EB0ABC', status: 'sent' })
        expect(
          await repository.updateMessageStatus({
            companyId,
            providerMessageId: '3EB0ABC',
            status: 'read',
          }),
        ).toMatchObject({ status: 'read' })
        expect(
          await repository.updateMessageStatus({
            companyId,
            providerMessageId: '3EB0ABC',
            status: 'delivered',
          }),
        ).toBeNull()
      })
    },
  )

  testWithPostgres('outra empresa não vê, não assume, não devolve e não muda status', async () => {
    await withDisposableDatabase(async (database) => {
      const { ana, companyId, foreignCompanyId, group, outsider, repository } = await seed(database)
      await repository.takeOver({
        chatId: group.id,
        companyId,
        expiresAt: at(1800),
        now: T0,
        userId: ana,
      })
      const { message } = await repository.appendMessage({
        author: 'bot',
        bodyText: 'Qual nota?',
        chatId: group.id,
        companyId,
        providerMessageId: '3EB0BOT',
      })
      const foreign = { chatId: group.id, companyId: foreignCompanyId }
      expect(await repository.findChat(foreign)).toBeNull()
      expect(
        await repository.findChatByJid({ chatJid: GROUP, companyId: foreignCompanyId }),
      ).toBeNull()
      expect(
        (
          await repository.takeOver({
            ...foreign,
            expiresAt: at(1800),
            now: T0,
            userId: outsider,
          })
        ).outcome,
      ).toBe('not_found')
      expect((await repository.release({ ...foreign, now: T0, userId: outsider })).outcome).toBe(
        'not_found',
      )
      expect(
        await repository.updateMessageStatus({
          companyId: foreignCompanyId,
          messageId: message.id,
          status: 'read',
        }),
      ).toBeNull()
      // O mesmo JID na outra empresa é outro chat.
      const theirs = await repository.ensureChat({
        chatJid: GROUP,
        companyId: foreignCompanyId,
        kind: 'group',
      })
      expect(theirs.id).not.toBe(group.id)
      expect(theirs.state).toBe('bot')
    })
  })

  testWithPostgres(
    'os CHECKs recusam @lid, assumido sem dono, atendente de outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { ana, companyId, foreignCompanyId, group, outsider, repository } =
          await seed(database)
        await expect(
          repository.ensureChat({ chatJid: '123456789012345@lid', companyId, kind: 'direct' }),
        ).rejects.toThrow()
        await expect(
          repository.ensureChat({ chatJid: GROUP, companyId: foreignCompanyId, kind: 'direct' }),
        ).rejects.toThrow()
        expect(
          await refused(
            database.db
              .update(whatsappChats)
              .set({ state: 'operator' })
              .where(eq(whatsappChats.id, group.id)),
          ),
        ).toBe(true)
        await expect(
          repository.takeOver({
            chatId: group.id,
            companyId,
            expiresAt: at(1800),
            now: T0,
            userId: outsider,
          }),
        ).rejects.toThrow()
        await expect(
          repository.appendMessage({
            author: 'operator',
            bodyText: '',
            authorUserId: ana,
            chatId: group.id,
            companyId,
          }),
        ).rejects.toThrow()
        await expect(
          repository.appendMessage({
            author: 'operator',
            bodyText: 'oi',
            chatId: group.id,
            companyId,
          }),
        ).rejects.toThrow()
      })
    },
  )

  testWithPostgres('o prazo vem da empresa; sem Evolution, o serviço usa 30 min', async () => {
    await withDisposableDatabase(async (database) => {
      const { ana, companyId, group, repository } = await seed(database)
      const service = createWhatsAppChatTakeoverService({ clock: () => T0, repository })
      expect(await repository.findTakeoverTimeoutSeconds({ companyId })).toBeNull()
      expect(
        (await service.takeOver({ chatId: group.id, companyId, userId: ana })).chat.expiresAt,
      ).toEqual(at(1800))
      await service.release({ chatId: group.id, companyId, userId: ana })

      await database.db.insert(whatsappEvolutionSettings).values({
        baseUrl: 'https://evolution.example.com',
        chatTakeoverTimeoutSeconds: 600,
        companyId,
        instanceName: 'transportada',
        secretEnvelope: {},
      })
      expect(await repository.findTakeoverTimeoutSeconds({ companyId })).toBe(600)
      expect(
        (await service.takeOver({ chatId: group.id, companyId, userId: ana })).chat.expiresAt,
      ).toEqual(at(600))
      expect(await service.attendanceOf({ chatJid: GROUP, companyId })).toEqual({
        expiresAt: at(600),
        kind: 'operator',
        userId: ana,
      })
      expect(
        await refused(
          database.db
            .update(whatsappEvolutionSettings)
            .set({ chatTakeoverTimeoutSeconds: 60 })
            .where(eq(whatsappEvolutionSettings.companyId, companyId)),
        ),
      ).toBe(true)
    })
  })
})

/** O builder do Drizzle é thenable, não `Promise`: `expect(...).rejects` não o aceita. */
async function refused(work: PromiseLike<unknown>): Promise<boolean> {
  try {
    await work
    return false
  } catch {
    return true
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_t319c',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 5, max: 4, queryTimeoutMs: 10_000 },
        url: connectionString,
      }),
    operation,
  })
}
