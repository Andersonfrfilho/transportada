/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T505 (RF9), contra Postgres real: a fila lista a mensagem sem conversa com as candidatas
 * (conversas abertas da contratante daquele número) e a última mensagem da operação em cada uma;
 * atribuir grava a mensagem na conversa escolhida com o horário em que chegou, uma vez só; outra
 * empresa não vê nem atribui.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  contractorContacts,
  occurrenceConversationMessages,
  occurrenceConversations,
  occurrenceConversationUnassigned,
  tripOccurrenceCases,
} from '../../src/database/database.schema.js'
import { createAssignUnassignedMessageUseCase } from '../../src/occurrence-conversation/application/occurrence-conversation-unassigned.use-case.js'
import {
  createDrizzleOccurrenceConversationUnassignedReader,
  createDrizzleOccurrenceConversationUnassignedUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-conversation-unassigned.repository.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'

const PHONE = '5511987654321'

async function failure(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work()
  } catch (error) {
    return error
  }
  return undefined
}

describe('a fila de mensagens sem conversa contra Postgres (spec 183 T505)', () => {
  testWithPostgres(
    'lista com as candidatas, atribui uma vez só e outra empresa não alcança',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedCompany(database)
        const { companyId, userId } = seeded.company
        await database.db
          .update(contractorContacts)
          .set({ phone: PHONE, whatsappOptInAt: new Date(), whatsappOptInByUserId: userId })
          .where(eq(contractorContacts.id, seeded.contactIds[0] ?? ''))
        const sent = await createOccurrenceMailUseCase(database).send({
          actorUserId: userId,
          bodyText: 'Autorizam a descarga?',
          companyId,
          contactIds: seeded.contactIds.slice(0, 1),
          correlationId: 'correlation-1',
          idempotencyKey: 'conversation-unassigned-01',
          occurrenceId: seeded.occurrenceId,
          subject: 'Ocorrência',
        })
        const [first] = await database.db
          .select({ contractorId: occurrenceConversations.contractorId })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.id, sent.conversationId))
        const [second] = await database.db
          .insert(occurrenceConversations)
          .values({
            companyId,
            contractorId: first?.contractorId ?? null,
            occurrenceId: crypto.randomUUID(),
            occurrenceKind: 'document',
            participant: 'contractor',
            publicRef: `ref${crypto.randomUUID().replaceAll('-', '')}`,
          })
          .returning({ id: occurrenceConversations.id })
        const receivedAt = new Date('2026-09-24T15:00:00.000Z')
        const [unassigned] = await database.db
          .insert(occurrenceConversationUnassigned)
          .values({
            bodyText: 'Qual das duas?',
            channel: 'whatsapp',
            companyId,
            providerMessageId: 'wamid.in-1',
            receivedAt,
            senderAddress: '551187654321',
          })
          .returning({ id: occurrenceConversationUnassigned.id })

        const reader = createDrizzleOccurrenceConversationUnassignedReader(database.db)
        const [pending] = await reader.listPending({ companyId })
        expect(pending?.senderAddress).toBe('551187654321')
        expect(pending?.candidates.map((candidate) => candidate.conversationId).sort()).toEqual(
          [sent.conversationId, second?.id ?? ''].sort(),
        )
        expect(
          pending?.candidates.find((candidate) => candidate.conversationId === sent.conversationId)
            ?.lastOutbound?.preview,
        ).toContain('Autorizam a descarga?')
        expect(await reader.listPending({ companyId: other.companyId })).toEqual([])

        const assign = createAssignUnassignedMessageUseCase({
          clock: () => new Date('2026-09-24T16:00:00.000Z'),
          unitOfWork: createDrizzleOccurrenceConversationUnassignedUnitOfWork(database.db),
        })
        const input = {
          companyId,
          conversationId: second?.id ?? '',
          unassignedId: unassigned?.id ?? '',
          userId,
        }
        expect(
          await failure(() => assign.assign({ ...input, companyId: other.companyId })),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_UNASSIGNED_NOT_FOUND' })
        expect(
          await failure(() => assign.assign({ ...input, conversationId: crypto.randomUUID() })),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_ASSIGNMENT_INVALID' })

        const result = await assign.assign(input)
        expect(await failure(() => assign.assign(input))).toMatchObject({
          code: 'OCCURRENCE_CONVERSATION_ALREADY_ASSIGNED',
        })

        const messages = await database.db
          .select({
            conversationId: occurrenceConversationMessages.conversationId,
            createdAt: occurrenceConversationMessages.createdAt,
            senderAddress: occurrenceConversationMessages.senderAddress,
          })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.id, result.messageId))
        expect(messages).toEqual([
          {
            conversationId: second?.id ?? '',
            createdAt: receivedAt,
            senderAddress: '551187654321',
          },
        ])
        expect(await reader.listPending({ companyId })).toEqual([])
      })
    },
    30_000,
  )

  /**
   * Spec 183 T903 (achado C2): a ocorrência cuja tratativa chegou a estado terminal sai das
   * candidatas — nenhuma conversa fecha, e sem isso a lista crescia para sempre. A conversa que só
   * foi criada continua candidata na escolha do operador.
   */
  testWithPostgres(
    'C2: ocorrência com a tratativa encerrada sai das candidatas',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, userId } = seeded.company
        await database.db
          .update(contractorContacts)
          .set({ phone: PHONE, whatsappOptInAt: new Date(), whatsappOptInByUserId: userId })
          .where(eq(contractorContacts.id, seeded.contactIds[0] ?? ''))
        const sent = await createOccurrenceMailUseCase(database).send({
          actorUserId: userId,
          bodyText: 'Autorizam a descarga?',
          companyId,
          contactIds: seeded.contactIds.slice(0, 1),
          correlationId: 'correlation-c2',
          idempotencyKey: 'conversation-unassigned-c2',
          occurrenceId: seeded.occurrenceId,
          subject: 'Ocorrência',
        })
        const [first] = await database.db
          .select({ contractorId: occurrenceConversations.contractorId })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.id, sent.conversationId))
        const [created] = await database.db
          .insert(occurrenceConversations)
          .values({
            companyId,
            contractorId: first?.contractorId ?? null,
            occurrenceId: crypto.randomUUID(),
            occurrenceKind: 'document',
            participant: 'contractor',
            publicRef: `ref${crypto.randomUUID().replaceAll('-', '')}`,
          })
          .returning({ id: occurrenceConversations.id })
        await database.db.insert(occurrenceConversationUnassigned).values({
          bodyText: 'Qual das duas?',
          channel: 'whatsapp',
          companyId,
          providerMessageId: 'wamid.c2',
          receivedAt: new Date('2026-09-24T15:00:00.000Z'),
          senderAddress: PHONE,
        })
        const reader = createDrizzleOccurrenceConversationUnassignedReader(database.db)
        const candidates = async () =>
          ((await reader.listPending({ companyId }))[0]?.candidates ?? [])
            .map((candidate) => candidate.conversationId)
            .sort()
        expect(await candidates()).toEqual([sent.conversationId, created?.id ?? ''].sort())

        const [existingCase] = await database.db
          .select({ id: tripOccurrenceCases.id })
          .from(tripOccurrenceCases)
          .where(eq(tripOccurrenceCases.occurrenceId, seeded.occurrenceId))
        if (existingCase === undefined) {
          await database.db.insert(tripOccurrenceCases).values({
            companyId,
            occurrenceId: seeded.occurrenceId,
            redeliveryPolicy: 'blocked',
            resolvedAt: new Date(),
            status: 'returned_to_warehouse',
          })
        } else {
          await database.db
            .update(tripOccurrenceCases)
            .set({ resolvedAt: new Date(), status: 'returned_to_warehouse' })
            .where(eq(tripOccurrenceCases.id, existingCase.id))
        }
        expect(await candidates()).toEqual([created?.id ?? ''])
      })
    },
    30_000,
  )
})
