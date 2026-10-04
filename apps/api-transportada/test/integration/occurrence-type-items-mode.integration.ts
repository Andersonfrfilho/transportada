/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 (CA07, CA09, CA10): `itemsMode` do tipo de ocorrência contra o Postgres de verdade —
 * grava, ausente não mexe, o estado `off` + política recusado antes do banco, e o PUT que cria a
 * prorrogação do boleto com os campos que a 208 usa. Molde de
 * `occurrence-type-redelivery-policy.integration.ts`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies } from '../../src/database/identity.schema.js'
import { saveOccurrenceTypeWithTemplate } from '../../src/trips/application/save-occurrence-type.use-case.js'
import { OccurrenceTypeItemsOffRedeliveryPolicyError } from '../../src/trips/domain/trip.error.js'
import {
  findOccurrenceType,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

async function withDisposableDatabase(
  callback: (connectionString: string) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test database URL is required')

  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_itm_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''

  try {
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    await callback(disposableUrl.toString())
  } finally {
    try {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
    } finally {
      await admin.close({ timeout: 0 })
    }
  }
}

type SaveInput = Parameters<typeof saveOccurrenceType>[1]

function baseValues(companyId: string, overrides: Partial<SaveInput> = {}): SaveInput {
  return {
    active: true,
    allowsMultipleItems: true,
    companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    name: 'Cliente pediu prorrogação do boleto',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
    ...overrides,
  }
}

async function withCompany(
  callback: (context: {
    readonly companyId: string
    readonly provider: ReturnType<typeof createDrizzleProvider>
  }) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async (connectionString) => {
    const provider = createDrizzleProvider({
      connection: { adapter: 'postgres', max: 1, url: connectionString },
    })

    try {
      const [company] = await provider.db
        .insert(companies)
        .values([{ status: 'active' }])
        .returning({ id: companies.id })
      if (company === undefined) throw new Error('Failed to seed company')
      await callback({ companyId: company.id, provider })
    } finally {
      await provider.close()
    }
  })
}

describe('"itemsMode" do tipo de ocorrência contra o Postgres (spec 241)', () => {
  testWithPostgres('grava, e ausente não altera o valor gravado', async () => {
    await withCompany(async ({ companyId, provider }) => {
      const created = await saveOccurrenceType(
        provider.db,
        baseValues(companyId, { itemsMode: 'off' }),
      )
      expect(created.itemsMode).toBe('off')

      // Regrava só com outro nome, sem o campo (o editor antigo) — o `off` tem de sobreviver.
      const renamed = await saveOccurrenceType(
        provider.db,
        baseValues(companyId, { name: 'Prorrogação', occurrenceTypeId: created.id }),
      )
      expect(renamed.itemsMode).toBe('off')

      const reopened = await saveOccurrenceType(
        provider.db,
        baseValues(companyId, {
          itemsMode: 'optional',
          name: 'Prorrogação',
          occurrenceTypeId: created.id,
        }),
      )
      expect(reopened.itemsMode).toBe('optional')
    })
  })

  testWithPostgres('criação sem o campo usa o padrão da coluna (optional)', async () => {
    await withCompany(async ({ companyId, provider }) => {
      const created = await saveOccurrenceType(provider.db, baseValues(companyId))

      expect(created.itemsMode).toBe('optional')
    })
  })

  testWithPostgres('o PUT da prorrogação grava com os campos da 208 (CA10)', async () => {
    await withCompany(async ({ companyId, provider }) => {
      const saved = await saveOccurrenceTypeWithTemplate({
        companyId,
        findCurrentType: (query) => findOccurrenceType(provider.db, query),
        save: (values) => saveOccurrenceType(provider.db, { ...values, companyId }),
        templates: { hasActiveEmailTemplate: async () => false },
        values: {
          ...baseValues(companyId),
          attachmentMode: 'off',
          itemsMode: 'off',
          leavesDocumentBehind: false,
          redeliveryPolicy: 'unset',
        },
      })

      expect(saved.itemsMode).toBe('off')
      expect(saved.attachmentMode).toBe('off')
      expect(saved.leavesDocumentBehind).toBe(false)
      expect(saved.redeliveryPolicy).toBe('unset')
      expect(saved.flow).toBe('document')
    })
  })

  testWithPostgres(
    'off com política gravada blocked é 422 do caso de uso, nunca 500 da CHECK (CA09)',
    async () => {
      await withCompany(async ({ companyId, provider }) => {
        const blocked = await saveOccurrenceType(
          provider.db,
          baseValues(companyId, { itemsMode: 'optional', redeliveryPolicy: 'blocked' }),
        )

        const turnOff = saveOccurrenceTypeWithTemplate({
          companyId,
          findCurrentType: (query) => findOccurrenceType(provider.db, query),
          save: (values) => saveOccurrenceType(provider.db, { ...values, companyId }),
          templates: { hasActiveEmailTemplate: async () => false },
          values: { ...baseValues(companyId), itemsMode: 'off', occurrenceTypeId: blocked.id },
        })

        await expect(turnOff).rejects.toBeInstanceOf(OccurrenceTypeItemsOffRedeliveryPolicyError)
        const stillStored = await findOccurrenceType(provider.db, {
          companyId,
          occurrenceTypeId: blocked.id,
        })
        expect(stillStored?.itemsMode).toBe('optional')
        expect(stillStored?.redeliveryPolicy).toBe('blocked')
      })
    },
  )
})
