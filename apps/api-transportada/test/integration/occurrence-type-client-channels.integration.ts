/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T2 (RF2): a matriz "Retorno ao cliente" do tipo contra um Postgres de verdade. Todo tipo novo nasce com as
 * duas linhas; a gravação nova escolhe o modelo do módulo por canal e deriva `client_channel`; a gravação do painel
 * antigo liga e desliga as caixas sem perder o modelo; a chave é conferida no canal, da empresa.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import {
  OccurrenceClientChannelTemplateInvalidError,
} from '../../src/trips/domain/occurrence-client-channels.error.js'
import {
  findOccurrenceType,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { findActiveClientChannelTemplate } from '../../src/trips/infrastructure/occurrence-type-client-channels.query.js'
import { toOccurrenceTypeSettingsViews } from '../../src/trips/infrastructure/occurrence-type-contractors.query.js'
import {
  seedNotificationTemplate,
  withNotificationDatabase,
} from '../fixtures/notification-template.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 120_000
const KEY = 'boleto.cliente'

function buildValues(overrides: Partial<SaveOccurrenceTypeValues> = {}): SaveOccurrenceTypeValues {
  return {
    active: true,
    emailTemplateKey: null,
    flow: 'document',
    name: 'Prorrogação do boleto',
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
      findClientChannelTemplate: (query) => findActiveClientChannelTemplate(database.db, query),
      findContractorTemplate: async () => null,
      hasActiveEmailTemplate: async () => true,
    },
    values,
  })
}

async function readView(database: TestDatabase, companyId: string, typeId: string) {
  const record = await findOccurrenceType(database.db, { companyId, occurrenceTypeId: typeId })
  if (record === null) throw new Error('TYPE_EXPECTED')
  const [view] = await toOccurrenceTypeSettingsViews(database.db, { companyId, records: [record] })
  return view
}

describe('spec 286 T2: a matriz por canal do tipo de ocorrência', () => {
  testWithPostgres(
    'nasce com as linhas, grava por canal, deriva client_channel e o painel antigo não perde o modelo',
    async () => {
      await withNotificationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        await seedNotificationTemplate(database, {
          body: 'Olá, segue o boleto.',
          companyId,
          key: KEY,
          subject: 'Boleto',
        })
        await seedNotificationTemplate(database, {
          body: 'Olá, segue o boleto.',
          channel: 'whatsapp',
          companyId,
          key: KEY,
          subject: null,
        })

        const created = await save(database, companyId, buildValues())
        expect((await readView(database, companyId, created.id))?.clientChannels).toEqual({
          email: { enabled: false, sendMode: 'manual', templateKey: null },
          whatsapp: { enabled: false, sendMode: 'manual', templateKey: null },
        })

        const both = await save(
          database,
          companyId,
          buildValues({
            clientChannels: {
              email: { enabled: true, sendMode: 'automatic', templateKey: KEY },
              whatsapp: { enabled: true, sendMode: 'automatic', templateKey: KEY },
            },
            clientEmailType: 'boleto',
            occurrenceTypeId: created.id,
          }),
        )
        expect(both.clientChannel).toBe('both')
        expect(both.clientEmailSendMode).toBe('automatic')
        const [row] = await database.db
          .select({
            clientChannel: companyOccurrenceTypes.clientChannel,
            clientEmailSendMode: companyOccurrenceTypes.clientEmailSendMode,
          })
          .from(companyOccurrenceTypes)
          .where(eq(companyOccurrenceTypes.id, created.id))
        expect(row).toEqual({ clientChannel: 'both', clientEmailSendMode: 'automatic' })

        /** O painel antigo desliga o WhatsApp pelo campo antigo: a caixa desmarca, modelo e modo ficam. */
        await save(
          database,
          companyId,
          buildValues({ clientChannel: 'email', occurrenceTypeId: created.id }),
        )
        expect((await readView(database, companyId, created.id))?.clientChannels).toEqual({
          email: { enabled: true, sendMode: 'automatic', templateKey: KEY },
          whatsapp: { enabled: false, sendMode: 'automatic', templateKey: KEY },
        })

        /** Uma edição que não toca canal nenhum não mexe na matriz. */
        await save(
          database,
          companyId,
          buildValues({ name: 'Prorrogação do boleto (SAC)', occurrenceTypeId: created.id }),
        )
        expect((await readView(database, companyId, created.id))?.clientChannels?.email).toEqual({
          enabled: true,
          sendMode: 'automatic',
          templateKey: KEY,
        })

        /** Desmarcar tudo é `off`. */
        const off = await save(
          database,
          companyId,
          buildValues({
            clientChannels: {
              email: { enabled: false, sendMode: 'automatic', templateKey: KEY },
            },
            occurrenceTypeId: created.id,
          }),
        )
        expect(off.clientChannel).toBe('off')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'recusa modelo de outro canal e de outra empresa; e-mail ligado sem tipo de e-mail do cliente leva ao padrão',
    async () => {
      await withNotificationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const other = await seedCompany(database)
        await seedNotificationTemplate(database, { companyId, key: KEY })
        await seedNotificationTemplate(database, {
          channel: 'whatsapp',
          companyId: other.companyId,
          key: KEY,
          subject: null,
        })
        const created = await save(database, companyId, buildValues())

        const wrongChannel = await save(
          database,
          companyId,
          buildValues({
            clientChannels: {
              whatsapp: { enabled: true, sendMode: 'manual', templateKey: KEY },
            },
            occurrenceTypeId: created.id,
          }),
        ).catch((error: unknown) => error)
        expect(wrongChannel).toBeInstanceOf(OccurrenceClientChannelTemplateInvalidError)

        /** O e-mail não trava por falta do tipo de e-mail do cliente: ligado com `off`, o tipo vira o padrão (boleto). */
        const withoutEmailType = await save(
          database,
          companyId,
          buildValues({
            clientChannels: { email: { enabled: true, sendMode: 'manual', templateKey: KEY } },
            clientEmailType: 'off',
            occurrenceTypeId: created.id,
          }),
        )
        expect(withoutEmailType.clientEmailType).toBe('boleto')
        expect((await readView(database, companyId, created.id))?.clientChannels?.email).toEqual({
          enabled: true,
          sendMode: 'manual',
          templateKey: KEY,
        })
      })
    },
    TEST_TIMEOUT_MS,
  )
})
