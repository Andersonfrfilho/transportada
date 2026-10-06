/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1c.4 (RF1b, RF1c, RF1c2): `itemsMode = 'required'` e os dois mínimos do tipo de ocorrência
 * contra o Postgres de verdade — grava, o `GET` devolve, ausente não altera, o mínimo de produtos sem
 * `required` é recusado pelo caso de uso (lendo o gravado) e, na corrida, pela CHECK traduzida.
 * Molde de `occurrence-type-items-mode.integration.ts`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies } from '../../src/database/identity.schema.js'
import { saveOccurrenceTypeWithTemplate } from '../../src/trips/application/save-occurrence-type.use-case.js'
import { OccurrenceTypeItemsMinimumRequiresRequiredError } from '../../src/trips/domain/trip.error.js'
import {
  findOccurrenceType,
  listOccurrenceTypes,
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
  const databaseName = `transportada_mnc_${crypto.randomUUID().replaceAll('-', '')}`
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
    companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    name: 'Recusa total',
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

describe('os mínimos do tipo de ocorrência contra o Postgres (spec 246 T1c.4)', () => {
  testWithPostgres('grava, o GET devolve, e ausente não altera nenhum dos dois', async () => {
    await withCompany(async ({ companyId, provider }) => {
      const created = await saveOccurrenceType(
        provider.db,
        baseValues(companyId, {
          itemsMinimumCount: 2,
          itemsMode: 'required',
          photoMinimumCount: 3,
        }),
      )
      expect(created.itemsMode).toBe('required')
      expect(created.itemsMinimumCount).toBe(2)
      expect(created.photoMinimumCount).toBe(3)
      const [listed] = await listOccurrenceTypes(provider.db, { companyId })
      expect(listed?.itemsMinimumCount).toBe(2)
      expect(listed?.photoMinimumCount).toBe(3)

      // Regrava só com outro nome, sem os campos (o editor antigo) — os dois valores sobrevivem.
      const renamed = await saveOccurrenceType(
        provider.db,
        baseValues(companyId, { name: 'Recusa parcial', occurrenceTypeId: created.id }),
      )
      expect(renamed.itemsMode).toBe('required')
      expect(renamed.itemsMinimumCount).toBe(2)
      expect(renamed.photoMinimumCount).toBe(3)

      // `null` é um valor: "todos os itens da nota".
      const allItems = await saveOccurrenceType(
        provider.db,
        baseValues(companyId, { itemsMinimumCount: null, occurrenceTypeId: created.id }),
      )
      expect(allItems.itemsMinimumCount).toBeNull()
      expect(allItems.photoMinimumCount).toBe(3)
    })
  })

  testWithPostgres('criação sem os campos usa os padrões: foto 1, produtos todos', async () => {
    await withCompany(async ({ companyId, provider }) => {
      const created = await saveOccurrenceType(provider.db, baseValues(companyId))

      expect(created.photoMinimumCount).toBe(1)
      expect(created.itemsMinimumCount).toBeNull()
    })
  })

  testWithPostgres(
    'o caso de uso lê o gravado: sair de required sem zerar o mínimo é 422',
    async () => {
      await withCompany(async ({ companyId, provider }) => {
        const created = await saveOccurrenceType(
          provider.db,
          baseValues(companyId, { itemsMinimumCount: 3, itemsMode: 'required' }),
        )

        const saveWithItemsMode = (extra: Partial<SaveInput>) =>
          saveOccurrenceTypeWithTemplate({
            companyId,
            findCurrentType: (input) => findOccurrenceType(provider.db, input),
            save: (values) => saveOccurrenceType(provider.db, { ...values, companyId }),
            templates: { hasActiveEmailTemplate: async () => true },
            values: { ...baseValues(companyId, { occurrenceTypeId: created.id }), ...extra },
          })

        await expect(saveWithItemsMode({ itemsMode: 'optional' })).rejects.toBeInstanceOf(
          OccurrenceTypeItemsMinimumRequiresRequiredError,
        )
        const [stillRequired] = await listOccurrenceTypes(provider.db, { companyId })
        expect(stillRequired?.itemsMode).toBe('required')
        expect(stillRequired?.itemsMinimumCount).toBe(3)

        const left = await saveWithItemsMode({ itemsMinimumCount: null, itemsMode: 'optional' })
        expect(left.itemsMode).toBe('optional')
        expect(left.itemsMinimumCount).toBeNull()
      })
    },
  )

  testWithPostgres('na corrida, a CHECK da forma vira o mesmo 422 e nada é gravado', async () => {
    await withCompany(async ({ companyId, provider }) => {
      const created = await saveOccurrenceType(
        provider.db,
        baseValues(companyId, { itemsMode: 'optional' }),
      )

      await expect(
        saveOccurrenceType(
          provider.db,
          baseValues(companyId, { itemsMinimumCount: 2, occurrenceTypeId: created.id }),
        ),
      ).rejects.toBeInstanceOf(OccurrenceTypeItemsMinimumRequiresRequiredError)
      const [stored] = await listOccurrenceTypes(provider.db, { companyId })
      expect(stored?.itemsMinimumCount).toBeNull()
    })
  })
})
