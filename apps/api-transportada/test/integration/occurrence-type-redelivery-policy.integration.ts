/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 242 (spec 164 RF1/T21): `redeliveryPolicy` do tipo de ocorrência contra o Postgres de
 * verdade — grava, sobrevive a regravação sem o campo, e o `GET` o devolve. Molde de
 * `occurrence-type-leaves-document-behind.integration.ts`.
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
  const databaseName = `transportada_rdp_${crypto.randomUUID().replaceAll('-', '')}`
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

function baseValues(
  companyId: string,
  overrides: Partial<Parameters<typeof saveOccurrenceType>[1]> = {},
) {
  return {
    active: true,
    allowsMultipleItems: true,
    companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    name: 'Recusa total',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery' as const,
    ...overrides,
  }
}

describe('"redeliveryPolicy" do tipo de ocorrência contra o Postgres (spec 242)', () => {
  testWithPostgres('grava, ausente não altera, e o GET devolve o campo', async () => {
    await withDisposableDatabase(async (connectionString) => {
      const provider = createDrizzleProvider({
        connection: { adapter: 'postgres', max: 1, url: connectionString },
      })

      try {
        const [company] = await provider.db
          .insert(companies)
          .values([{ status: 'active' }])
          .returning({ id: companies.id })
        const [otherCompany] = await provider.db
          .insert(companies)
          .values([{ status: 'active' }])
          .returning({ id: companies.id })
        if (company === undefined || otherCompany === undefined) {
          throw new Error('Failed to seed companies')
        }

        const created = await saveOccurrenceType(
          provider.db,
          baseValues(company.id, { redeliveryPolicy: 'allowed' }),
        )
        expect(created.redeliveryPolicy).toBe('allowed')

        // Regrava só com outro nome, sem o campo (o editor antigo) — o valor tem de sobreviver.
        await saveOccurrenceType(
          provider.db,
          baseValues(company.id, { name: 'Recusa parcial', occurrenceTypeId: created.id }),
        )
        const afterRename = await listOccurrenceTypes(provider.db, { companyId: company.id })
        expect(afterRename).toHaveLength(1)
        expect(afterRename[0]?.name).toBe('Recusa parcial')
        expect(afterRename[0]?.redeliveryPolicy).toBe('allowed')

        await saveOccurrenceType(
          provider.db,
          baseValues(company.id, {
            name: 'Recusa parcial',
            occurrenceTypeId: created.id,
            redeliveryPolicy: 'blocked',
          }),
        )
        const afterBlock = await listOccurrenceTypes(provider.db, { companyId: company.id })
        expect(afterBlock[0]?.redeliveryPolicy).toBe('blocked')

        const otherTypes = await listOccurrenceTypes(provider.db, { companyId: otherCompany.id })
        expect(otherTypes).toHaveLength(0)
      } finally {
        await provider.close()
      }
    })
  })

  testWithPostgres('criação sem o campo usa o padrão da coluna (unset)', async () => {
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

        await saveOccurrenceType(provider.db, baseValues(company.id))
        const types = await listOccurrenceTypes(provider.db, { companyId: company.id })
        expect(types[0]?.redeliveryPolicy).toBe('unset')
      } finally {
        await provider.close()
      }
    })
  })
})
