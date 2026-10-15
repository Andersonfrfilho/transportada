/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T2.7 (ADR-0105 §3), contra Postgres real: o motorista reabre a ocorrência resolvida respondendo
 * com `reopen`. Evento e mensagem entram juntos; sem o que reabrir é 409 e nada é gravado; a repetição
 * da mesma chave devolve o gravado; resolver × reabrir serializa.
 */
import { describe, expect } from 'bun:test'
import { eq, sql } from 'drizzle-orm'

import {
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../src/database/database.schema.js'
import { tripOccurrenceResolutionEvents } from '../../src/database/occurrence-conversation.schema.js'
import { tripDocumentOccurrences } from '../../src/database/trip.schema.js'
import { createReplyMyOccurrenceConversationUseCase } from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import { buildOccurrenceTimeline } from '../../src/trips/domain/occurrence-timeline.policy.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { findTripOccurrenceTimelineSources } from '../../src/trips/infrastructure/trip-occurrence-timeline.query.js'
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
  const reopenedNotices: { companyId: string; messageId: string; occurrenceId: string }[] = []
  const infoLogs: { message: string; context: unknown }[] = []
  const reply = createReplyMyOccurrenceConversationUseCase({
    clock: () => NOW,
    fingerprintService,
    reopenNotifier: {
      notifyReopened: async (input) => void reopenedNotices.push(input),
      notifyResolved: async () => undefined,
    },
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
  return {
    database,
    driverUserId,
    events,
    infoLogs,
    reopenedNotices,
    messages,
    mine,
    reply,
    resolveNow,
    seeded,
  }
}

async function expectOfficeViews(
  t: Awaited<ReturnType<typeof setup>>,
  messageId: string,
): Promise<void> {
  const { companyId } = t.mine
  const occurrenceId = t.seeded.occurrenceId
  const sources = await findTripOccurrenceTimelineSources(t.database.db, {
    companyId,
    occurrenceId,
  })
  const timeline = buildOccurrenceTimeline({ sources: sources ?? [] })
  const resolution = timeline.events.filter((event) => event.kind.startsWith('resolution.'))
  expect(resolution.map((event) => event.kind)).toEqual([
    'resolution.resolved',
    'resolution.reopened',
  ])
  expect(resolution[0]).toMatchObject({
    actor: { kind: 'operation' },
    isKey: true,
    note: 'Tudo certo',
    phraseKey: null,
  })
  expect(resolution[1]).toMatchObject({ actor: { kind: 'driver' }, messageId })

  const feed = (states?: readonly ('open' | 'resolved' | 'reopened' | 'cancelled')[]) =>
    listTripOccurrenceFeed(t.database.db, {
      companyId,
      cursor: null,
      ...(states === undefined ? {} : { filters: { resolutionStateIn: states } }),
      limit: 20,
      order: 'desc',
    })
  const unfiltered = await feed()
  expect(unfiltered.items.find((item) => item.id === occurrenceId)?.resolution).toMatchObject({
    actorKind: 'driver',
    state: 'reopened',
  })
  const idsOf = async (states: readonly ('open' | 'resolved' | 'reopened' | 'cancelled')[]) =>
    (await feed(states)).items.map((item) => item.id)
  expect(await idsOf(['reopened'])).toContain(occurrenceId)
  expect(await idsOf(['open', 'resolved', 'cancelled'])).not.toContain(occurrenceId)
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
        expect(t.reopenedNotices).toEqual([
          {
            companyId: t.mine.companyId,
            messageId: first.messageId,
            occurrenceId: t.seeded.occurrenceId,
          },
        ])
        await expectOfficeViews(t, first.messageId)
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
      expect(t.reopenedNotices).toEqual([])
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

  testWithPostgres(
    'a resolução que começou antes da reabertura mas travou depois dela é o último evento',
    async () => {
      await withConversationDatabase(async (database) => {
        const t = await setup(database)
        await t.resolveNow()
        let releaseGate: () => void = () => undefined
        const gate = new Promise<void>((resolveGate) => void (releaseGate = resolveGate))
        let markStarted: () => void = () => undefined
        const started = new Promise<void>((resolveStarted) => void (markStarted = resolveStarted))
        const gatedDatabase = {
          transaction: (operation: (transaction: never) => Promise<unknown>) =>
            database.db.transaction(async (transaction) => {
              await transaction.execute(sql`select now()`)
              markStarted()
              await gate
              return operation(transaction as never)
            }),
        }
        const lateResolve = createResolveOccurrenceUseCase({
          logger,
          unitOfWork: new DrizzleOccurrenceResolutionUnitOfWork(gatedDatabase as never),
        })
        const pending = lateResolve.execute({
          context: {
            companyId: t.mine.companyId,
            kind: 'company',
            membershipId: crypto.randomUUID(),
            permissions: new Set(['occurrences.resolve'] as never),
            roles: [],
            userId: t.seeded.company.userId,
          },
          note: 'resolvida de novo',
          occurrenceId: t.seeded.occurrenceId,
          occurrenceKind: 'document',
        })
        await started
        await t.reply.reply({
          ...t.mine,
          bodyText: 'Não acabou',
          idempotencyKey: 'reopen-integration-order-0001',
          reopen: true,
        })
        releaseGate()
        await pending

        const events = [...(await t.events())].sort(
          (first, second) => first.sequence - second.sequence,
        )
        expect(events.map((event) => event.kind)).toEqual(['resolved', 'reopened', 'resolved'])
        const feed = await listTripOccurrenceFeed(database.db, {
          companyId: t.mine.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })
        expect(
          feed.items.find((item) => item.id === t.seeded.occurrenceId)?.resolution,
        ).toMatchObject({
          state: 'resolved',
        })
        const resolvedOnly = await listTripOccurrenceFeed(database.db, {
          companyId: t.mine.companyId,
          cursor: null,
          filters: { resolutionStateIn: ['resolved'] },
          limit: 20,
          order: 'desc',
        })
        expect(resolvedOnly.items.map((item) => item.id)).toContain(t.seeded.occurrenceId)
      })
    },
  )
})
