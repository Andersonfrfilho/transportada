/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4 (ADR-0101), contra Postgres real — volume e isolamento:
 * - paginação da lista por cursor e das mensagens por `before`/`limit`;
 * - ler marca só o assunto pedido, e o `unreadCount` acompanha;
 * - o número de consultas da lista não cresce com o número de conversas (sem N+1);
 * - as rotas antigas da conversa de ocorrência devolvem a mesma resposta antes e depois de existir
 *   conversa de nota e de viagem.
 */
import { describe, expect } from 'bun:test'
import { asc, eq } from 'drizzle-orm'

import {
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocuments,
} from '../../src/database/database.schema.js'
import {
  createListMyConversationsUseCase,
  createListMyOccurrenceConversationUseCase,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import { UNUSED_ATTACHMENT_STORAGE } from '../fixtures/conversation-attachment.fixture.js'
import {
  countQueries,
  createSubjectHarness,
  firstTripOf,
  insertSubjectMessage,
  SUBJECT_NOW,
} from '../fixtures/driver-subject-conversation-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  seedExtraDocument,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 9, 12, minutes))

async function scenarioWithDocuments(database: TestDatabase, extraDocuments: number) {
  const seeded = await seedMailScenario(database)
  const { company } = seeded
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const actor = { companyId: company.companyId, driverId: company.firstDriverId, driverUserId }
  const tripId = await firstTripOf(database.db, company)
  const links = await database.db
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(eq(tripDocuments.companyId, company.companyId))
  const documentIds = [
    ...links.map((link) => link.id),
    ...(await Promise.all(
      Array.from({ length: extraDocuments }, () =>
        seedExtraDocument(
          database,
          company,
          { documentId: '', stopId: '', tripId },
          { separationStatus: 'loaded' },
        ),
      ),
    )),
  ]
  return { actor, company, documentIds, seeded, tripId }
}

async function conversationIdOf(database: TestDatabase, documentId: string): Promise<string> {
  const [row] = await database.db
    .select({ id: occurrenceConversations.id })
    .from(occurrenceConversations)
    .where(eq(occurrenceConversations.tripDocumentId, documentId))
  if (row === undefined) throw new Error('EXPECTED_CONVERSATION')
  return row.id
}

describe('a conversa por assunto em volume (spec 260 T2.4)', () => {
  testWithPostgres(
    'paginação por cursor, mensagens por before/limit, leitura só do assunto e não lidas',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, company, documentIds } = await scenarioWithDocuments(database, 2)
        const harness = createSubjectHarness(database.db)
        const base = { driverUserId: actor.driverUserId, operatorUserId: company.userId }
        const conversationIds: string[] = []
        for (const [index, documentId] of documentIds.entries()) {
          await harness.open.open({ ...actor, subjectId: documentId, subjectType: 'document' })
          const conversationId = await conversationIdOf(database, documentId)
          conversationIds.push(conversationId)
          await insertSubjectMessage(database.db, {
            ...base,
            body: `nota ${String(index)}`,
            conversationId,
            createdAt: at(index * 10 + 1),
            direction: 'outbound',
          })
        }

        const firstPage = await harness.unitOfWork.execute((transaction) =>
          transaction.listMySubjects({ ...actor, cursor: null, limit: 2 }),
        )
        expect(firstPage.hasMore).toBe(true)
        const last = firstPage.rows.at(-1)
        if (last === undefined) throw new Error('EXPECTED_ROW')
        const secondPage = await harness.unitOfWork.execute((transaction) =>
          transaction.listMySubjects({
            ...actor,
            cursor: { createdAt: last.sortAt, id: last.conversationId },
            limit: 2,
          }),
        )
        expect(secondPage.hasMore).toBe(false)
        const walked = [...firstPage.rows, ...secondPage.rows].map((row) => row.conversationId)
        expect(walked).toEqual([...conversationIds].reverse())
        expect(firstPage.rows.map((row) => row.unreadCount)).toEqual([1, 1])

        const target = conversationIds[0] ?? ''
        const ids: string[] = []
        for (let minute = 2; minute <= 6; minute += 1) {
          ids.push(
            await insertSubjectMessage(database.db, {
              ...base,
              body: `m${String(minute)}`,
              conversationId: target,
              createdAt: at(minute),
              direction: minute % 2 === 0 ? 'inbound' : 'outbound',
            }),
          )
        }
        const subject = {
          ...actor,
          subjectId: documentIds[0] ?? '',
          subjectType: 'document' as const,
        }
        const bodies = (messages: readonly { bodyText: string }[]) =>
          messages.map((message) => message.bodyText)
        expect(bodies(await harness.messages.list({ ...subject, limit: 2 }))).toEqual(['m5', 'm6'])
        expect(
          bodies(await harness.messages.list({ ...subject, before: ids[3] ?? '', limit: 2 })),
        ).toEqual(['m3', 'm4'])
        expect(
          bodies(await harness.messages.list({ ...subject, before: ids[1] ?? '', limit: 5 })),
        ).toEqual(['nota 0', 'm2'])
        expect(bodies(await harness.messages.list(subject))).toEqual([
          'nota 0',
          'm2',
          'm3',
          'm4',
          'm5',
          'm6',
        ])

        const statuses = async (conversationId: string) =>
          (
            await database.db
              .select({ status: occurrenceConversationMessages.status })
              .from(occurrenceConversationMessages)
              .where(eq(occurrenceConversationMessages.conversationId, conversationId))
              .orderBy(asc(occurrenceConversationMessages.createdAt))
          ).flatMap((row) => row.status ?? [])
        const untouched = conversationIds[1] ?? ''
        expect(new Set(await statuses(target))).toEqual(new Set(['delivered']))
        expect(new Set(await statuses(untouched))).toEqual(new Set(['queued']))
        await harness.markRead.markRead(subject)
        expect(new Set(await statuses(target))).toEqual(new Set(['read']))
        expect(new Set(await statuses(untouched))).toEqual(new Set(['queued']))
        const after = await harness.unitOfWork.execute((transaction) =>
          transaction.listMySubjects({ ...actor, cursor: null, limit: 10 }),
        )
        const unread = new Map(after.rows.map((row) => [row.conversationId, row.unreadCount]))
        expect(unread.get(target)).toBe(0)
        expect(unread.get(untouched)).toBe(1)
      })
    },
    120_000,
  )

  testWithPostgres(
    'o número de consultas da lista é o mesmo com 1, 10 e 30 conversas',
    async () => {
      await withConversationDatabase(async (database) => {
        const measured: Record<number, number> = {}
        for (const size of [1, 10, 30]) {
          const { actor, company, documentIds } = await scenarioWithDocuments(database, size - 1)
          const seeding = createSubjectHarness(database.db)
          for (const [index, documentId] of documentIds.entries()) {
            await seeding.open.open({ ...actor, subjectId: documentId, subjectType: 'document' })
            await insertSubjectMessage(database.db, {
              body: 'Pode aguardar?',
              conversationId: await conversationIdOf(database, documentId),
              createdAt: at(index),
              direction: 'outbound',
              driverUserId: actor.driverUserId,
              operatorUserId: company.userId,
            })
          }
          const meter = countQueries(database.db)
          const page = await createSubjectHarness(meter.counted).list.list({
            ...actor,
            cursor: null,
          })
          expect(page.data).toHaveLength(size)
          measured[size] = meter.queries()
        }
        /** 1 da lista + 1 busca em lote da nota + 1 leitura e 1 escrita do "entregue ao baixar". */
        expect(measured).toEqual({ 1: 4, 10: 4, 30: 4 })
      })
    },
    240_000,
  )

  testWithPostgres(
    'misturando nota, viagem e ocorrência a lista segue em no máximo 4 buscas em lote',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, company, documentIds, seeded, tripId } = await scenarioWithDocuments(
          database,
          4,
        )
        const seeding = createSubjectHarness(database.db)
        for (const documentId of documentIds) {
          await seeding.open.open({ ...actor, subjectId: documentId, subjectType: 'document' })
        }
        await seeding.open.open({ ...actor, subjectId: tripId, subjectType: 'trip' })
        await database.db.insert(occurrenceConversations).values({
          companyId: company.companyId,
          driverUserId: actor.driverUserId,
          occurrenceId: seeded.occurrenceId,
          occurrenceKind: 'document',
          participant: 'driver',
        })
        const meter = countQueries(database.db)
        const page = await createSubjectHarness(meter.counted).list.list({ ...actor, cursor: null })
        expect(page.data).toHaveLength(documentIds.length + 2)
        /** 1 principal + 3 buscas (nota, viagem, ocorrência de nota) + a leitura das mensagens a entregar. */
        expect(meter.queries()).toBeLessThanOrEqual(1 + 4 + 2)
      })
    },
    120_000,
  )

  testWithPostgres(
    'as rotas antigas devolvem a mesma resposta antes e depois de existir conversa de nota e de viagem',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, company, documentIds, seeded, tripId } = await scenarioWithDocuments(
          database,
          0,
        )
        const [occurrenceConversation] = await database.db
          .insert(occurrenceConversations)
          .values({
            companyId: company.companyId,
            driverUserId: actor.driverUserId,
            occurrenceId: seeded.occurrenceId,
            occurrenceKind: 'document',
            participant: 'driver',
          })
          .returning({ id: occurrenceConversations.id })
        if (occurrenceConversation === undefined) throw new Error('EXPECTED_CONVERSATION')
        const base = { driverUserId: actor.driverUserId, operatorUserId: company.userId }
        await insertSubjectMessage(database.db, {
          ...base,
          body: 'Pode aguardar?',
          conversationId: occurrenceConversation.id,
          createdAt: at(1),
          direction: 'outbound',
        })
        await insertSubjectMessage(database.db, {
          ...base,
          body: 'Aguardo sim.',
          conversationId: occurrenceConversation.id,
          createdAt: at(2),
          direction: 'inbound',
        })

        const oldUnitOfWork = createDrizzleDriverConversationUnitOfWork(database.db)
        const inbox = createListMyConversationsUseCase({
          clock: () => SUBJECT_NOW,
          unitOfWork: oldUnitOfWork,
        })
        const messages = createListMyOccurrenceConversationUseCase({
          clock: () => SUBJECT_NOW,
          storage: UNUSED_ATTACHMENT_STORAGE,
          unitOfWork: oldUnitOfWork,
        })
        const snapshot = async () =>
          JSON.stringify({
            inbox: await inbox.list({
              companyId: actor.companyId,
              driverUserId: actor.driverUserId,
            }),
            messages: await messages.list({ ...actor, occurrenceId: seeded.occurrenceId }),
          })
        const before = await snapshot()

        const harness = createSubjectHarness(database.db)
        await harness.open.open({
          ...actor,
          subjectId: documentIds[0] ?? '',
          subjectType: 'document',
        })
        await harness.open.open({ ...actor, subjectId: tripId, subjectType: 'trip' })
        const documentConversationId = await conversationIdOf(database, documentIds[0] ?? '')
        await insertSubjectMessage(database.db, {
          ...base,
          body: 'Da nota',
          conversationId: documentConversationId,
          createdAt: at(30),
          direction: 'outbound',
        })
        expect(await snapshot()).toBe(before)
      })
    },
    90_000,
  )
})
