/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.4b (CA01), contra Postgres real: o aviso automático sai pelos caminhos de entrada que a
 * API usa de verdade — o gancho `announce` depois do commit (app e WhatsApp) e a rota do robô da
 * varredura — e em todos abre o retorno da contratante uma vez só, com o prazo do momento do envio.
 */
import { describe, expect } from 'bun:test'
import { eq, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  occurrenceContractorReplies,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createAutomaticOccurrenceMailHook } from '../../src/occurrence-conversation/application/automatic-occurrence-mail.hook.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const SEND_MOMENT = new Date('2026-09-24T18:00:00.000Z')
const WAIT_HOURS = 6

const SILENT_LOGGER = { error: () => undefined, info: () => undefined }

async function enableReplyOpening(database: TestDatabase, seeded: Seeded): Promise<void> {
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({
      contractorReplyMode: 'forward_automatic',
      contractorReplyWaitHours: WAIT_HOURS,
      driverReplyTemplate: 'Segue o boleto prorrogado.',
      emailsContractor: true,
    })
    .where(eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''))
}

function buildUseCase(database: TestDatabase) {
  return createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  })
}

async function repliesOf(database: TestDatabase, seeded: Seeded) {
  return database.db
    .select({
      deadlineAt: occurrenceContractorReplies.deadlineAt,
      status: occurrenceContractorReplies.status,
    })
    .from(occurrenceContractorReplies)
    .where(eq(occurrenceContractorReplies.companyId, seeded.company.companyId))
}

async function outboxCount(database: TestDatabase, seeded: Seeded): Promise<number> {
  const rows = await database.db.execute(
    sql`select count(*)::int as total from contractor_mail_outbox where company_id = ${seeded.company.companyId}`,
  )
  return Number((rows as unknown as readonly { total: number }[])[0]?.total ?? 0)
}

describe('o aviso automático pelos caminhos de entrada (spec 248 T4.4b, CA01)', () => {
  testWithPostgres(
    'o gancho depois do commit (app e WhatsApp) manda o aviso e abre o retorno com o prazo do envio',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await enableReplyOpening(database, seeded)
        const hook = createAutomaticOccurrenceMailHook({
          logger: SILENT_LOGGER,
          useCase: buildUseCase(database),
        })

        hook.announce({ companyId: seeded.company.companyId, occurrenceIds: [seeded.occurrenceId] })
        hook.announce({ companyId: seeded.company.companyId, occurrenceIds: [seeded.occurrenceId] })
        await hook.settled()

        const [reply, ...others] = await repliesOf(database, seeded)
        expect(others).toEqual([])
        expect(reply?.status).toBe('awaiting_contractor')
        expect(reply?.deadlineAt).toEqual(new Date(SEND_MOMENT.getTime() + WAIT_HOURS * 3_600_000))
        expect(await outboxCount(database, seeded)).toBeGreaterThan(0)
      })
    },
    30_000,
  )

  testWithPostgres(
    'a varredura envia pelo mesmo caso de uso da rota do robô, uma vez só; a repetição reaproveita o envio gravado',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await enableReplyOpening(database, seeded)
        const useCase = buildUseCase(database)
        const send = () =>
          useCase.send({
            companyId: seeded.company.companyId,
            correlationId: 'sweep-correlation',
            occurrenceId: seeded.occurrenceId,
          })

        expect((await send()).outcome).toBe('sent')
        const outboxAfterFirstSend = await outboxCount(database, seeded)
        expect((await send()).outcome).toBe('sent')

        expect(await outboxCount(database, seeded)).toBe(outboxAfterFirstSend)
        expect((await repliesOf(database, seeded)).length).toBe(1)
      })
    },
    30_000,
  )
})
