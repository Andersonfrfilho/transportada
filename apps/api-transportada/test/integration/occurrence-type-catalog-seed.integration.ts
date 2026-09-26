/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Prova viva de bootstrap (defeito medido em 21/09/2026, revisão de idempotência em 21/09/2026):
 * `company_occurrence_types` vazia em staging e produção, migration sem `INSERT`. O seed só
 * semeia empresa com catálogo **vazio** — empresa com qualquer tipo (mesmo um só, mesmo
 * aposentado ou renomeado) fica intocada para sempre, para não competir com o cadastro.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies } from '../../src/database/identity.schema.js'
import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import { OCCURRENCE_TYPE_CATALOG } from '../../src/shared/occurrence-type-catalog.constant.js'
import { seedOccurrenceTypeCatalog } from '../../src/database/occurrence-type-catalog-seed.service.js'
import { createDrizzleOccurrenceTypeCatalogSeedPort } from '../../src/database/occurrence-type-catalog-seed.repository.js'

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
  const databaseName = `transportada_occ_seed_${crypto.randomUUID().replaceAll('-', '')}`
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

describe('seed do catálogo de tipos de ocorrência contra Postgres real', () => {
  testWithPostgres(
    'preserva empresa com catálogo parcial, e a segunda execução não cria nada',
    async () => {
      await withDisposableDatabase(async (connectionString) => {
        const provider = createDrizzleProvider({
          connection: { adapter: 'postgres', max: 1, url: connectionString },
        })

        try {
          const [companyWithOneRetiredType] = await provider.db
            .insert(companies)
            .values([{ status: 'active' }])
            .returning({ id: companies.id })
          const [companyEmpty] = await provider.db
            .insert(companies)
            .values([{ status: 'active' }])
            .returning({ id: companies.id })
          if (companyWithOneRetiredType === undefined || companyEmpty === undefined) {
            throw new Error('Failed to seed companies')
          }

          const [firstEntry] = OCCURRENCE_TYPE_CATALOG
          if (firstEntry === undefined) throw new Error('Catálogo vazio')

          // Empresa com um único tipo, aposentado e renomeado pela transportadora — simula uma
          // instalação que cadastrou (e depois editou) um tipo antes do seed existir.
          await provider.db.insert(companyOccurrenceTypes).values([
            {
              active: false,
              companyId: companyWithOneRetiredType.id,
              name: 'Nome trocado pela transportadora',
              stage: firstEntry.stage,
            },
          ])

          const port = createDrizzleOccurrenceTypeCatalogSeedPort(provider.db)

          const firstRun = await seedOccurrenceTypeCatalog({ port })
          const secondRun = await seedOccurrenceTypeCatalog({ port })

          expect(secondRun).toBe(0)

          // A empresa vazia recebeu o catálogo inteiro.
          const emptyCompanyTypes = await provider.db
            .select({ name: companyOccurrenceTypes.name, stage: companyOccurrenceTypes.stage })
            .from(companyOccurrenceTypes)
            .where(eq(companyOccurrenceTypes.companyId, companyEmpty.id))

          expect(emptyCompanyTypes).toHaveLength(OCCURRENCE_TYPE_CATALOG.length)

          // Spec 208: o tipo novo grava com os defaults de coluna — sem foto, sem soltar a nota —
          // porque insertOccurrenceTypes só escreve companyId/name/stage.
          const [boletoType] = await provider.db
            .select({
              attachmentMode: companyOccurrenceTypes.attachmentMode,
              leavesDocumentBehind: companyOccurrenceTypes.leavesDocumentBehind,
              stage: companyOccurrenceTypes.stage,
            })
            .from(companyOccurrenceTypes)
            .where(eq(companyOccurrenceTypes.name, 'Cliente pediu segunda via do boleto'))

          expect(boletoType).toBeDefined()
          expect(boletoType?.stage).toBe('delivery')
          expect(boletoType?.attachmentMode).toBe('off')
          expect(boletoType?.leavesDocumentBehind).toBe(false)

          // A empresa com um tipo continua com exatamente esse tipo — os outros seis nunca chegam,
          // e o nome/estado editados pela transportadora seguem intocados.
          const partialCompanyTypes = await provider.db
            .select({ active: companyOccurrenceTypes.active, name: companyOccurrenceTypes.name })
            .from(companyOccurrenceTypes)
            .where(eq(companyOccurrenceTypes.companyId, companyWithOneRetiredType.id))

          expect(partialCompanyTypes).toHaveLength(1)
          expect(partialCompanyTypes[0]?.active).toBe(false)
          expect(partialCompanyTypes[0]?.name).toBe('Nome trocado pela transportadora')

          // A empresa vazia é o que a primeira execução criou — não é zero.
          expect(firstRun).toBe(OCCURRENCE_TYPE_CATALOG.length)
        } finally {
          await provider.close()
        }
      })
    },
  )
})
