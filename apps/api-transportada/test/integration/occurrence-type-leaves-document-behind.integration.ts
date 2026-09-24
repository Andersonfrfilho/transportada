/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 T2.1 (RF6/CA06, ADR-0074 §4): "a viagem segue sem a nota" contra o Postgres de
 * verdade — os contratos (`leaves-document-behind-schema.contract.ts`,
 * `leaves-document-behind.contract.ts`) não tocam o banco, e é aqui que a persistência real e a
 * CHECK nova (`company_occurrence_types_leaves_document_behind_check`) são exercitadas de fato, no
 * molde de `occurrence-type-catalog-seed.integration.ts`.
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
  const databaseName = `transportada_lvb_${crypto.randomUUID().replaceAll('-', '')}`
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

function baseValues(companyId: string, overrides: Partial<Parameters<typeof saveOccurrenceType>[1]> = {}) {
  return {
    active: true,
    allowsMultipleItems: true,
    companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    name: 'Item faltante',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'separation' as const,
    ...overrides,
  }
}

describe('"a viagem segue sem a nota" contra o Postgres (spec 185 T2.1)', () => {
  testWithPostgres('GET devolve false por padrão quando o cadastro não manda o campo', async () => {
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
        expect(types).toHaveLength(1)
        expect(types[0]?.leavesDocumentBehind).toBe(false)
      } finally {
        await provider.close()
      }
    })
  })

  testWithPostgres(
    'PUT com true num tipo de separação grava, e ausente depois não apaga (CA06)',
    async () => {
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
            baseValues(company.id, { leavesDocumentBehind: true }),
          )
          expect(created.leavesDocumentBehind).toBe(true)

          const afterCreate = await listOccurrenceTypes(provider.db, { companyId: company.id })
          expect(afterCreate[0]?.leavesDocumentBehind).toBe(true)

          // Regrava o mesmo tipo sem mandar o campo (o editor do painel ainda não manda) — o valor
          // gravado tem de sobreviver, exatamente como `attachmentMode` (spec 179).
          await saveOccurrenceType(
            provider.db,
            baseValues(company.id, {
              name: 'Item faltante (renomeado)',
              occurrenceTypeId: created.id,
            }),
          )

          const afterUpdate = await listOccurrenceTypes(provider.db, { companyId: company.id })
          expect(afterUpdate).toHaveLength(1)
          expect(afterUpdate[0]?.name).toBe('Item faltante (renomeado)')
          expect(afterUpdate[0]?.leavesDocumentBehind).toBe(true)
        } finally {
          await provider.close()
        }
      })
    },
  )

  testWithPostgres(
    'a CHECK recusa tipo de entrega com leavesDocumentBehind true — a rede atrás da validação',
    async () => {
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

          await expect(
            saveOccurrenceType(
              provider.db,
              baseValues(company.id, { leavesDocumentBehind: true, stage: 'delivery' }),
            ),
          ).rejects.toThrow()
        } finally {
          await provider.close()
        }
      })
    },
  )
})
