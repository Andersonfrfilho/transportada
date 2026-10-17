/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.6 (ADR-0106), contra Postgres real: o e-mail da ocorrência sai do modelo efetivo — a exceção da
 * contratante da nota, senão o do tipo. Sem modelo efetivo não sai e-mail, automático ou manual, e a mensagem
 * gravada aponta para o modelo que a escreveu (`template_id`).
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypes,
  contractorMailMessages,
  contractors,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { OccurrenceMailTemplateMissingError } from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import {
  createAutomaticOccurrenceMailReader,
  createOccurrenceMailReader,
} from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedOccurrenceMailTemplate } from '../fixtures/occurrence-mail-template.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 90_000

async function typeIdOf(database: TestDatabase, seeded: Seeded): Promise<string> {
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (occurrence?.typeId === null || occurrence === undefined) throw new Error('TYPE_EXPECTED')
  return occurrence.typeId
}

async function contractorIdOf(database: TestDatabase, seeded: Seeded): Promise<string> {
  const [contractor] = await database.db
    .select({ id: contractors.id })
    .from(contractors)
    .where(eq(contractors.companyId, seeded.company.companyId))
  if (contractor === undefined) throw new Error('CONTRACTOR_EXPECTED')
  return contractor.id
}

async function setType(
  database: TestDatabase,
  seeded: Seeded,
  changes: Partial<typeof companyOccurrenceTypes.$inferInsert>,
): Promise<void> {
  await database.db
    .update(companyOccurrenceTypes)
    .set(changes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, seeded.company.companyId),
        eq(companyOccurrenceTypes.id, await typeIdOf(database, seeded)),
      ),
    )
}

async function chooseForContractor(
  database: TestDatabase,
  seeded: Seeded,
  contractorMailTemplateId: null | string,
): Promise<void> {
  await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
    attachmentMode: 'optional',
    companyId: seeded.company.companyId,
    contractorId: await contractorIdOf(database, seeded),
    contractorMailTemplateId,
    occurrenceTypeId: await typeIdOf(database, seeded),
  })
}

function automaticMail(database: TestDatabase) {
  return createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  })
}

function sendAutomatic(database: TestDatabase, seeded: Seeded) {
  return automaticMail(database).send({
    companyId: seeded.company.companyId,
    correlationId: 'correlation-269',
    occurrenceId: seeded.occurrenceId,
  })
}

