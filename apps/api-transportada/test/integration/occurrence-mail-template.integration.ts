/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.5 (ADR-0108), contra Postgres real: o e-mail da ocorrência sai do modelo do módulo de notificação que
 * o tipo escolheu, pela chave. Sem modelo utilizável não sai e-mail, automático ou manual, e a mensagem gravada
 * aponta para a chave e a versão que a escreveram (`notification_template_key`/`_version`).
 */
import { describe, expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  contractorMailMessages,
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
  SEEDED_NOTIFICATION_TEMPLATE_KEY,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedNotificationTemplate } from '../fixtures/notification-template.fixture.js'
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

function automaticMail(database: TestDatabase) {
  return createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  })
}

function sendAutomatic(database: TestDatabase, seeded: Seeded) {
  return automaticMail(database).send({
    companyId: seeded.company.companyId,
    correlationId: 'correlation-271',
    occurrenceId: seeded.occurrenceId,
  })
}

function sendManual(database: TestDatabase, seeded: Seeded) {
  return createOccurrenceMailUseCase(database).send({
    actorUserId: seeded.company.userId,
    bodyText: 'Segue a ocorrência.',
    companyId: seeded.company.companyId,
    contactIds: seeded.contactIds.slice(0, 1),
    correlationId: 'correlation-271-manual',
    idempotencyKey: `manual-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
    subject: 'Ocorrência',
  })
}

async function storedMails(database: TestDatabase, seeded: Seeded) {
  return database.db
    .select({
      bodyText: contractorMailMessages.bodyText,
      notificationTemplateKey: contractorMailMessages.notificationTemplateKey,
      notificationTemplateVersion: contractorMailMessages.notificationTemplateVersion,
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

describe('o e-mail da ocorrência registrada antes da escolha do modelo (spec 269, mantido na 271)', () => {
  testWithPostgres(
    'antes da escolha do tipo: o automático pula e o manual segue; depois: envia',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, {
          contractorNotificationTemplateSelectedAt: AFTER_OCCURRENCE,
          emailsContractor: true,
        })

        expect(await sendAutomatic(database, seeded)).toEqual({
          outcome: 'skipped',
          reason: 'registered_before_template',
        })
        expect(await storedMails(database, seeded)).toEqual([])
        await sendManual(database, seeded)
        expect(await storedMails(database, seeded)).toHaveLength(1)

        await setType(database, seeded, {
          contractorNotificationTemplateSelectedAt: BEFORE_OCCURRENCE,
        })
        expect(await sendAutomatic(database, seeded)).toMatchObject({ outcome: 'sent' })
      })
    },
    TEST_TIMEOUT_MS,
  )
})

describe('o e-mail da ocorrência pelo modelo do módulo de notificação (spec 271 T2.5)', () => {
  testWithPostgres(
    'o modelo do tipo escreve o e-mail automático, com variáveis e linhas de item, e a mensagem aponta para a chave e a versão',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        await seedNotificationTemplate(database, {
          body: 'Tipo {{tipoOcorrencia}}: {{observacao}}\n\n{{linhasItens}}\n\nObrigado.',
          companyId,
          key: SEEDED_NOTIFICATION_TEMPLATE_KEY,
          subject: 'Nova versão — NF {{numeroNota}}',
          version: 2,
        })
        await setType(database, seeded, { emailsContractor: true })

        expect(await sendAutomatic(database, seeded)).toMatchObject({ outcome: 'sent' })

        const mails = await storedMails(database, seeded)
        expect(mails).toHaveLength(1)
        expect(mails[0]?.subject).toMatch(/^Nova versão — NF /u)
        expect(mails[0]?.bodyText).toContain('Tipo Caixa violada: caixa com avaria visível')
        expect(mails[0]?.notificationTemplateKey).toBe(SEEDED_NOTIFICATION_TEMPLATE_KEY)
        expect(mails[0]?.notificationTemplateVersion).toBe(2)
        expect(mails[0]?.templateId).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o envio manual grava a chave e a versão ativas no momento do envio',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)

        await sendManual(database, seeded)

        expect((await storedMails(database, seeded))[0]).toMatchObject({
          bodyText: expect.stringContaining('Segue a ocorrência.'),
          notificationTemplateKey: SEEDED_NOTIFICATION_TEMPLATE_KEY,
          notificationTemplateVersion: 1,
          templateId: null,
        })
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'versão nova da mesma chave no módulo vale no próximo e-mail, sem tocar no tipo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const reader = createOccurrenceMailReader(database.db)
        const params = { companyId: seeded.company.companyId, occurrenceId: seeded.occurrenceId }

        expect(await reader.findOccurrenceNotificationTemplate(params)).toEqual({
          key: SEEDED_NOTIFICATION_TEMPLATE_KEY,
          version: 1,
        })
        await seedNotificationTemplate(database, {
          companyId: seeded.company.companyId,
          key: SEEDED_NOTIFICATION_TEMPLATE_KEY,
          version: 2,
        })
        expect(await reader.findOccurrenceNotificationTemplate(params)).toEqual({
          key: SEEDED_NOTIFICATION_TEMPLATE_KEY,
          version: 2,
        })
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'tipo sem chave: o automático pula e o manual é 409, sem gravar nada',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, {
          contractorNotificationTemplateKey: null,
          emailsContractor: true,
        })

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
    'modelo desativado, virado HTML ou apagado do módulo: o automático pula e o manual é 409',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, { emailsContractor: true })
        const where = sql`company_id = ${seeded.company.companyId}::uuid and key = ${SEEDED_NOTIFICATION_TEMPLATE_KEY}`

        for (const change of [
          sql`active = false`,
          sql`body = '<p>html</p>'`,
          sql`locale = 'en-US'`,
        ]) {
          await database.db.execute(sql`update notification.templates set ${change} where ${where}`)
          expect(await sendAutomatic(database, seeded)).toEqual({
            outcome: 'skipped',
            reason: 'no_template_selected',
          })
          await expect(sendManual(database, seeded)).rejects.toBeInstanceOf(
            OccurrenceMailTemplateMissingError,
          )
          await database.db.execute(
            sql`update notification.templates set active = true, body = 'ok {{numeroNota}}', locale = 'pt-BR' where ${where}`,
          )
        }
        expect(await storedMails(database, seeded)).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )
})
