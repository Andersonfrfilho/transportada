/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T2.7 (ADR-0105 §3), contra Postgres real: o motorista reabre a ocorrência resolvida respondendo
 * com `reopen`. Evento e mensagem entram juntos; sem o que reabrir é 409 e nada é gravado; a repetição
 * da mesma chave devolve o gravado; resolver × reabrir serializa.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../src/database/database.schema.js'
import { tripOccurrenceResolutionEvents } from '../../src/database/occurrence-conversation.schema.js'
import { tripDocumentOccurrences } from '../../src/database/trip.schema.js'
import { createReplyMyOccurrenceConversationUseCase } from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import { createResolveOccurrenceUseCase } from '../../src/trips/application/resolve-occurrence.use-case.js'
import { DrizzleOccurrenceResolutionUnitOfWork } from '../../src/trips/infrastructure/drizzle-occurrence-resolution.repository.js'
import { UNUSED_ATTACHMENT_STORAGE } from '../fixtures/conversation-attachment.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'

const NOW = new Date('2026-10-15T12:00:00.000Z')
const logger = { error: () => undefined, info: () => undefined, warn: () => undefined }
const fingerprintService = {
  create: async ({ fields }: { fields: readonly Uint8Array[] }) =>
    fields.map((field) => new TextDecoder().decode(field)).join('|'),
}

async function setup(database: Parameters<Parameters<typeof withConversationDatabase>[0]>[0]) {
  const seeded = await seedMailScenario(database)
  const { companyId, firstDriverId, userId } = seeded.company
  const driverUserId = await linkDriverMembership(database, seeded.company, firstDriverId)
  const unitOfWork = createDrizzleDriverConversationUnitOfWork(database.db)
  const infoLogs: { message: string; context: unknown }[] = []
  const reply = createReplyMyOccurrenceConversationUseCase({
    clock: () => NOW,
    fingerprintService,
    logger: { ...logger, info: (message, context) => void infoLogs.push({ context, message }) },
    storage: UNUSED_ATTACHMENT_STORAGE,
    unitOfWork,
  })
  const resolve = createResolveOccurrenceUseCase({
    logger,
    unitOfWork: new DrizzleOccurrenceResolutionUnitOfWork(database.db),
  })
  const mine = {
    companyId,
    driverId: firstDriverId,
    driverUserId,
    occurrenceId: seeded.occurrenceId,
  }
  const resolveNow = () =>
    resolve.execute({
      context: {
        companyId,
        kind: 'company',
        membershipId: crypto.randomUUID(),
        permissions: new Set(['occurrences.resolve'] as never),
        roles: [],
        userId,
      },
      note: 'Tudo certo',
      occurrenceId: seeded.occurrenceId,
      occurrenceKind: 'document',
    })
  const events = () =>
    database.db
      .select()
      .from(tripOccurrenceResolutionEvents)
      .where(eq(tripOccurrenceResolutionEvents.documentOccurrenceId, seeded.occurrenceId))
  const messages = () => database.db.select().from(occurrenceConversationMessages)
  return { database, driverUserId, events, infoLogs, messages, mine, reply, resolveNow, seeded }
}

describe('o motorista reabre a ocorrência respondendo (spec 266 T2.7)', () => {
  testWithPostgres(
    'resolvida + reopen: evento e mensagem juntos; a mesma chave repete',
    async () => {
      await withConversationDatabase(async (database) => {
        const t = await setup(database)
        await t.resolveNow()
        const first = await t.reply.reply({
          ...t.mine,
          bodyText: 'Não acabou',
          idempotencyKey: 'reopen-integration-key-0001',
          reopen: true,
        })
        const replay = await t.reply.reply({
          ...t.mine,
          bodyText: 'Não acabou',
          idempotencyKey: 'reopen-integration-key-0001',
          reopen: true,
        })
        expect(replay).toEqual(first)
        const reopened = (await t.events()).filter((event) => event.kind === 'reopened')
        expect(reopened).toHaveLength(1)
        expect(reopened[0]).toMatchObject({
          actorKind: 'driver',
          actorUserId: t.driverUserId,
          conversationMessageId: first.messageId,
        })
        expect(await t.messages()).toHaveLength(1)
        expect(
          t.infoLogs.filter((log) => log.message === 'occurrence.resolution.reopened'),
        ).toHaveLength(1)
        expect(JSON.stringify(t.infoLogs)).not.toContain('Não acabou')
        await expect(
          t.reply.reply({
            ...t.mine,
            bodyText: 'Outro texto',
            idempotencyKey: 'reopen-integration-key-0001',
            reopen: true,
          }),
        ).rejects.toMatchObject({ status: 409 })
      })
    },
  )

  testWithPostgres('reopen sem estar resolvida: 409 e nenhuma mensagem nem conversa', async () => {
    await withConversationDatabase(async (database) => {
      const t = await setup(database)
      await expect(
        t.reply.reply({
          ...t.mine,
          bodyText: 'x',
          idempotencyKey: 'reopen-integration-key-0002',
          reopen: true,
        }),
      ).rejects.toMatchObject({ code: 'OCCURRENCE_NOT_RESOLVED', status: 409 })
      expect(await t.messages()).toHaveLength(0)
      expect(await database.db.select().from(occurrenceConversations)).toHaveLength(0)
      expect(await t.events()).toHaveLength(0)
    })
  })

  testWithPostgres('cancelada: 409 OCCURRENCE_CANCELLED e nada gravado', async () => {
    await withConversationDatabase(async (database) => {
      const t = await setup(database)
      await t.resolveNow()
      await database.db
        .update(tripDocumentOccurrences)
        .set({
          cancellationReason: 'aberta por engano',
          cancelledAt: NOW,
          cancelledByUserId: t.seeded.company.userId,
        })
        .where(eq(tripDocumentOccurrences.id, t.seeded.occurrenceId))
      await expect(
        t.reply.reply({
          ...t.mine,
          bodyText: 'x',
          idempotencyKey: 'reopen-integration-key-0003',
          reopen: true,
        }),
      ).rejects.toMatchObject({ code: 'OCCURRENCE_CANCELLED', status: 409 })
      expect(await t.messages()).toHaveLength(0)
    })
  })

  testWithPostgres('resposta sem reopen na resolvida: só a mensagem, sem evento novo', async () => {
    await withConversationDatabase(async (database) => {
      const t = await setup(database)
      await t.resolveNow()
      await t.reply.reply({
        ...t.mine,
        bodyText: 'Obrigado',
        idempotencyKey: 'reopen-integration-key-0004',
      })
      expect(await t.messages()).toHaveLength(1)
      expect((await t.events()).map((event) => event.kind)).toEqual(['resolved'])
    })
  })

  testWithPostgres('corrida resolver × reabrir: estado final coerente, sem duplicata', async () => {
    await withConversationDatabase(async (database) => {
      const t = await setup(database)
      await t.resolveNow()
      const outcomes = await Promise.allSettled([
        t.reply.reply({
          ...t.mine,
          bodyText: 'a',
          idempotencyKey: 'reopen-integration-race-000a',
          reopen: true,
        }),
        t.reply.reply({
          ...t.mine,
          bodyText: 'b',
          idempotencyKey: 'reopen-integration-race-000b',
          reopen: true,
        }),
      ])
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
      expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
        code: 'OCCURRENCE_NOT_RESOLVED',
      })
      expect(await t.messages()).toHaveLength(1)
      expect((await t.events()).map((event) => event.kind)).toEqual(['resolved', 'reopened'])
    })
  })
})
