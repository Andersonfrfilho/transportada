/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T5.3, contra Postgres real: o painel lê o retorno da contratante e o operador o marca como tratado.
 * A leitura leva a empresa em toda consulta (ocorrência de outra empresa é "não existe"), o evento não carrega o
 * usuário, e "tratado" é condicional e idempotente: repetir não grava outro evento, e retorno entregue não muda.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  occurrenceContractorReplies,
  occurrenceContractorReplyEvents,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import {
  createDrizzleContractorReplyHandledWriter,
  createDrizzleContractorReplyReader,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-read.repository.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

async function openReply(database: TestDatabase, seeded: Seeded): Promise<void> {
  const { companyId } = seeded.company
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({
      contractorReplyMode: 'forward_after_approval',
      contractorReplyWaitHours: 6,
      driverReplyTemplate: 'Segue o boleto prorrogado.',
      emailsContractor: true,
    })
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''),
      ),
    )
  await createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  }).send({
    companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
  })
}

describe('ler e tratar o retorno da contratante (spec 248 T5.3)', () => {
  testWithPostgres(
    'sem retorno é nulo, de outra empresa é inexistente, e aberto mostra prazo e teto sem dado pessoal',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const reader = createDrizzleContractorReplyReader(database.db)

        expect(
          await reader.findByOccurrence({ companyId, occurrenceId: seeded.occurrenceId }),
        ).toBeNull()
        expect(
          await reader.findByOccurrence({
            companyId: crypto.randomUUID(),
            occurrenceId: seeded.occurrenceId,
          }),
        ).toBeUndefined()

        await openReply(database, seeded)
        const view = await reader.findByOccurrence({ companyId, occurrenceId: seeded.occurrenceId })
        expect(view).toMatchObject({
          alertCount: 0,
          handledNote: null,
          reason: null,
          replyAttachmentId: null,
          status: 'awaiting_contractor',
        })
        expect(view?.alertMaxCount).toBeGreaterThan(0)
        expect(view?.deadlineAt).toBeInstanceOf(Date)
        expect(view?.deliveries).toEqual([])
        expect(JSON.stringify(view)).not.toContain('actorUserId')
      })
    },
  )

  testWithPostgres(
    'tratar grava autor, nota e um evento do usuário; repetir não grava outro; empresa errada não alcança',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, userId } = seeded.company
        await openReply(database, seeded)
        const writer = createDrizzleContractorReplyHandledWriter(database.db)
        const input = {
          actorUserId: userId,
          companyId,
          note: 'Liguei para a contratante; o boleto sai amanhã.',
          now: new Date('2026-10-12T20:00:00.000Z'),
          occurrenceId: seeded.occurrenceId,
        }

        expect(await writer.markHandled({ ...input, companyId: crypto.randomUUID() })).toBe(
          undefined,
        )
        expect(await writer.markHandled(input)).toBe('handled')
        expect(await writer.markHandled({ ...input, note: 'outra nota' })).toBe('already_handled')

        const [reply] = await database.db
          .select()
          .from(occurrenceContractorReplies)
          .where(eq(occurrenceContractorReplies.companyId, companyId))
        expect(reply).toMatchObject({
          handledByUserId: userId,
          handledNote: input.note,
          status: 'handled',
        })
        const events = await database.db
          .select({
            actorKind: occurrenceContractorReplyEvents.actorKind,
            toStatus: occurrenceContractorReplyEvents.toStatus,
          })
          .from(occurrenceContractorReplyEvents)
          .where(eq(occurrenceContractorReplyEvents.replyId, reply?.id ?? ''))
        expect(events.filter((event) => event.toStatus === 'handled')).toEqual([
          { actorKind: 'user', toStatus: 'handled' },
        ])

        const view = await createDrizzleContractorReplyReader(database.db).findByOccurrence({
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(view?.status).toBe('handled')
        expect(view?.handledNote).toBe(input.note)
        expect(view?.events[0]).toMatchObject({ actorKind: 'user', toStatus: 'handled' })
      })
    },
  )

  testWithPostgres('retorno já entregue não vira tratado', async () => {
    await withConversationDatabase(async (database) => {
      const seeded = await seedMailScenario(database)
      const { companyId, userId } = seeded.company
      await openReply(database, seeded)
      await database.db
        .update(occurrenceContractorReplies)
        .set({ status: 'delivered' })
        .where(eq(occurrenceContractorReplies.companyId, companyId))

      const outcome = await createDrizzleContractorReplyHandledWriter(database.db).markHandled({
        actorUserId: userId,
        companyId,
        note: 'tarde demais',
        now: new Date(),
        occurrenceId: seeded.occurrenceId,
      })
      expect(outcome).toBe('not_applicable')
    })
  })
})
