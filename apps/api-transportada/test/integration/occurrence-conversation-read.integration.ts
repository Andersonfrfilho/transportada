/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T404 (RF4, RF6, RF15), contra Postgres real: as conversas de uma ocorrência saem em
 * ordem, com o autor de cada mensagem; a não lida é **por usuário** (marcar como lida vale para
 * quem marcou); e a listagem traz o estado da conversa com a contratante e as não lidas do
 * motorista de quem está vendo. Outra empresa não acha a conversa.
 */
import { describe, expect } from 'bun:test'

import {
  contractorMailMessages,
  identityUsers,
  occurrenceConversationMessages,
  occurrenceConversations,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  findOccurrenceConversations,
  markOccurrenceConversationRead,
} from '../../src/occurrence-conversation/infrastructure/occurrence-conversation.query.js'
import {
  findTripOccurrenceFeedItem,
  listTripOccurrenceFeed,
} from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  seedCompany,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

async function seedOtherUser(database: TestDatabase, companyId: string): Promise<string> {
  const userId = crypto.randomUUID()
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  return userId
}

describe('as leituras da conversa contra Postgres (spec 183 T404)', () => {
  testWithPostgres(
    'mensagens em ordem com autor, não lidas por usuário e o estado na listagem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, userId } = seeded.company
        const otherUserId = await seedOtherUser(database, companyId)
        const sent = await createOccurrenceMailUseCase(database).send({
          actorUserId: userId,
          bodyText: 'Autorizam a descarga?',
          companyId,
          contactIds: seeded.contactIds.slice(0, 1),
          correlationId: 'correlation-1',
          idempotencyKey: 'conversation-read-key-0001',
          occurrenceId: seeded.occurrenceId,
          subject: 'Ocorrência',
        })

        const feedItem = async (viewerUserId: string) =>
          (
            await listTripOccurrenceFeed(database.db, {
              companyId,
              cursor: null,
              limit: 20,
              order: 'desc',
              viewerUserId,
            })
          ).items.find((item) => item.id === seeded.occurrenceId)

        expect((await feedItem(userId))?.conversation).toEqual({
          contractorState: 'awaiting',
          driverUnreadCount: 0,
        })

        await database.db.insert(occurrenceConversationMessages).values({
          bodyText: 'Podem descarregar.',
          channel: 'email',
          companyId,
          conversationId: sent.conversationId,
          createdAt: new Date(Date.now() + 1000),
          direction: 'inbound',
          senderAddress: 'compras@alfa.example.test',
        })
        expect((await feedItem(userId))?.conversation.contractorState).toBe('replied')

        const view = await findOccurrenceConversations(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
          userId,
        })
        expect(view?.conversations).toHaveLength(1)
        const [conversation] = view?.conversations ?? []
        expect(conversation?.participant).toBe('contractor')
        expect(conversation?.unreadCount).toBe(1)
        expect(conversation?.messages.map((message) => message.author)).toEqual([
          /** O seed não grava perfil: o nome sai nulo, e a tela cai no e-mail do usuário. */
          { kind: 'operation', name: null, userId },
          /** Spec 183 T406 (RF16): o remetente casa com o contato daquela contratante, na leitura. */
          {
            identity: {
              arrivedAs: 'compras@alfa.example.test',
              contact: expect.objectContaining({
                email: 'compras@alfa.example.test',
                id: seeded.contactIds[0],
                status: 'active',
              }),
              inactive: false,
              kind: 'contact',
              profileName: null,
            },
            kind: 'contractor',
            userId: null,
          },
        ])

        /** Fora dos contatos: o nome do `From` gravado pelo worker e a sugestão de cadastro. */
        const [unknownMail] = await database.db
          .insert(contractorMailMessages)
          .values({
            bodyText: 'Quem fala é o João.',
            companyId,
            direction: 'inbound',
            fromAddress: 'Joao@Alfa.example.test',
            fromDisplayName: 'João Lima',
            subject: 'Re: Ocorrência',
            threadId: sent.threadId,
            toAddresses: ['resposta@reply.example.test'],
          })
          .returning({ id: contractorMailMessages.id })
        await database.db.insert(occurrenceConversationMessages).values({
          bodyText: 'Quem fala é o João.',
          channel: 'email',
          companyId,
          conversationId: sent.conversationId,
          createdAt: new Date(Date.now() + 2000),
          direction: 'inbound',
          mailMessageId: unknownMail?.id ?? null,
          senderAddress: 'Joao@Alfa.example.test',
        })
        const withUnknown = await findOccurrenceConversations(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
          userId,
        })
        expect(withUnknown?.conversations[0]?.messages.at(-1)?.author).toEqual({
          identity: {
            arrivedAs: 'Joao@Alfa.example.test',
            displayName: 'João Lima',
            kind: 'unknown',
            suggestion: { email: 'joao@alfa.example.test', name: 'João Lima', phone: null },
          },
          kind: 'contractor',
          userId: null,
        })

        const driverConversationId = crypto.randomUUID()
        await database.db.insert(occurrenceConversations).values({
          companyId,
          driverUserId: userId,
          id: driverConversationId,
          occurrenceId: seeded.occurrenceId,
          occurrenceKind: 'document',
          participant: 'driver',
        })
        await database.db.insert(occurrenceConversationMessages).values({
          bodyText: 'Estou na doca.',
          channel: 'app',
          companyId,
          conversationId: driverConversationId,
          direction: 'inbound',
          driverUserId: userId,
        })
        expect((await feedItem(otherUserId))?.conversation.driverUnreadCount).toBe(1)

        expect(
          await markOccurrenceConversationRead(database.db, {
            companyId,
            conversationId: driverConversationId,
            userId: otherUserId,
          }),
        ).toBe(true)
        expect((await feedItem(otherUserId))?.conversation.driverUnreadCount).toBe(0)
        expect((await feedItem(userId))?.conversation.driverUnreadCount).toBe(1)

        const detail = await findTripOccurrenceFeedItem(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(detail?.conversation.contractorState).toBe('replied')
      })
    },
    30_000,
  )

  testWithPostgres(
    'outra empresa não acha as conversas nem marca como lida',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedCompany(database)
        const sent = await createOccurrenceMailUseCase(database).send({
          actorUserId: seeded.company.userId,
          bodyText: 'Texto',
          companyId: seeded.company.companyId,
          contactIds: seeded.contactIds.slice(0, 1),
          correlationId: 'correlation-1',
          idempotencyKey: 'conversation-read-key-0002',
          occurrenceId: seeded.occurrenceId,
          subject: 'Assunto',
        })

        expect(
          await findOccurrenceConversations(database.db, {
            companyId: other.companyId,
            occurrenceId: seeded.occurrenceId,
            userId: other.userId,
          }),
        ).toBeNull()
        expect(
          await markOccurrenceConversationRead(database.db, {
            companyId: other.companyId,
            conversationId: sent.conversationId,
            userId: other.userId,
          }),
        ).toBe(false)
      })
    },
    30_000,
  )
})
