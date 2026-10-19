/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.4 (ADR-0108): o tipo de ocorrência escolhe, pela chave, o modelo de e-mail do módulo de notificação.
 * Contra um Postgres de verdade: a chave grava, fica quando o `PUT` não a manda, limpa com `null`, o carimbo só
 * muda quando a chave muda, e o modelo precisa existir, ser da empresa, ativo e de texto.
 */
import { describe, expect } from 'bun:test'
import { STANDARD_EMAIL_TEMPLATE_KEY } from '@adatechnology/notification-contracts'
import { and, eq, sql } from 'drizzle-orm'

import { NOTIFICATION_TEMPLATE_KEY } from '../../src/notification/domain/notification-catalog.constant.js'
import { userCompanyMemberships } from '../../src/database/database.schema.js'
import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import { OccurrenceContractorTemplateInvalidError } from '../../src/occurrence-conversation/domain/occurrence-contractor-template.error.js'
import {
  findActiveContractorTemplate,
  listActiveContractorTemplates,
} from '../../src/occurrence-conversation/infrastructure/notification-template.query.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import {
  findOccurrenceType,
  listOccurrenceTypes,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { toOccurrenceTypeSettingsViews } from '../../src/trips/infrastructure/occurrence-type-contractors.query.js'
import {
  withNotificationDatabase,
  seedNotificationTemplate,
} from '../fixtures/notification-template.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 120_000
const KEY = 'ocorrencia.avaria'

function buildValues(overrides: Partial<SaveOccurrenceTypeValues> = {}): SaveOccurrenceTypeValues {
  return {
    active: true,
    emailTemplateKey: null,
    flow: 'document',
    name: 'Avaria',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
    ...overrides,
  }
}

async function actorOf(database: TestDatabase, companyId: string): Promise<string> {
  const [membership] = await database.db
    .select({ userId: userCompanyMemberships.userId })
    .from(userCompanyMemberships)
    .where(eq(userCompanyMemberships.companyId, companyId))
    .limit(1)
  if (membership === undefined) throw new Error('ACTOR_EXPECTED')
  return membership.userId
}

async function saveThroughUseCase(
  database: TestDatabase,
  companyId: string,
  values: SaveOccurrenceTypeValues,
) {
  const actorUserId = await actorOf(database, companyId)
  return saveOccurrenceTypeWithTemplate({
    companyId,
    findCurrentType: (query) => findOccurrenceType(database.db, query),
    save: (toSave) =>
      saveOccurrenceType(database.db, {
        ...toSave,
        actorUserId,
        companyId,
        correlationId: 'corr-save',
      }),
    templates: {
      findContractorTemplate: ({ key }) =>
        findActiveContractorTemplate(database.db, { companyId, key }),
      hasActiveEmailTemplate: async () => true,
    },
    values,
  })
}

async function readStamp(database: TestDatabase, companyId: string, occurrenceTypeId: string) {
  const [row] = await database.db
    .select({
      key: companyOccurrenceTypes.contractorNotificationTemplateKey,
      selectedAt: companyOccurrenceTypes.contractorNotificationTemplateSelectedAt,
    })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.id, occurrenceTypeId),
      ),
    )
  return row
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

