/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1c.3 (RF1b): `allowsMultipleItems` do tipo de ocorrência contra o Postgres de verdade —
 * grava, o `GET` devolve, ausente não altera, e a criação sem o campo usa o padrão da coluna.
 * Molde de `occurrence-type-redelivery-policy.integration.ts`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies } from '../../src/database/identity.schema.js'
import {
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
  const databaseName = `transportada_ami_${crypto.randomUUID().replaceAll('-', '')}`
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
    name: 'Item avariado',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
    ...overrides,
  }
}

describe('"allowsMultipleItems" do tipo de ocorrência contra o Postgres (spec 246 T1c.3)', () => {
  testWithPostgres('grava, o GET devolve, e ausente não altera', async () => {
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

        const created = await saveOccurrenceType(
          provider.db,
          baseValues(company.id, { allowsMultipleItems: false }),
        )
        expect(created.allowsMultipleItems).toBe(false)
        const afterCreate = await listOccurrenceTypes(provider.db, { companyId: company.id })
        expect(afterCreate[0]?.allowsMultipleItems).toBe(false)

        // Regrava só com outro nome, sem o campo (o editor antigo) — o `false` tem de sobreviver.
        const renamed = await saveOccurrenceType(
          provider.db,
          baseValues(company.id, { name: 'Item faltante', occurrenceTypeId: created.id }),
        )
        expect(renamed.allowsMultipleItems).toBe(false)
        const afterRename = await listOccurrenceTypes(provider.db, { companyId: company.id })
        expect(afterRename[0]?.allowsMultipleItems).toBe(false)

        const reopened = await saveOccurrenceType(
          provider.db,
          baseValues(company.id, {
            allowsMultipleItems: true,
            name: 'Item faltante',
            occurrenceTypeId: created.id,
          }),
        )
        expect(reopened.allowsMultipleItems).toBe(true)
      } finally {
        await provider.close()
      }
    })
  })

  testWithPostgres('criação sem o campo usa o padrão da coluna (true)', async () => {
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

        const created = await saveOccurrenceType(provider.db, baseValues(company.id))
        expect(created.allowsMultipleItems).toBe(true)
      } finally {
        await provider.close()
      }
    })
  })
})
