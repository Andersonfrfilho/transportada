/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.3a (ADR-0101), contra Postgres real:
 * - a conversa de ocorrência segue igual: a lista e as mensagens do motorista saem com a forma de
 *   sempre, e o eco da `Idempotency-Key` fica gravado em `client_message_id`;
 * - a conversa de nota e de viagem respeita o CHECK de forma e os únicos parciais, e as consultas que
 *   enumeram por motorista (lista, entregue ao baixar) não as enxergam.
 */
import { and, eq } from 'drizzle-orm'
import { describe, expect } from 'bun:test'

import {
  occurrenceConversationMessages,
  occurrenceConversations,
  contractors,
  tripDocuments,
  trips,
} from '../../src/database/database.schema.js'
import {
  createListMyConversationsUseCase,
  createListMyOccurrenceConversationUseCase,
  createReplyMyOccurrenceConversationUseCase,
  createSendDriverAppMessageUseCase,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import { UNUSED_ATTACHMENT_STORAGE } from '../fixtures/conversation-attachment.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'

const NOW = new Date('2026-10-09T12:00:00.000Z')
const SEND_KEY = 'subject-send-key-0001'
const REPLY_KEY = 'subject-reply-key-0001'

async function rejectedBy(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation()
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
    return cause instanceof Error ? cause.message : String(cause)
  }
  throw new Error('EXPECTED_REJECTION')
}

