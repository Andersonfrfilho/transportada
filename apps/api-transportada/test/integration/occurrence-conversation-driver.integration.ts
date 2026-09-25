/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T601 (RF11), contra Postgres real:
 * - a viagem sem motorista com vínculo não tem a quem escrever (422);
 * - o operador escreve ao motorista: a mensagem nasce na fila, na conversa do usuário do primeiro
 *   condutor, e o aviso vai com `dedupeKey` = id da mensagem; a mesma chave não duplica;
 * - o motorista lê e responde só a conversa dele; ficha fora da tripulação e outra empresa não
 *   alcançam.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../src/database/database.schema.js'
import {
  createListMyConversationsUseCase,
  createListMyOccurrenceConversationUseCase,
  createMarkMyConversationReadUseCase,
  createReplyMyOccurrenceConversationUseCase,
  createSendDriverAppMessageUseCase,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  seedCompany,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'

const NOW = new Date('2026-09-24T17:00:00.000Z')

async function failure(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work()
  } catch (error) {
    return error
  }
  return undefined
}

describe('a conversa com o motorista pelo app contra Postgres (spec 183 T601)', () => {
  testWithPostgres(
    'operador escreve, motorista lê e responde; fora da tripulação e outra empresa não alcançam',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedCompany(database)
        const { companyId, firstDriverId, userId } = seeded.company
        const notifications: unknown[] = []
        const unitOfWork = createDrizzleDriverConversationUnitOfWork(database.db)
        const fingerprintService = {
          create: async ({ fields }: { fields: readonly Uint8Array[] }) =>
            fields.map((field) => new TextDecoder().decode(field)).join('|'),
        }
        const send = createSendDriverAppMessageUseCase({
          clock: () => NOW,
          fingerprintService,
          notifier: { notify: async (input) => void notifications.push(input) },
          unitOfWork,
        })
        const input = {
          actorUserId: userId,
          bodyText: 'Pode aguardar na doca?',
          companyId,
          idempotencyKey: 'driver-app-integration-01',
          occurrenceId: seeded.occurrenceId,
        }

        expect(await failure(() => send.send(input))).toMatchObject({
          code: 'OCCURRENCE_CONVERSATION_DRIVER_UNKNOWN',
        })

        const driverUserId = await linkDriverMembership(database, seeded.company, firstDriverId)
        const sent = await send.send(input)
        await send.send(input)

        const [conversation] = await database.db
          .select({
            driverUserId: occurrenceConversations.driverUserId,
            participant: occurrenceConversations.participant,
          })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.id, sent.conversationId))
        expect(conversation).toEqual({ driverUserId, participant: 'driver' })
        const stored = await database.db
          .select({
            channel: occurrenceConversationMessages.channel,
            status: occurrenceConversationMessages.status,
          })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.conversationId, sent.conversationId))
        expect(stored).toEqual([{ channel: 'app', status: 'queued' }])
        expect(notifications).toEqual([
          {
            companyId,
            dedupeKey: sent.conversationMessageId,
            occurrenceLabel: expect.stringMatching(/^NF /u),
            recipientUserId: driverUserId,
          },
        ])

        const mine = {
          companyId,
          driverId: firstDriverId,
          driverUserId,
          occurrenceId: seeded.occurrenceId,
        }
        const list = createListMyOccurrenceConversationUseCase({
          clock: () => new Date('2026-09-24T17:04:00.000Z'),
          unitOfWork,
        })
        const reply = createReplyMyOccurrenceConversationUseCase({
          clock: () => new Date('2026-09-24T17:05:00.000Z'),
          fingerprintService,
          unitOfWork,
        })
        await reply.reply({
          ...mine,
          bodyText: 'Aguardo sim.',
          idempotencyKey: 'driver-reply-integration-1',
        })
        expect(
          (await list.list(mine)).map((message) => [message.direction, message.bodyText]),
        ).toEqual([
          ['outbound', 'Pode aguardar na doca?'],
          ['inbound', 'Aguardo sim.'],
        ])

        /** T604 (RF14): baixar marcou entregue; a lista traz a não lida; abrir marca lida, uma vez. */
        const statusOf = async () =>
          (
            await database.db
              .select({
                status: occurrenceConversationMessages.status,
                statusTimes: occurrenceConversationMessages.statusTimes,
              })
              .from(occurrenceConversationMessages)
              .where(eq(occurrenceConversationMessages.id, sent.conversationMessageId))
          )[0]
        expect((await statusOf())?.status).toBe('delivered')
        const inbox = createListMyConversationsUseCase({ clock: () => NOW, unitOfWork })
        expect(await inbox.list({ companyId, driverUserId })).toEqual([
          {
            lastMessageAt: '2026-09-24T17:05:00.000Z',
            occurrenceId: seeded.occurrenceId,
            occurrenceLabel: expect.stringMatching(/^NF /u),
            unreadCount: 1,
          },
        ])
        expect(await inbox.list({ companyId: other.companyId, driverUserId })).toEqual([])
        const markRead = createMarkMyConversationReadUseCase({
          clock: () => new Date('2026-09-24T17:06:00.000Z'),
          unitOfWork,
        })
        await markRead.markRead(mine)
        const afterRead = await statusOf()
        await markRead.markRead(mine)
        expect(afterRead).toEqual({
          status: 'read',
          statusTimes: {
            delivered: '2026-09-24T17:04:00.000Z',
            queued: NOW.toISOString(),
            read: '2026-09-24T17:06:00.000Z',
          },
        })
        expect(await statusOf()).toEqual(afterRead)
        expect((await inbox.list({ companyId, driverUserId }))[0]?.unreadCount).toBe(0)

        expect(
          await failure(() => list.list({ ...mine, driverId: crypto.randomUUID() })),
        ).toMatchObject({ code: 'TRIP_OCCURRENCE_NOT_FOUND' })
        expect(
          await failure(() => list.list({ ...mine, companyId: other.companyId })),
        ).toMatchObject({ code: 'TRIP_OCCURRENCE_NOT_FOUND' })
        expect(
          await failure(() =>
            send.send({
              ...input,
              companyId: other.companyId,
              idempotencyKey: 'driver-app-integration-02',
            }),
          ),
        ).toMatchObject({ code: 'TRIP_OCCURRENCE_NOT_FOUND' })
      })
    },
    30_000,
  )
})
