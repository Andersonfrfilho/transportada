/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 (T5.1, RF1), contra Postgres real: o cadastro do tipo grava e lê os campos do retorno da contratante
 * (roteiro do SAC: 6 h de prazo, alerta a cada 60 min, até 24), o `PUT` sem eles mantém o gravado, e as regras
 * entre campos voltam 422 do domínio em vez de 500.
 */
import { describe, expect } from 'bun:test'

import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import {
  OccurrenceTypeContractorReplyAlertNeedsWaitError,
  OccurrenceTypeContractorReplyNeedsMailError,
  OccurrenceTypeForwardNeedsTextError,
} from '../../src/trips/domain/trip.error.js'
import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'
import {
  findOccurrenceType,
  listOccurrenceTypes,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { withConversationDatabase } from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  seedCompany,
  testWithPostgres,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const SAC_REPLY = {
  contractorReplyAlertIntervalMinutes: 60,
  contractorReplyAlertMaxCount: 24,
  contractorReplyAlertMode: 'alert_operator',
  contractorReplyAttachmentKind: 'pdf',
  contractorReplyMode: 'forward_after_approval',
  /** Spec 276 T3b: gravado, lido no get e na lista, e mantido pelo PUT sem o campo. */
  contractorReplyResolveOnDelivery: true,
  contractorReplyWaitHours: 6,
  driverReplyTemplate: 'Segue o boleto atualizado.',
} as const

const FORWARD = {
  forwardEmailBody: 'Segue o boleto com o novo vencimento.',
  forwardEmailSubject: 'Boleto prorrogado',
  forwardToInformedEmail: 'manual',
  forwardToNoteRecipient: 'manual',
} as const

function valuesFor(overrides: Partial<SaveOccurrenceTypeValues> = {}): SaveOccurrenceTypeValues {
  return {
    active: true,
    emailTemplateKey: null,
    emailsContractor: true,
    flow: 'document',
    name: 'Prorrogação de boleto',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
    ...overrides,
  }
}

function save(database: TestDatabase, companyId: string, values: SaveOccurrenceTypeValues) {
  return saveOccurrenceTypeWithTemplate({
    companyId,
    findCurrentType: (query) => findOccurrenceType(database.db, query),
    save: (toSave) => saveOccurrenceType(database.db, { ...toSave, companyId }),
    templates: {
      findContractorTemplate: async () => null,
      hasActiveEmailTemplate: async () => true,
    },
    values,
  })
}

async function parseBody(body: Record<string, unknown>) {
  return toSaveOccurrenceTypeValues(
    (await parseOccurrenceTypeRequest(
      new Request('http://localhost/company-settings/occurrence-types', {
        body: JSON.stringify({
          emailTemplateKey: null,
          flow: 'document',
          name: 'Prorrogação de boleto',
          occurrenceTypeId: null,
          stage: 'delivery',
          ...body,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      }),
    )) as unknown as SaveOccurrenceTypeValues,
  )
}

describe('o retorno da contratante no cadastro do tipo contra o Postgres (spec 248 RF1)', () => {
  testWithPostgres(
    'grava o roteiro do SAC, lê no get e na lista, e o PUT sem os campos mantém o gravado',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const created = await save(database, companyId, valuesFor(SAC_REPLY))
        expect(created).toMatchObject(SAC_REPLY)

        const renamed = await save(
          database,
          companyId,
          valuesFor({ name: 'Prorrogação de boleto (SAC)', occurrenceTypeId: created.id }),
        )
        expect(renamed).toMatchObject(SAC_REPLY)

        const read = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        const listed = (await listOccurrenceTypes(database.db, { companyId })).find(
          (type) => type.id === created.id,
        )
        for (const record of [read, listed]) expect(record).toMatchObject(SAC_REPLY)
      })
    },
    30_000,
  )

  testWithPostgres(
    'a fronteira aceita os campos e recusa valor fora da faixa',
    async () => {
      const values = await parseBody(SAC_REPLY)
      expect(values).toMatchObject(SAC_REPLY)
      await expect(parseBody({ contractorReplyWaitHours: 169 })).rejects.toBeDefined()
      await expect(parseBody({ contractorReplyAlertIntervalMinutes: 10 })).rejects.toBeDefined()
      await expect(parseBody({ contractorReplyAlertMaxCount: 97 })).rejects.toBeDefined()
      await expect(parseBody({ contractorReplyMode: 'always' })).rejects.toBeDefined()
      await expect(parseBody({ contractorReplyResolveOnDelivery: 'yes' })).rejects.toBeDefined()
    },
    30_000,
  )

  testWithPostgres(
    'retorno ligado sem o e-mail à contratante ou sem texto, e alerta sem prazo, voltam 422',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        await expect(
          save(
            database,
            companyId,
            valuesFor({ ...SAC_REPLY, emailsContractor: false, name: 'Sem e-mail' }),
          ),
        ).rejects.toBeInstanceOf(OccurrenceTypeContractorReplyNeedsMailError)
        await expect(
          save(
            database,
            companyId,
            valuesFor({ ...SAC_REPLY, driverReplyTemplate: '  ', name: 'Sem texto' }),
          ),
        ).rejects.toBeInstanceOf(OccurrenceTypeContractorReplyNeedsMailError)
        await expect(
          save(
            database,
            companyId,
            valuesFor({
              ...SAC_REPLY,
              contractorReplyWaitHours: null,
              name: 'Alerta sem prazo',
            }),
          ),
        ).rejects.toBeInstanceOf(OccurrenceTypeContractorReplyAlertNeedsWaitError)
      })
    },
    30_000,
  )

  testWithPostgres(
    'o envio do boleto por e-mail (T4.7): grava, lê no get e na lista, o PUT sem os campos mantém, e a CHECK exige os dois textos',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const created = await save(database, companyId, valuesFor({ ...SAC_REPLY, ...FORWARD }))
        expect(created).toMatchObject(FORWARD)

        const renamed = await save(
          database,
          companyId,
          valuesFor({ ...SAC_REPLY, name: 'Prorrogação (SAC)', occurrenceTypeId: created.id }),
        )
        expect(renamed).toMatchObject(FORWARD)
        const read = await findOccurrenceType(database.db, {
          companyId,
          occurrenceTypeId: created.id,
        })
        const listed = (await listOccurrenceTypes(database.db, { companyId })).find(
          (type) => type.id === created.id,
        )
        for (const record of [read, listed]) expect(record).toMatchObject(FORWARD)

        await expect(
          save(
            database,
            companyId,
            valuesFor({ ...SAC_REPLY, ...FORWARD, forwardEmailBody: '  ', name: 'Sem corpo' }),
          ),
        ).rejects.toBeInstanceOf(OccurrenceTypeForwardNeedsTextError)
        await expect(
          save(
            database,
            companyId,
            valuesFor({ ...SAC_REPLY, ...FORWARD, forwardEmailSubject: '', name: 'Sem assunto' }),
          ),
        ).rejects.toBeInstanceOf(OccurrenceTypeForwardNeedsTextError)
        expect(
          await save(
            database,
            companyId,
            valuesFor({
              ...SAC_REPLY,
              forwardToInformedEmail: 'off',
              forwardToNoteRecipient: 'off',
              name: 'Encaminhamento desligado',
            }),
          ),
        ).toMatchObject({ forwardEmailBody: '', forwardEmailSubject: '' })
      })
    },
    30_000,
  )

  testWithPostgres(
    'a fronteira aceita o encaminhamento por e-mail e recusa modo e tamanho fora do contrato',
    async () => {
      expect(await parseBody({ ...SAC_REPLY, ...FORWARD })).toMatchObject(FORWARD)
      await expect(parseBody({ forwardToInformedEmail: 'automatic' })).rejects.toBeDefined()
      await expect(parseBody({ forwardEmailSubject: 'a'.repeat(201) })).rejects.toBeDefined()
      await expect(parseBody({ forwardEmailBody: 'a'.repeat(4001) })).rejects.toBeDefined()
    },
    30_000,
  )
})
