/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267 RF9, contra Postgres real: o responsável que respondeu ao e-mail em que estava em cópia entra na conversa da
 * contratante como mensagem interna dele — com DKIM alinhado, sem sugestão de cadastro — e ler a conversa não gera e-mail
 * de saída. Sem DKIM, ou de outra empresa, o endereço segue desconhecido.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { DrizzleOccurrenceWatcherRepository } from '../../src/contractor-mail/infrastructure/drizzle-occurrence-watcher.repository.js'
import {
  contractorMailMessages,
  contractorMailOutbox,
  identityUserProfiles,
  identityUsers,
  membershipRoles,
  occurrenceConversationMessages,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { findOccurrenceConversations } from '../../src/occurrence-conversation/infrastructure/occurrence-conversation.query.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const ANA_ADDRESS = 'ana@empresa.example.test'

async function seedUser(database: TestDatabase, companyId: string, address: string) {
  const userId = crypto.randomUUID()
  await database.db.insert(identityUsers).values({ id: userId })
  await database.db.insert(identityUserProfiles).values({
    contactAddress: address,
    contactChannel: 'email',
    email: address,
    name: 'Ana',
    phone: '',
    taxId: '',
    userId,
    username: `ana-${userId.slice(0, 8)}`,
  })
  const [membership] = await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, status: 'active', userId })
    .returning({ id: userCompanyMemberships.id })
  await database.db
    .insert(membershipRoles)
    .values({ membershipId: membership?.id ?? '', role: 'operator' })
  return userId
}

describe('a resposta do responsável contra Postgres (spec 267 RF9)', () => {
  testWithPostgres(
    'interna com DKIM alinhado, sem sugestão de cadastro, sem e-mail de saída novo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const other = await seedMailScenario(database)
        const anaId = await seedUser(database, companyId, ANA_ADDRESS)
        await seedUser(database, other.company.companyId, 'intruso@outra.example.test')
        await new DrizzleOccurrenceWatcherRepository(database.db).addWatcher({
          actorUserId: seeded.company.userId,
          correlationId: 'corr-reply',
          scope: { companyId, kind: 'company' },
          userId: anaId,
        })
        const sent = await createOccurrenceMailUseCase(database).send({
          actorUserId: seeded.company.userId,
          bodyText: 'Autorizam?',
          companyId,
          contactIds: seeded.contactIds.slice(0, 1),
          correlationId: 'corr-reply-send',
          idempotencyKey: 'key-reply',
          occurrenceId: seeded.occurrenceId,
          subject: 'Ocorrência — NF 1',
        })

        let tick = 1000
        async function receive(params: {
          readonly dkimResult: 'aligned' | 'not_aligned'
          readonly from: string
          readonly to: readonly string[]
        }) {
          const [mail] = await database.db
            .insert(contractorMailMessages)
            .values({
              bodyText: 'Já falei com o motorista.',
              ccAddresses: [],
              companyId,
              direction: 'inbound',
              dkimResult: params.dkimResult,
              fromAddress: params.from,
              subject: 'Re: Ocorrência',
              threadId: sent.threadId,
              toAddresses: [...params.to],
            })
            .returning({ id: contractorMailMessages.id })
          tick += 1000
          await database.db.insert(occurrenceConversationMessages).values({
            bodyText: 'Já falei com o motorista.',
            channel: 'email',
            companyId,
            conversationId: sent.conversationId,
            createdAt: new Date(Date.now() + tick),
            direction: 'inbound',
            mailMessageId: mail?.id ?? null,
            senderAddress: params.from,
          })
        }
        await receive({
          dkimResult: 'aligned',
          from: 'Ana@Empresa.example.test',
          to: ['resposta@reply.example.test', 'compras@alfa.example.test'],
        })
        await receive({
          dkimResult: 'aligned',
          from: ANA_ADDRESS,
          to: ['resposta@reply.example.test'],
        })
        await receive({
          dkimResult: 'not_aligned',
          from: ANA_ADDRESS,
          to: ['resposta@reply.example.test'],
        })
        await receive({
          dkimResult: 'aligned',
          from: 'intruso@outra.example.test',
          to: ['resposta@reply.example.test'],
        })

        const outboundBefore = await database.db
          .select({ id: contractorMailMessages.id })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.direction, 'outbound'))
        const outboxBefore = await database.db
          .select({ id: contractorMailOutbox.id })
          .from(contractorMailOutbox)
        const view = await findOccurrenceConversations(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })
        const identities = view?.conversations[0]?.messages
          .filter((message) => message.direction === 'inbound')
          .map((message) =>
            message.author.kind === 'contractor' ? message.author.identity : undefined,
          )

        expect(identities?.[0]).toEqual({
          arrivedAs: 'Ana@Empresa.example.test',
          kind: 'internal',
          name: 'Ana',
          reachedContractor: true,
          userId: anaId,
        })
        expect(identities?.[1]).toMatchObject({ kind: 'internal', reachedContractor: false })
        expect(identities?.[2]).toMatchObject({ kind: 'unknown', unverified: true })
        expect(identities?.[3]).toMatchObject({ kind: 'unknown', unverified: false })
        expect(
          await database.db
            .select({ id: contractorMailMessages.id })
            .from(contractorMailMessages)
            .where(eq(contractorMailMessages.direction, 'outbound')),
        ).toEqual(outboundBefore)
        expect(
          await database.db.select({ id: contractorMailOutbox.id }).from(contractorMailOutbox),
        ).toEqual(outboxBefore)
      })
    },
    90_000,
  )
})