describe('o assunto da conversa contra Postgres (spec 260 T2.3a)', () => {
  testWithPostgres(
    'a conversa de ocorrência não muda e grava o eco; nota e viagem não aparecem na lista nem no entregue',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, firstDriverId, userId } = seeded.company
        const driverUserId = await linkDriverMembership(database, seeded.company, firstDriverId)
        const [trip] = await database.db
          .select({ id: trips.id })
          .from(trips)
          .where(eq(trips.companyId, companyId))
        const [link] = await database.db
          .select({ id: tripDocuments.id })
          .from(tripDocuments)
          .where(eq(tripDocuments.companyId, companyId))
        if (trip === undefined || link === undefined) throw new Error('EXPECTED_TRIP_AND_LINK')

        const unitOfWork = createDrizzleDriverConversationUnitOfWork(database.db)
        const fingerprintService = {
          create: async ({ fields }: { fields: readonly Uint8Array[] }) =>
            fields.map((field) => new TextDecoder().decode(field)).join('|'),
        }
        let tick = 0
        const send = createSendDriverAppMessageUseCase({
          clock: () => new Date(NOW.getTime() + 60_000 * tick++),
          fingerprintService,
          notifier: { notify: async () => undefined },
          storage: UNUSED_ATTACHMENT_STORAGE,
          unitOfWork,
        })
        const reply = createReplyMyOccurrenceConversationUseCase({
          clock: () => new Date(NOW.getTime() + 60_000 * tick++),
          fingerprintService,
          storage: UNUSED_ATTACHMENT_STORAGE,
          unitOfWork,
        })
        const sent = await send.send({
          actorUserId: userId,
          bodyText: 'Pode aguardar na doca?',
          companyId,
          idempotencyKey: SEND_KEY,
          occurrenceId: seeded.occurrenceId,
        })
        const mine = {
          companyId,
          driverId: firstDriverId,
          driverUserId,
          occurrenceId: seeded.occurrenceId,
        }
        await reply.reply({ ...mine, bodyText: 'Aguardo sim.', idempotencyKey: REPLY_KEY })

        const stored = await database.db
          .select({
            clientMessageId: occurrenceConversationMessages.clientMessageId,
            direction: occurrenceConversationMessages.direction,
          })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.conversationId, sent.conversationId))
        expect(
          stored.toSorted((left, right) => left.direction.localeCompare(right.direction)),
        ).toEqual([
          { clientMessageId: REPLY_KEY, direction: 'inbound' },
          { clientMessageId: SEND_KEY, direction: 'outbound' },
        ])

        /** Uma conversa de viagem do mesmo motorista, com uma mensagem da operação na fila. */
        const [tripConversation] = await database.db
          .insert(occurrenceConversations)
          .values({
            companyId,
            driverUserId,
            participant: 'driver',
            subjectType: 'trip',
            tripId: trip.id,
          })
          .returning({ id: occurrenceConversations.id })
        if (tripConversation === undefined) throw new Error('EXPECTED_TRIP_CONVERSATION')
        await database.db.insert(occurrenceConversationMessages).values({
          authorUserId: userId,
          bodyText: 'Aviso da viagem',
          channel: 'app',
          companyId,
          conversationId: tripConversation.id,
          direction: 'outbound',
          status: 'queued',
          statusTimes: { queued: NOW.toISOString() },
        })

        const inbox = createListMyConversationsUseCase({
          clock: () => new Date('2026-10-09T13:00:00.000Z'),
          unitOfWork,
        })
        expect(await inbox.list({ companyId, driverUserId })).toEqual([
          {
            lastMessageAt: '2026-10-09T12:01:00.000Z',
            occurrenceId: seeded.occurrenceId,
            occurrenceLabel: expect.stringMatching(/^NF /u),
            unreadCount: 1,
          },
        ])
        const [tripMessage] = await database.db
          .select({ status: occurrenceConversationMessages.status })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.conversationId, tripConversation.id))
        expect(tripMessage).toEqual({ status: 'queued' })

        const list = createListMyOccurrenceConversationUseCase({
          clock: () => new Date('2026-10-09T13:05:00.000Z'),
          storage: UNUSED_ATTACHMENT_STORAGE,
          unitOfWork,
        })
        expect(
          (await list.list(mine)).map(
            ({ attachments, bodyText, createdAt, direction, status }) => ({
              attachments,
              bodyText,
              createdAt,
              direction,
              status,
            }),
          ),
        ).toEqual([
          {
            attachments: [],
            bodyText: 'Pode aguardar na doca?',
            createdAt: '2026-10-09T12:00:00.000Z',
            direction: 'outbound',
            status: 'delivered',
          },
          {
            attachments: [],
            bodyText: 'Aguardo sim.',
            createdAt: '2026-10-09T12:01:00.000Z',
            direction: 'inbound',
            status: null,
          },
        ])
      })
    },
    30_000,
  )

  testWithPostgres(
    'o CHECK de forma e os únicos parciais: ocorrência, nota e viagem',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, firstDriverId } = seeded.company
        const driverUserId = await linkDriverMembership(database, seeded.company, firstDriverId)
        const [trip] = await database.db
          .select({ id: trips.id })
          .from(trips)
          .where(eq(trips.companyId, companyId))
        const [link] = await database.db
          .select({ id: tripDocuments.id })
          .from(tripDocuments)
          .where(eq(tripDocuments.companyId, companyId))
        const [contractor] = await database.db
          .select({ id: contractors.id })
          .from(contractors)
          .where(eq(contractors.companyId, companyId))
        if (trip === undefined || link === undefined || contractor === undefined) {
          throw new Error('EXPECTED_TRIP_LINK_AND_CONTRACTOR')
        }
        const driver = { companyId, driverUserId, participant: 'driver' } as const
        const insert = (values: Partial<typeof occurrenceConversations.$inferInsert>) =>
          database.db
            .insert(occurrenceConversations)
            .values({ ...driver, ...values })
            .returning({ id: occurrenceConversations.id })
        const SHAPE = 'occurrence_conversations_subject_shape_check'

        await insert({ subjectType: 'document', tripDocumentId: link.id, tripId: trip.id })
        await insert({ subjectType: 'trip', tripId: trip.id })
        expect(
          await rejectedBy(() =>
            insert({ subjectType: 'document', tripDocumentId: link.id, tripId: trip.id }),
          ),
        ).toContain('occurrence_conversations_document_subject_unique')
        expect(await rejectedBy(() => insert({ subjectType: 'trip', tripId: trip.id }))).toContain(
          'occurrence_conversations_trip_subject_unique',
        )

        expect(
          await rejectedBy(() =>
            database.db.insert(occurrenceConversations).values({
              companyId,
              contractorId: contractor.id,
              participant: 'contractor',
              publicRef: crypto.randomUUID().replaceAll('-', ''),
              subjectType: 'document',
              tripDocumentId: link.id,
              tripId: trip.id,
            }),
          ),
        ).toContain(SHAPE)
        expect(
          await rejectedBy(() =>
            insert({
              occurrenceId: crypto.randomUUID(),
              occurrenceKind: 'document',
              subjectType: 'occurrence',
              tripId: trip.id,
            }),
          ),
        ).toContain(SHAPE)
        expect(await rejectedBy(() => insert({ subjectType: 'trip' }))).toContain(SHAPE)
        expect(
          await rejectedBy(() => insert({ subjectType: 'document', tripId: trip.id })),
        ).toContain(SHAPE)

        /** A conversa de ocorrência de sempre continua valendo, e o único antigo também. */
        const occurrence = {
          occurrenceId: crypto.randomUUID(),
          occurrenceKind: 'stop' as const,
        }
        await insert(occurrence)
        expect(await rejectedBy(() => insert(occurrence))).toContain(
          'occurrence_conversations_occurrence_participant_unique',
        )
        const [row] = await database.db
          .select({ subjectType: occurrenceConversations.subjectType })
          .from(occurrenceConversations)
          .where(
            and(
              eq(occurrenceConversations.companyId, companyId),
              eq(occurrenceConversations.occurrenceId, occurrence.occurrenceId),
            ),
          )
        expect(row).toEqual({ subjectType: 'occurrence' })
      })
    },
    30_000,
  )
})