describe('the notification template of the occurrence type (spec 271 T2.4)', () => {
  testWithPostgres(
    'stamps the selection when the key changes, keeps it on the same key and on a new version, clears it with null',
    async () => {
      await withNotificationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        await seedNotificationTemplate(database, { companyId, key: KEY })
        await seedNotificationTemplate(database, { companyId, key: 'ocorrencia.falta' })

        const created = await saveThroughUseCase(database, companyId, buildValues())
        expect(await readStamp(database, companyId, created.id)).toEqual({
          key: null,
          selectedAt: null,
        })

        await saveThroughUseCase(
          database,
          companyId,
          buildValues({ contractorNotificationTemplateKey: KEY, occurrenceTypeId: created.id }),
        )
        const first = await readStamp(database, companyId, created.id)
        expect(first?.key).toBe(KEY)
        expect(first?.selectedAt).toBeInstanceOf(Date)

        await saveThroughUseCase(
          database,
          companyId,
          buildValues({
            contractorNotificationTemplateKey: KEY,
            name: 'Só o nome mudou',
            occurrenceTypeId: created.id,
          }),
        )
        expect((await readStamp(database, companyId, created.id))?.selectedAt).toEqual(
          first!.selectedAt,
        )

        await seedNotificationTemplate(database, {
          body: 'Texto novo {{numeroNota}}',
          companyId,
          key: KEY,
          version: 2,
        })
        await saveThroughUseCase(
          database,
          companyId,
          buildValues({ contractorNotificationTemplateKey: KEY, occurrenceTypeId: created.id }),
        )
        expect((await readStamp(database, companyId, created.id))?.selectedAt).toEqual(
          first!.selectedAt,
        )

        await saveThroughUseCase(database, companyId, buildValues({ occurrenceTypeId: created.id }))
        expect((await readStamp(database, companyId, created.id))?.key).toBe(KEY)

        await saveThroughUseCase(
          database,
          companyId,
          buildValues({
            contractorNotificationTemplateKey: 'ocorrencia.falta',
            occurrenceTypeId: created.id,
          }),
        )
        const second = await readStamp(database, companyId, created.id)
        expect(second?.key).toBe('ocorrencia.falta')
        expect(second!.selectedAt!.getTime()).toBeGreaterThanOrEqual(first!.selectedAt!.getTime())

        await saveThroughUseCase(
          database,
          companyId,
          buildValues({ contractorNotificationTemplateKey: null, occurrenceTypeId: created.id }),
        )
        expect(await readStamp(database, companyId, created.id)).toEqual({
          key: null,
          selectedAt: null,
        })
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a type created already with a key is stamped at creation and reads the key back',
    async () => {
      await withNotificationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        await seedNotificationTemplate(database, { companyId, key: KEY })

        const created = await saveThroughUseCase(
          database,
          companyId,
          buildValues({ contractorNotificationTemplateKey: KEY }),
        )

        expect((await readStamp(database, companyId, created.id))?.selectedAt).toBeInstanceOf(Date)
        expect(created.contractorNotificationTemplateKey).toBe(KEY)
        const read = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        const listed = (await listOccurrenceTypes(database.db, { companyId })).find(
          (type) => type.id === created.id,
        )
        expect(read?.contractorNotificationTemplateKey).toBe(KEY)
        expect(listed?.contractorNotificationTemplateKey).toBe(KEY)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'refuses a template that is missing, of another company, inactive, HTML or with an unknown variable, writing nothing',
    async () => {
      await withNotificationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const other = await seedCompany(database)
        const type = await saveThroughUseCase(database, companyId, buildValues())
        await seedNotificationTemplate(database, { companyId: other.companyId, key: 'de.outra' })
        await seedNotificationTemplate(database, { active: false, companyId, key: 'desativado' })
        await seedNotificationTemplate(database, {
          body: '<p>Olá {{contratante}}</p>',
          companyId,
          key: 'com.html',
        })
        await seedNotificationTemplate(database, {
          body: '<p>Olá</p><script>x</script><!-- mensagem -->a<!-- /mensagem -->',
          companyId,
          key: 'html.inseguro',
        })
        await seedNotificationTemplate(database, {
          body: 'Olá {{foo}}',
          companyId,
          key: 'com.variavel',
        })
        await seedNotificationTemplate(database, {
          channel: 'inbox',
          companyId,
          key: 'so.caixa',
        })
        await seedNotificationTemplate(database, { companyId, key: 'en.us', locale: 'en-US' })
        const expected: readonly (readonly [string, string])[] = [
          ['inexistente', 'not_found'],
          ['de.outra', 'not_found'],
          ['desativado', 'not_found'],
          ['so.caixa', 'not_found'],
          ['en.us', 'not_found'],
          ['com.html', 'missing_message_area'],
          ['html.inseguro', 'unsafe_html'],
          ['com.variavel', 'unknown_variables'],
        ]

        for (const [key, code] of expected) {
          const error = await captureError(() =>
            saveThroughUseCase(
              database,
              companyId,
              buildValues({ contractorNotificationTemplateKey: key, occurrenceTypeId: type.id }),
            ),
          )
          expect(error).toBeInstanceOf(OccurrenceContractorTemplateInvalidError)
          expect(
            (error as OccurrenceContractorTemplateInvalidError).details?.map(
              (detail) => detail.message,
            ),
          ).toContain(code)
        }
        expect(await readStamp(database, companyId, type.id)).toEqual({
          key: null,
          selectedAt: null,
        })
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'the settings view warns when the email is on and the type has no usable template',
    async () => {
      await withNotificationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        await seedNotificationTemplate(database, { companyId, key: KEY })
        const withTemplate = await saveThroughUseCase(
          database,
          companyId,
          buildValues({
            contractorNotificationTemplateKey: KEY,
            emailsContractor: true,
            name: 'Com modelo',
          }),
        )
        const withoutTemplate = await saveThroughUseCase(
          database,
          companyId,
          buildValues({ emailsContractor: true, name: 'Sem modelo' }),
        )
        const emailOff = await saveThroughUseCase(
          database,
          companyId,
          buildValues({ name: 'E-mail desligado' }),
        )

        async function readViews() {
          const views = await toOccurrenceTypeSettingsViews(database.db, {
            companyId,
            records: await listOccurrenceTypes(database.db, { companyId }),
          })
          return new Map(views.map((view) => [view.id, view.missingNotificationTemplate]))
        }

        const before = await readViews()
        expect(before.get(withTemplate.id)).toBe(false)
        expect(before.get(withoutTemplate.id)).toBe(true)
        expect(before.get(emailOff.id)).toBe(false)

        await database.db.execute(
          sql`update notification.templates set active = false where company_id = ${companyId}::uuid`,
        )
        const after = await readViews()
        expect(after.get(withTemplate.id)).toBe(true)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'the editor list has the highest active version of each e-mail pt-BR key of the company, hiding only the standard e-mail key',
    async () => {
      await withNotificationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const other = await seedCompany(database)
        await seedNotificationTemplate(database, { companyId, key: 'a.modelo', version: 1 })
        await seedNotificationTemplate(database, {
          body: 'Versão dois {{numeroNota}}',
          companyId,
          key: 'a.modelo',
          version: 2,
        })
        await seedNotificationTemplate(database, {
          active: false,
          companyId,
          key: 'a.modelo',
          version: 3,
        })
        await seedNotificationTemplate(database, { companyId, key: 'b.modelo' })
        await seedNotificationTemplate(database, { channel: 'inbox', companyId, key: 'c.caixa' })
        await seedNotificationTemplate(database, { companyId, key: 'd.ingles', locale: 'en-US' })
        await seedNotificationTemplate(database, { companyId: other.companyId, key: 'e.outra' })
        await seedNotificationTemplate(database, { companyId, key: STANDARD_EMAIL_TEMPLATE_KEY })
        await seedNotificationTemplate(database, {
          companyId,
          key: NOTIFICATION_TEMPLATE_KEY.BILLING_INVOICE_DUE,
        })

        const listed = await listActiveContractorTemplates(database.db, { companyId })

        expect(listed.map((template) => [template.key, template.version])).toEqual([
          ['a.modelo', 2],
          ['b.modelo', 1],
          [NOTIFICATION_TEMPLATE_KEY.BILLING_INVOICE_DUE, 1],
        ])
        expect(listed[0]?.body).toBe('Versão dois {{numeroNota}}')
      })
    },
    TEST_TIMEOUT_MS,
  )
})
