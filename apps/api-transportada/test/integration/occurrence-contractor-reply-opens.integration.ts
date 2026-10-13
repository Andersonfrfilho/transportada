/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.4a, contra Postgres real: o aviso automático à contratante abre o retorno dela. A linha
 * `awaiting_contractor` nasce na transação do envio, com a cópia da configuração efetiva e o prazo
 * o momento do envio mais `wait_hours`; envio que falha não deixa retorno. Só a configuração decide: a exceção da
 * contratante muda modo, prazo e encaminhamento só da ocorrência dela, e o nome do tipo não entra.
 */
import { describe, expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypes,
  contractors,
  occurrenceContractorReplies,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
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

function hoursAfterSend(hours: number): Date {
  return new Date(SEND_MOMENT.getTime() + hours * 3_600_000)
}

type TypeSettings = {
  readonly mode: 'forward_after_approval' | 'forward_automatic' | 'off'
  readonly name?: string
  readonly waitHours: number | null
}

async function configureType(database: TestDatabase, seeded: Seeded, settings: TypeSettings) {
  const { companyId } = seeded.company
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({
      contractorReplyMode: settings.mode,
      contractorReplyWaitHours: settings.waitHours,
      driverReplyTemplate: 'Segue o boleto prorrogado.',
      emailsContractor: true,
      ...(settings.name === undefined ? {} : { name: settings.name }),
    })
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''),
      ),
    )
  return occurrence?.typeId ?? ''
}

async function contractorIdOf(database: TestDatabase, seeded: Seeded): Promise<string> {
  const [row] = await database.db
    .select({ id: contractors.id })
    .from(contractors)
    .where(eq(contractors.companyId, seeded.company.companyId))
  return row?.id ?? ''
}

async function sendAutomatic(database: TestDatabase, seeded: Seeded) {
  return createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  }).send({
    companyId: seeded.company.companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
  })
}

async function repliesOf(database: TestDatabase, seeded: Seeded) {
  return database.db
    .select({
      config: occurrenceContractorReplies.config,
      deadlineAt: occurrenceContractorReplies.deadlineAt,
      status: occurrenceContractorReplies.status,
    })
    .from(occurrenceContractorReplies)
    .where(eq(occurrenceContractorReplies.companyId, seeded.company.companyId))
}

describe('o aviso automático abre o retorno da contratante (spec 248 T4.4a, CA01)', () => {
  testWithPostgres(
    'modo ligado: retorno awaiting_contractor, prazo = momento do envio + espera, cópia da configuração; uma vez só',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await configureType(database, seeded, { mode: 'forward_automatic', waitHours: 6 })

        await sendAutomatic(database, seeded)
        await sendAutomatic(database, seeded)

        const [reply, ...others] = await repliesOf(database, seeded)
        expect(others).toEqual([])
        expect(reply?.status).toBe('awaiting_contractor')
        expect(reply?.config).toMatchObject({
          driverReplyTemplate: 'Segue o boleto prorrogado.',
          mode: 'forward_automatic',
          version: 1,
          waitHours: 6,
        })
        expect(reply?.deadlineAt).toEqual(hoursAfterSend(6))
      })
    },
    30_000,
  )

  testWithPostgres(
    'modo desligado não abre retorno',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await configureType(database, seeded, { mode: 'off', waitHours: null })

        await sendAutomatic(database, seeded)

        expect(await repliesOf(database, seeded)).toEqual([])
      })
    },
    30_000,
  )

  testWithPostgres(
    'envio que falha no outbox não deixa retorno',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await configureType(database, seeded, { mode: 'forward_automatic', waitHours: 6 })
        await database.db.execute(sql`
          CREATE OR REPLACE FUNCTION fail_outbox_insert() RETURNS trigger AS $$
          BEGIN RAISE EXCEPTION 'outbox down'; END $$ LANGUAGE plpgsql`)
        await database.db.execute(sql`
          CREATE TRIGGER fail_outbox_insert BEFORE INSERT ON contractor_mail_outbox
          FOR EACH ROW EXECUTE FUNCTION fail_outbox_insert()`)

        await expect(sendAutomatic(database, seeded)).rejects.toThrow()

        expect(await repliesOf(database, seeded)).toEqual([])
      })
    },
    30_000,
  )
})

describe('só a configuração decide o retorno (spec 248 T4.4a, CA04)', () => {
  testWithPostgres(
    'mesmo nome, configuração diferente: cópia diferente; nome diferente, mesma configuração: cópia igual',
    async () => {
      await withConversationDatabase(async (database) => {
        const first = await seedMailScenario(database)
        const second = await seedMailScenario(database)
        const third = await seedMailScenario(database)
        await configureType(database, first, {
          mode: 'forward_automatic',
          name: 'Prorrogação',
          waitHours: 4,
        })
        await configureType(database, second, {
          mode: 'forward_after_approval',
          name: 'Prorrogação',
          waitHours: 12,
        })
        await configureType(database, third, {
          mode: 'forward_automatic',
          name: 'Outro nome qualquer',
          waitHours: 4,
        })

        await sendAutomatic(database, first)
        await sendAutomatic(database, second)
        await sendAutomatic(database, third)

        const [firstReply] = await repliesOf(database, first)
        const [secondReply] = await repliesOf(database, second)
        const [thirdReply] = await repliesOf(database, third)
        expect(firstReply?.config).not.toEqual(secondReply?.config)
        expect(firstReply?.config).toEqual(thirdReply?.config)
      })
    },
    60_000,
  )

  testWithPostgres(
    'a exceção da contratante muda modo, prazo e encaminhamento só da ocorrência dela',
    async () => {
      await withConversationDatabase(async (database) => {
        const withOverride = await seedMailScenario(database)
        const without = await seedMailScenario(database)
        const typeId = await configureType(database, withOverride, {
          mode: 'forward_after_approval',
          waitHours: 6,
        })
        await configureType(database, without, { mode: 'forward_after_approval', waitHours: 6 })
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          companyId: withOverride.company.companyId,
          contractorId: await contractorIdOf(database, withOverride),
          contractorReplyMode: 'forward_automatic',
          contractorReplyWaitHours: 2,
          forwardToNoteRecipient: 'off',
          occurrenceTypeId: typeId,
        })

        await sendAutomatic(database, withOverride)
        await sendAutomatic(database, without)

        const [overridden] = await repliesOf(database, withOverride)
        const [inherited] = await repliesOf(database, without)
        expect(overridden?.config).toMatchObject({ mode: 'forward_automatic', waitHours: 2 })
        expect(inherited?.config).toMatchObject({ mode: 'forward_after_approval', waitHours: 6 })
        expect(overridden?.deadlineAt).toEqual(hoursAfterSend(2))
      })
    },
    60_000,
  )
})
