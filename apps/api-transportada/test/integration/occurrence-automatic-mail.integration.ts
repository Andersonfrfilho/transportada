/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T802, contra Postgres real: a ocorrência de um tipo com `emails_contractor` avisa a
 * contratante sozinha. O e-mail da 143 nasce sem ator e com o evento no outbox; a mensagem da conversa
 * nasce `automatic`, sem autor humano, e a leitura a mostra como aviso automático. O aviso é um por
 * ocorrência — reprocessar não duplica —, e o tipo sem o envio ligado não manda nada.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  contractorMailMessages,
  contractorMailOutbox,
  occurrenceConversationMessages,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { findOccurrenceConversations } from '../../src/occurrence-conversation/infrastructure/occurrence-conversation.query.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

async function setEmailsContractor(database: TestDatabase, seeded: Seeded, value: boolean) {
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({ emailsContractor: value })
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, seeded.company.companyId),
        eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''),
      ),
    )
}

function automaticMail(database: TestDatabase) {
  return createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  })
}

describe('o aviso automático à contratante contra Postgres (spec 183 T802)', () => {
  testWithPostgres(
    'tipo ligado: e-mail da 143 sem ator, outbox, mensagem automática; uma vez só',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await setEmailsContractor(database, seeded, true)
        const useCase = automaticMail(database)
        const run = () =>
          useCase.send({
            companyId,
            correlationId: 'correlation-auto-1',
            occurrenceId: seeded.occurrenceId,
          })

        const first = await run()
        expect(first).toMatchObject({ outcome: 'sent' })
        expect(await run()).toEqual(first)

        const mails = await database.db
          .select({
            actorUserId: contractorMailMessages.actorUserId,
            id: contractorMailMessages.id,
            subject: contractorMailMessages.subject,
          })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.companyId, companyId))
        expect(mails).toHaveLength(1)
        expect(mails[0]).toMatchObject({
          actorUserId: null,
          subject: expect.stringMatching(/^Ocorrência — NF /u),
        })
        const outbox = await database.db
          .select({ id: contractorMailOutbox.id })
          .from(contractorMailOutbox)
          .where(eq(contractorMailOutbox.messageId, mails[0]?.id ?? ''))
        expect(outbox).toHaveLength(1)

        const messages = await database.db
          .select({
            authorUserId: occurrenceConversationMessages.authorUserId,
            automatic: occurrenceConversationMessages.automatic,
            status: occurrenceConversationMessages.status,
          })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.companyId, companyId))
        expect(messages).toEqual([{ authorUserId: null, automatic: true, status: 'queued' }])

        const view = await findOccurrenceConversations(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
          userId: seeded.company.userId,
        })
        const contractor = view?.conversations.find((item) => item.participant === 'contractor')
        expect(contractor?.messages.map((message) => message.author)).toEqual([
          { kind: 'automatic' },
        ])
      })
    },
    30_000,
  )

  testWithPostgres(
    'tipo desligado não manda nada',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)

        expect(
          await automaticMail(database).send({
            companyId: seeded.company.companyId,
            correlationId: 'correlation-auto-2',
            occurrenceId: seeded.occurrenceId,
          }),
        ).toEqual({ outcome: 'skipped', reason: 'type_off' })
        const messages = await database.db
          .select({ id: occurrenceConversationMessages.id })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.companyId, seeded.company.companyId))
        expect(messages).toEqual([])
      })
    },
    30_000,
  )

  testWithPostgres(
    'o banco recusa a enviada sem autor que não é aviso automático',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setEmailsContractor(database, seeded, true)
        await automaticMail(database).send({
          companyId: seeded.company.companyId,
          correlationId: 'correlation-auto-3',
          occurrenceId: seeded.occurrenceId,
        })

        const flip = async () => {
          await database.db
            .update(occurrenceConversationMessages)
            .set({ automatic: false })
            .where(eq(occurrenceConversationMessages.companyId, seeded.company.companyId))
        }
        await expect(flip()).rejects.toThrow()
      })
    },
    30_000,
  )

  testWithPostgres(
    'C3: aviso automático e envio manual ao mesmo tempo, na primeira mensagem, criam uma thread só',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await setEmailsContractor(database, seeded, true)

        const [automatic, manual] = await Promise.allSettled([
          automaticMail(database).send({
            companyId,
            correlationId: 'correlation-race-1',
            occurrenceId: seeded.occurrenceId,
          }),
          createOccurrenceMailUseCase(database).send({
            actorUserId: seeded.company.userId,
            bodyText: 'Mandamos a foto em seguida.',
            companyId,
            contactIds: seeded.contactIds.slice(0, 1),
            correlationId: 'correlation-race-2',
            idempotencyKey: 'race-manual-key-0001',
            occurrenceId: seeded.occurrenceId,
            subject: 'Ocorrência',
          }),
        ])

        expect(automatic.status).toBe('fulfilled')
        expect(manual.status).toBe('fulfilled')
        const threads = await database.db
          .select({ id: contractorMailMessages.threadId })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.companyId, companyId))
        expect(new Set(threads.map((row) => row.id)).size).toBe(1)
        expect(threads).toHaveLength(2)
      })
    },
    30_000,
  )
})
