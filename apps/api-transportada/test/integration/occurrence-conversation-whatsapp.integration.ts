/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T502 (RF9, RF14, D6), contra Postgres real:
 * - a mensagem do contato com aceite entra na conversa aberta, uma vez só (a reentrega da Meta não
 *   duplica), e as duas grafias do nono dígito são o mesmo número;
 * - com duas conversas abertas, vai para "não atribuída";
 * - número sem aceite segue para o despachante, sem gravar nada;
 * - o status da Meta leva a mensagem enviada de `sent` a `read`, e o mesmo evento repetido não muda
 *   nada; outra empresa não acha nada.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  contractorContacts,
  occurrenceConversationMessages,
  occurrenceConversations,
  occurrenceConversationUnassigned,
} from '../../src/database/database.schema.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { createOccurrenceConversationWhatsAppHook } from '../../src/occurrence-conversation/application/whatsapp-conversation-inbound.service.js'
import { applyProviderMessageStatus } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-message-status.repository.js'
import { createDrizzleWhatsAppConversationInboundRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-whatsapp-conversation-inbound.repository.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const PHONE = '5511987654321'
/** A mesma linha sem o nono dígito: a chave do WhatsApp (`55` + DDD + oito finais) é a mesma. */
const PHONE_WITHOUT_NINTH_DIGIT = '551187654321'

function session(companyId: string) {
  return {
    assignedUserId: null,
    companyId,
    context: {},
    createdAt: '2026-09-24T12:00:00.000Z',
    currentState: 'start',
    humanRequestedAt: null,
    id: 'session-1',
    lastActivity: '2026-09-24T12:00:00.000Z',
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot' as const,
    updatedAt: '2026-09-24T12:00:00.000Z',
    whatsappNumber: PHONE,
  }
}

async function seedWhatsAppContact(database: TestDatabase) {
  const seeded = await seedMailScenario(database)
  const { companyId, userId } = seeded.company
  const [contactId] = seeded.contactIds
  await database.db
    .update(contractorContacts)
    .set({ phone: PHONE, whatsappOptInAt: new Date(), whatsappOptInByUserId: userId })
    .where(eq(contractorContacts.id, contactId ?? ''))
  const sent = await createOccurrenceMailUseCase(database).send({
    actorUserId: userId,
    bodyText: 'Autorizam?',
    companyId,
    contactIds: seeded.contactIds.slice(0, 1),
    correlationId: 'correlation-1',
    idempotencyKey: 'conversation-whatsapp-key-01',
    occurrenceId: seeded.occurrenceId,
    subject: 'Ocorrência',
  })
  return { ...seeded, conversationId: sent.conversationId }
}

function createHook(database: TestDatabase, forwarded: unknown[]) {
  return createOccurrenceConversationWhatsAppHook({
    clock: () => new Date('2026-09-24T15:00:00.000Z'),
    inbound: createDrizzleWhatsAppConversationInboundRepository(database.db),
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    next: async (message) => {
      forwarded.push(message)
      return { outcome: 'handled' }
    },
    rateLimiter: createRateLimiter(),
  })
}

describe('a conversa pelo WhatsApp contra Postgres (spec 183 T502)', () => {
  testWithPostgres(
    'contato com aceite entra na conversa, uma vez só, pelas duas grafias do número',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedWhatsAppContact(database)
        const { companyId } = seeded.company
        const forwarded: unknown[] = []
        const hook = createHook(database, forwarded)
        const message = {
          from: PHONE_WITHOUT_NINTH_DIGIT,
          id: 'wamid.in-1',
          text: { body: 'Autorizado' },
          type: 'text',
        }

        await hook(message, session(companyId))
        await hook(message, session(companyId))

        const received = await database.db
          .select({
            bodyText: occurrenceConversationMessages.bodyText,
            conversationId: occurrenceConversationMessages.conversationId,
            senderAddress: occurrenceConversationMessages.senderAddress,
          })
          .from(occurrenceConversationMessages)
          .where(
            and(
              eq(occurrenceConversationMessages.companyId, companyId),
              eq(occurrenceConversationMessages.channel, 'whatsapp'),
            ),
          )
        expect(received).toEqual([
          {
            bodyText: 'Autorizado',
            conversationId: seeded.conversationId,
            senderAddress: PHONE_WITHOUT_NINTH_DIGIT,
          },
        ])
        expect(forwarded).toEqual([])
      })
    },
    30_000,
  )

  testWithPostgres(
    'duas conversas abertas: não atribuída; sem aceite: segue para o despachante',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedWhatsAppContact(database)
        const { companyId } = seeded.company
        const [conversation] = await database.db
          .select({ contractorId: occurrenceConversations.contractorId })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.id, seeded.conversationId))
        await database.db.insert(occurrenceConversations).values({
          companyId,
          contractorId: conversation?.contractorId ?? null,
          occurrenceId: crypto.randomUUID(),
          occurrenceKind: 'document',
          participant: 'contractor',
          publicRef: `ref${crypto.randomUUID().replaceAll('-', '')}`,
        })
        const forwarded: unknown[] = []
        const hook = createHook(database, forwarded)

        await hook(
          { from: PHONE, id: 'wamid.in-2', text: { body: 'Qual?' }, type: 'text' },
          session(companyId),
        )
        const unassigned = await database.db
          .select({
            contractorContactId: occurrenceConversationUnassigned.contractorContactId,
            senderAddress: occurrenceConversationUnassigned.senderAddress,
          })
          .from(occurrenceConversationUnassigned)
          .where(eq(occurrenceConversationUnassigned.companyId, companyId))
        expect(unassigned).toEqual([
          { contractorContactId: seeded.contactIds[0] ?? null, senderAddress: PHONE },
        ])

        await database.db
          .update(contractorContacts)
          .set({ whatsappOptInAt: null, whatsappOptInByUserId: null })
          .where(eq(contractorContacts.id, seeded.contactIds[0] ?? ''))
        const refused = { from: PHONE, id: 'wamid.in-3', text: { body: 'Oi' }, type: 'text' }
        await hook(refused, session(companyId))
        expect(forwarded).toEqual([refused])
      })
    },
    30_000,
  )

  testWithPostgres(
    'o status da Meta leva a enviada de sent a read, idempotente, e outra empresa não toca',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedWhatsAppContact(database)
        const other = await seedCompany(database)
        const { companyId, userId } = seeded.company
        const [outbound] = await database.db
          .insert(occurrenceConversationMessages)
          .values({
            authorUserId: userId,
            bodyText: 'Autorizam?',
            channel: 'whatsapp',
            companyId,
            conversationId: seeded.conversationId,
            direction: 'outbound',
            providerMessageId: 'wamid.out-1',
            status: 'sent',
            statusTimes: { sent: '2026-09-24T15:00:00.000Z' },
          })
          .returning({ id: occurrenceConversationMessages.id })
        const apply = (company: string, incoming: 'delivered' | 'read', minute: number) =>
          applyProviderMessageStatus(database.db, {
            at: new Date(`2026-09-24T15:0${String(minute)}:00.000Z`),
            channel: 'whatsapp',
            companyId: company,
            incoming,
            providerMessageId: 'wamid.out-1',
          })
        const read = async () =>
          (
            await database.db
              .select({
                status: occurrenceConversationMessages.status,
                statusTimes: occurrenceConversationMessages.statusTimes,
              })
              .from(occurrenceConversationMessages)
              .where(eq(occurrenceConversationMessages.id, outbound?.id ?? ''))
          )[0]

        await apply(other.companyId, 'read', 1)
        expect((await read())?.status).toBe('sent')

        await apply(companyId, 'delivered', 2)
        await apply(companyId, 'read', 3)
        const afterRead = await read()
        await apply(companyId, 'read', 4)
        await apply(companyId, 'delivered', 5)

        expect(afterRead).toEqual({
          status: 'read',
          statusTimes: {
            delivered: '2026-09-24T15:02:00.000Z',
            read: '2026-09-24T15:03:00.000Z',
            sent: '2026-09-24T15:00:00.000Z',
          },
        })
        expect(await read()).toEqual(afterRead)
      })
    },
    30_000,
  )
})
