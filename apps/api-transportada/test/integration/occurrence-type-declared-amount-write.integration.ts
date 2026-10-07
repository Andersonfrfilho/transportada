/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T4.1, RF1, RF2, CA05), contra Postgres real: o cadastro grava os campos novos do tipo e os
 * dois modos das exceções, ausente é "não mexa", o par valor-pago-por-item sem produtos volta 422 do
 * domínio, e salvar o aviso interno (`email_template_key`) não apaga o e-mail à contratante — que
 * continua saindo pelo aviso automático (183).
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  contractorMailMessages,
  contractors,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { OccurrenceTypeDeclaredAmountNeedsItemsError } from '../../src/trips/domain/trip.error.js'
import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'
import {
  findOccurrenceType,
  listOccurrenceTypes,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment-overrides.repository.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  seedCompany,
  testWithPostgres,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const SAC_SUBJECT = 'OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}} – DEVOLUÇÃO PARCIAL'
const SAC_BODY = 'NFD {{numeroReferencia}} – R$ {{valorDeclarado}}\n{{linhasItens}}'

function valuesFor(overrides: Partial<SaveOccurrenceTypeValues> = {}): SaveOccurrenceTypeValues {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    name: 'Devolução parcial',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
    ...overrides,
  }
}

function saveThroughUseCase(
  database: TestDatabase,
  companyId: string,
  values: SaveOccurrenceTypeValues,
) {
  return saveOccurrenceTypeWithTemplate({
    companyId,
    findCurrentType: (query) => findOccurrenceType(database.db, query),
    save: (toSave) => saveOccurrenceType(database.db, { ...toSave, companyId }),
    templates: { hasActiveEmailTemplate: async () => true },
    values,
  })
}

describe('os campos novos do tipo contra o Postgres (spec 247 RF1)', () => {
  testWithPostgres(
    'grava os seis campos, lê no get e na lista, e o PUT sem eles mantém os gravados',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const created = await saveThroughUseCase(
          database,
          companyId,
          valuesFor({
            declaredAmountLabel: 'Valor pago pela loja',
            declaredAmountMode: 'optional',
            declaredAmountScope: 'item',
            emailItemLineTemplate: '{{codigoItem}} – {{item}}',
            itemsMode: 'required',
            referenceNumberLabel: 'Número da NFD',
            referenceNumberMode: 'required',
          }),
        )
        expect(created).toMatchObject({
          declaredAmountLabel: 'Valor pago pela loja',
          declaredAmountMode: 'optional',
          declaredAmountScope: 'item',
          emailItemLineTemplate: '{{codigoItem}} – {{item}}',
          referenceNumberLabel: 'Número da NFD',
          referenceNumberMode: 'required',
        })

        const renamed = await saveThroughUseCase(
          database,
          companyId,
          valuesFor({ name: 'Devolução parcial (SAC)', occurrenceTypeId: created.id }),
        )
        expect(renamed).toMatchObject({
          declaredAmountLabel: 'Valor pago pela loja',
          declaredAmountMode: 'optional',
          emailItemLineTemplate: '{{codigoItem}} – {{item}}',
          referenceNumberMode: 'required',
        })

        const read = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        const listed = (await listOccurrenceTypes(database.db, { companyId })).find(
          (type) => type.id === created.id,
        )
        for (const record of [read, listed]) {
          expect(record).toMatchObject({
            declaredAmountMode: 'optional',
            declaredAmountScope: 'item',
            referenceNumberLabel: 'Número da NFD',
            referenceNumberMode: 'required',
          })
        }
      })
    },
    30_000,
  )

  testWithPostgres(
    'o PUT sem emailBody e emailSubject preserva o gravado; "" explícito apaga (T7.2 M1)',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const created = await saveThroughUseCase(
          database,
          companyId,
          valuesFor({ emailBody: SAC_BODY, emailSubject: SAC_SUBJECT }),
        )

        const putWithout = async (extra: Record<string, unknown>) =>
          saveThroughUseCase(
            database,
            companyId,
            toSaveOccurrenceTypeValues(
              await parseOccurrenceTypeRequest(
                new Request('http://localhost/company-settings/occurrence-types', {
                  body: JSON.stringify({
                    emailTemplateKey: null,
                    name: 'Devolução parcial',
                    occurrenceTypeId: created.id,
                    stage: 'delivery',
                    ...extra,
                  }),
                  headers: { 'content-type': 'application/json' },
                  method: 'PUT',
                }),
              ),
            ),
          )

        const renamed = await putWithout({ name: 'Devolução parcial (SAC)' })
        expect(renamed).toMatchObject({ emailBody: SAC_BODY, emailSubject: SAC_SUBJECT })
        const read = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        expect(read).toMatchObject({ emailBody: SAC_BODY, emailSubject: SAC_SUBJECT })

        const erased = await putWithout({ emailBody: '', emailSubject: '' })
        expect(erased).toMatchObject({ emailBody: '', emailSubject: '' })
      })
    },
    30_000,
  )

  testWithPostgres(
    'criação sem os campos nasce com os padrões: tudo desligado e rótulos de fábrica',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const created = await saveThroughUseCase(database, companyId, valuesFor())

        expect(created).toMatchObject({
          declaredAmountLabel: 'Valor pago',
          declaredAmountMode: 'off',
          declaredAmountScope: 'item',
          emailItemLineTemplate: '',
          referenceNumberLabel: 'Número do documento do cliente',
          referenceNumberMode: 'off',
        })
      })
    },
    30_000,
  )

  testWithPostgres(
    'valor pago por item sem produtos é 422 do domínio, e nada é gravado',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const created = await saveThroughUseCase(
          database,
          companyId,
          valuesFor({ declaredAmountMode: 'optional', itemsMode: 'required' }),
        )

        const turnItemsOff = saveThroughUseCase(
          database,
          companyId,
          valuesFor({ itemsMode: 'off', occurrenceTypeId: created.id }),
        )
        await expect(turnItemsOff).rejects.toBeInstanceOf(
          OccurrenceTypeDeclaredAmountNeedsItemsError,
        )
        const stillStored = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        expect(stillStored?.itemsMode).toBe('required')

        const turnScopeToOccurrence = await saveThroughUseCase(
          database,
          companyId,
          valuesFor({
            declaredAmountScope: 'occurrence',
            itemsMode: 'off',
            occurrenceTypeId: created.id,
          }),
        )
        expect(turnScopeToOccurrence).toMatchObject({
          declaredAmountScope: 'occurrence',
          itemsMode: 'off',
        })
      })
    },
    30_000,
  )

  testWithPostgres(
    'a gravação concorrente que fere a CHECK volta o mesmo 422 do domínio',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const created = await saveOccurrenceType(database.db, {
          ...valuesFor({ declaredAmountMode: 'required', itemsMode: 'required' }),
          companyId,
        })

        const staleWrite = saveOccurrenceType(database.db, {
          ...valuesFor({ itemsMode: 'off', occurrenceTypeId: created.id }),
          companyId,
        })

        await expect(staleWrite).rejects.toBeInstanceOf(OccurrenceTypeDeclaredAmountNeedsItemsError)
      })
    },
    30_000,
  )
})