function sendManual(database: TestDatabase, seeded: Seeded) {
  return createOccurrenceMailUseCase(database).send({
    actorUserId: seeded.company.userId,
    bodyText: 'Segue a ocorrência.',
    companyId: seeded.company.companyId,
    contactIds: seeded.contactIds.slice(0, 1),
    correlationId: 'correlation-269-manual',
    idempotencyKey: `manual-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
    subject: 'Ocorrência',
  })
}

async function storedMails(database: TestDatabase, seeded: Seeded) {
  return database.db
    .select({
      bodyText: contractorMailMessages.bodyText,
      subject: contractorMailMessages.subject,
      templateId: contractorMailMessages.templateId,
    })
    .from(contractorMailMessages)
    .where(eq(contractorMailMessages.companyId, seeded.company.companyId))
}

const HOUR_MS = 3_600_000

/** A ocorrência semeada nasce agora: uma hora adiante é "a escolha veio depois dela". */
const AFTER_OCCURRENCE = new Date(Date.now() + HOUR_MS)
const BEFORE_OCCURRENCE = new Date(Date.now() - HOUR_MS)

async function setExceptionSelectedAt(
  database: TestDatabase,
  seeded: Seeded,
  selectedAt: Date,
): Promise<void> {
  await database.db
    .update(companyOccurrenceTypeContractorOverrides)
    .set({ contractorMailTemplateSelectedAt: selectedAt })
    .where(eq(companyOccurrenceTypeContractorOverrides.companyId, seeded.company.companyId))
}

describe('o e-mail da ocorrência registrada antes da escolha do modelo (spec 269, decisão de 2026-10-17)', () => {
  testWithPostgres(
    'antes da escolha do tipo: o automático pula e o manual segue; depois: envia',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, {
          contractorMailTemplateSelectedAt: AFTER_OCCURRENCE,
          emailsContractor: true,
        })

        expect(await sendAutomatic(database, seeded)).toEqual({
          outcome: 'skipped',
          reason: 'registered_before_template',
        })
        expect(await storedMails(database, seeded)).toEqual([])
        await sendManual(database, seeded)
        expect(await storedMails(database, seeded)).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'escolha do tipo anterior à ocorrência: o automático envia',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, {
          contractorMailTemplateSelectedAt: BEFORE_OCCURRENCE,
          emailsContractor: true,
        })

        expect(await sendAutomatic(database, seeded)).toMatchObject({ outcome: 'sent' })
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o modelo vem da exceção: vale o momento da exceção, não o do tipo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, {
          contractorMailTemplateSelectedAt: BEFORE_OCCURRENCE,
          emailsContractor: true,
        })
        const exceptionTemplateId = await seedOccurrenceMailTemplate(database, seeded.company, {
          subject: 'Só exceção',
        })
        await chooseForContractor(database, seeded, exceptionTemplateId)
        await setExceptionSelectedAt(database, seeded, AFTER_OCCURRENCE)

        expect(await sendAutomatic(database, seeded)).toEqual({
          outcome: 'skipped',
          reason: 'registered_before_template',
        })

        await setExceptionSelectedAt(database, seeded, BEFORE_OCCURRENCE)
        await setType(database, seeded, { contractorMailTemplateSelectedAt: AFTER_OCCURRENCE })
        expect(await sendAutomatic(database, seeded)).toMatchObject({ outcome: 'sent' })
      })
    },
    TEST_TIMEOUT_MS,
  )
})

describe('o e-mail da ocorrência pelo modelo efetivo (spec 269 T2.6)', () => {
  testWithPostgres(
    'o modelo do tipo escreve o e-mail automático e a mensagem aponta para ele',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, { emailsContractor: true })

        expect(await sendAutomatic(database, seeded)).toMatchObject({ outcome: 'sent' })

        const [typeRow] = await database.db
          .select({ templateId: companyOccurrenceTypes.contractorMailTemplateId })
          .from(companyOccurrenceTypes)
          .where(eq(companyOccurrenceTypes.id, await typeIdOf(database, seeded)))
        const mails = await storedMails(database, seeded)
        expect(mails).toHaveLength(1)
        expect(mails[0]?.subject).toMatch(/^Ocorrência — NF /u)
        expect(mails[0]?.templateId).toBe(typeRow?.templateId ?? 'missing')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a exceção da contratante vence o modelo do tipo; a exceção nula herda o do tipo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, { emailsContractor: true })
        const exceptionTemplateId = await seedOccurrenceMailTemplate(database, seeded.company, {
          closing: 'Obrigado.',
          intro: 'Texto da exceção para {contratante}',
          itemText: '',
          subject: 'Exceção — {numero_nota}',
        })
        await chooseForContractor(database, seeded, exceptionTemplateId)

        expect(await sendAutomatic(database, seeded)).toMatchObject({ outcome: 'sent' })
        const [mail] = await storedMails(database, seeded)
        expect(mail?.subject).toMatch(/^Exceção — /u)
        expect(mail?.bodyText).toContain('Texto da exceção para')
        expect(mail?.templateId).toBe(exceptionTemplateId)

        await database.db
          .update(companyOccurrenceTypeContractorOverrides)
          .set({ contractorMailTemplateId: null })
          .where(eq(companyOccurrenceTypeContractorOverrides.companyId, seeded.company.companyId))
        const effective = await createOccurrenceMailReader(
          database.db,
        ).findEffectiveOccurrenceMailTemplate({
          companyId: seeded.company.companyId,
          contractorId: await contractorIdOf(database, seeded),
          occurrenceId: seeded.occurrenceId,
        })
        expect(effective?.templateId).not.toBe(exceptionTemplateId)
        expect(effective).not.toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'tipo sem modelo e exceção que escolhe um: o e-mail sai pelo modelo da exceção',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, { contractorMailTemplateId: null, emailsContractor: true })
        const exceptionTemplateId = await seedOccurrenceMailTemplate(database, seeded.company, {
          closing: 'Obrigado.',
          intro: 'Só esta contratante',
          itemText: '',
          subject: 'Só exceção',
        })
        await chooseForContractor(database, seeded, exceptionTemplateId)

        expect(await sendAutomatic(database, seeded)).toMatchObject({ outcome: 'sent' })

        expect((await storedMails(database, seeded))[0]).toMatchObject({
          subject: 'Só exceção',
          templateId: exceptionTemplateId,
        })
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'sem modelo efetivo o automático pula e o manual é 409, sem gravar nada',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, { contractorMailTemplateId: null, emailsContractor: true })

        expect(await sendAutomatic(database, seeded)).toEqual({
          outcome: 'skipped',
          reason: 'no_template_selected',
        })
        await expect(sendManual(database, seeded)).rejects.toBeInstanceOf(
          OccurrenceMailTemplateMissingError,
        )
        expect(await storedMails(database, seeded)).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o envio manual grava o modelo efetivo no template_id',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)

        await sendManual(database, seeded)

        const [typeRow] = await database.db
          .select({ templateId: companyOccurrenceTypes.contractorMailTemplateId })
          .from(companyOccurrenceTypes)
          .where(eq(companyOccurrenceTypes.id, await typeIdOf(database, seeded)))
        expect((await storedMails(database, seeded))[0]?.templateId).toBe(
          typeRow?.templateId ?? 'missing',
        )
      })
    },
    TEST_TIMEOUT_MS,
  )
})
