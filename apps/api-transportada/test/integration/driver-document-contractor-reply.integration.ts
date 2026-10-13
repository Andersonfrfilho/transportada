/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T5.4, contra Postgres real: a leitura do estado do retorno para o app do motorista. Só entra a
 * ocorrência que abriu retorno, nas notas pedidas e na empresa do contexto; sai o id e o estado, e nada do que a
 * linha do retorno guarda (configuração, nota do operador, anexo, prazo).
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { DrizzleDriverDocumentContractorReplyRepository } from '../../src/trips/infrastructure/drizzle-driver-document-contractor-reply.repository.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

async function readOccurrenceRow(database: TestDatabase, seeded: Seeded) {
  const [row] = await database.db
    .select({
      documentId: tripDocumentOccurrences.tripDocumentId,
      typeId: tripDocumentOccurrences.occurrenceTypeId,
    })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (row?.documentId === null || row?.documentId === undefined) {
    throw new Error('EXPECTED_DOCUMENT_OCCURRENCE')
  }
  return { documentId: row.documentId, typeId: row.typeId }
}

async function openReply(database: TestDatabase, seeded: Seeded, typeId: string): Promise<void> {
  const { companyId } = seeded.company
  await database.db
    .update(companyOccurrenceTypes)
    .set({
      contractorReplyMode: 'forward_after_approval',
      contractorReplyWaitHours: 6,
      driverReplyTemplate: 'Segue o boleto prorrogado.',
      emailsContractor: true,
    })
    .where(
      and(eq(companyOccurrenceTypes.companyId, companyId), eq(companyOccurrenceTypes.id, typeId)),
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

describe('o estado do retorno nas notas do motorista (spec 248 T5.4)', () => {
  testWithPostgres(
    'sem retorno nada sai; com retorno sai só o id e o estado; outra empresa e outra nota não alcançam',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const { documentId, typeId } = await readOccurrenceRow(database, seeded)
        const repository = new DrizzleDriverDocumentContractorReplyRepository(database.db)

        expect(await repository.list({ companyId, documentIds: [documentId] })).toEqual([])

        await openReply(database, seeded, typeId)

        const replies = await repository.list({ companyId, documentIds: [documentId] })
        expect(replies).toEqual([
          { documentId, occurrenceId: seeded.occurrenceId, status: 'awaiting_contractor' },
        ])
        expect(Object.keys(replies[0] ?? {}).sort()).toEqual([
          'documentId',
          'occurrenceId',
          'status',
        ])
        expect(
          await repository.list({ companyId: crypto.randomUUID(), documentIds: [documentId] }),
        ).toEqual([])
        expect(await repository.list({ companyId, documentIds: [crypto.randomUUID()] })).toEqual([])
        expect(await repository.list({ companyId, documentIds: [] })).toEqual([])
      })
    },
  )
})