describe('os dois modos das exceções contra o Postgres (spec 247 D8)', () => {
  testWithPostgres(
    'três estados: ausente → nulo no INSERT e intacto no UPDATE; nulo herda; valor grava',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const type = await saveThroughUseCase(database, companyId, valuesFor())
        const contractorId = crypto.randomUUID()
        await database.db.insert(contractors).values({
          companyId,
          displayName: 'Contratante Alfa',
          id: contractorId,
          taxId: '11222333000181',
        })
        const repository = new DrizzleOccurrenceAttachmentOverridesRepository(database.db)
        const replace = (override: Record<string, unknown>) =>
          repository.replaceContractorOverrides({
            companyId,
            occurrenceTypeId: type.id,
            overrides: [{ attachmentMode: 'optional', contractorId, ...override }],
          })
        const read = async () =>
          (await repository.listContractorOverrides({ companyId, occurrenceTypeId: type.id }))[0]

        await replace({})
        expect(await read()).toMatchObject({ declaredAmountMode: null, referenceNumberMode: null })

        await replace({ declaredAmountMode: 'required', referenceNumberMode: 'optional' })
        expect(await read()).toMatchObject({
          declaredAmountMode: 'required',
          referenceNumberMode: 'optional',
        })

        await replace({})
        expect(await read()).toMatchObject({
          declaredAmountMode: 'required',
          referenceNumberMode: 'optional',
        })

        await replace({ declaredAmountMode: null, referenceNumberMode: null })
        expect(await read()).toMatchObject({ declaredAmountMode: null, referenceNumberMode: null })
      })
    },
    30_000,
  )
})

describe('o aviso interno e o e-mail à contratante são independentes (spec 247 RF2, CA05)', () => {
  testWithPostgres(
    'salvar o tipo com email_template_key mantém assunto e corpo, e o aviso automático sai com eles',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId } = seeded.company
        const [occurrence] = await database.db
          .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
        const occurrenceTypeId = occurrence?.typeId ?? ''

        const saved = await saveThroughUseCase(
          database,
          companyId,
          valuesFor({
            emailBody: SAC_BODY,
            emailSubject: SAC_SUBJECT,
            emailTemplateKey: 'trip.ocorrencia-personalizada',
            emailsContractor: true,
            name: 'Caixa violada',
            occurrenceTypeId,
            stage: 'separation',
          }),
        )
        expect(saved).toMatchObject({
          emailBody: SAC_BODY,
          emailSubject: SAC_SUBJECT,
          emailTemplateKey: 'trip.ocorrencia-personalizada',
        })
        const [row] = await database.db
          .select({
            emailBody: companyOccurrenceTypes.emailBody,
            emailSubject: companyOccurrenceTypes.emailSubject,
            emailTemplateKey: companyOccurrenceTypes.emailTemplateKey,
          })
          .from(companyOccurrenceTypes)
          .where(
            and(
              eq(companyOccurrenceTypes.companyId, companyId),
              eq(companyOccurrenceTypes.id, occurrenceTypeId),
            ),
          )
        expect(row).toEqual({
          emailBody: SAC_BODY,
          emailSubject: SAC_SUBJECT,
          emailTemplateKey: 'trip.ocorrencia-personalizada',
        })

        const result = await createSendAutomaticOccurrenceMailUseCase({
          reader: createAutomaticOccurrenceMailReader(database.db),
          sendMail: createOccurrenceMailUseCase(database),
        }).send({
          companyId,
          correlationId: 'correlation-247-ca05',
          occurrenceId: seeded.occurrenceId,
        })

        expect(result).toMatchObject({ outcome: 'sent' })
        const mails = await database.db
          .select({ subject: contractorMailMessages.subject })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.companyId, companyId))
        expect(mails).toHaveLength(1)
        expect(mails[0]?.subject).toStartWith('OCORRÊNCIA:')
        expect(mails[0]?.subject).toEndWith('– DEVOLUÇÃO PARCIAL')
      })
    },
    30_000,
  )
})
