/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1c.2 (RF1c, RF1c2, D-a), contra Postgres real: o **valor da coluna** depois da migration
 * dos mínimos, sobre tipos e exceções gravados **antes** das colunas novas. O `migration-test` roda
 * sobre banco vazio — é aqui que o `UPDATE` encontra linhas. O banco descartável nasce migrado, desfaz
 * só esta migration pelo próprio `rollback.sql`, recebe o dado antigo, e o migrador reaplica o
 * `migration.sql` lido do disco: o que este teste prova é o que vai para produção.
 */
import { join } from 'node:path'

import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { withDisposableDatabase } from '../fixtures/disposable-database.fixture.js'

const MIGRATION_DIRECTORY = new URL(
  '../../drizzle/20261006205209_occurrence_type_quantity_minimums/',
  import.meta.url,
)
const TYPES = 'company_occurrence_types'
const CONTRACTOR_OVERRIDES = 'company_occurrence_type_contractor_overrides'
const RECIPIENT_OVERRIDES = 'company_occurrence_type_recipient_overrides'
const CONTRACTOR_TAX_ID = '30290856000160'
const RECIPIENT_TAX_ID = '12345678000190'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TypeSeed = Readonly<{ attachmentMode: string; id: string; itemsMode: string }>

type TypeRow = Readonly<{
  items_minimum_count: number | null
  items_mode: string
  photo_minimum_count: number
}>

type OverrideRow = Readonly<{
  items_minimum_count: number | null
  items_mode: string | null
  photo_minimum_count: number | null
}>

const TYPE_SEEDS: readonly TypeSeed[] = [
  { attachmentMode: 'required', id: crypto.randomUUID(), itemsMode: 'optional' },
  { attachmentMode: 'optional', id: crypto.randomUUID(), itemsMode: 'optional' },
  { attachmentMode: 'off', id: crypto.randomUUID(), itemsMode: 'off' },
]

async function seedBeforeColumns(database: SQL, connectionString: string): Promise<string[]> {
  const rollback = await Bun.file(join(MIGRATION_DIRECTORY.pathname, 'rollback.sql')).text()
  await database.unsafe(rollback)

  const companyId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${companyId}, 'active')`
  for (const seed of TYPE_SEEDS) {
    await database`
      insert into company_occurrence_types (id, company_id, name, stage, attachment_mode, items_mode)
      values (${seed.id}, ${companyId}, ${`Tipo ${seed.attachmentMode}`}, 'delivery',
        ${seed.attachmentMode}, ${seed.itemsMode})
    `
  }
  await database`
    insert into contractors (id, company_id, tax_id) values (${contractorId}, ${companyId}, ${CONTRACTOR_TAX_ID})
  `
  await database`insert into delivery_clients (company_id, tax_id) values (${companyId}, ${RECIPIENT_TAX_ID})`
  const overrideIds = [crypto.randomUUID(), crypto.randomUUID()]
  const typeId = TYPE_SEEDS[0]?.id
  await database`
    insert into company_occurrence_type_contractor_overrides
      (id, company_id, occurrence_type_id, contractor_id, attachment_mode)
    values (${overrideIds[0]}, ${companyId}, ${typeId}, ${contractorId}, 'optional')
  `
  await database`
    insert into company_occurrence_type_recipient_overrides
      (id, company_id, occurrence_type_id, tax_id, attachment_mode)
    values (${overrideIds[1]}, ${companyId}, ${typeId}, ${RECIPIENT_TAX_ID}, 'off')
  `

  await runDatabaseMigrations({ connectionString })
  return overrideIds
}

async function readRow<TRow>(database: SQL, table: string, id: string | undefined): Promise<TRow> {
  const [row] = (await database.unsafe(
    `select items_mode, photo_minimum_count, items_minimum_count from ${table} where id = $1`,
    [id],
  )) as TRow[]
  if (row === undefined) throw new Error(`Seeded row ${id} vanished from ${table}`)
  return row
}

describe('os mínimos nascem sem mudar o que já está gravado (spec 246 T1c.2)', () => {
  testWithPostgres(
    'todo tipo antigo sai com mínimo de foto 1, produtos intactos; exceções herdam (nulas)',
    async () => {
      if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
      await withDisposableDatabase({
        adminUrl: databaseUrl,
        namePrefix: 'transportada_qtymin',
        migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
        open: (connectionString) => new SQL(connectionString, { max: 1 }),
        operation: async (database, connectionString) => {
          const overrideIds = await seedBeforeColumns(database, connectionString)

          // O mínimo de foto 1 preserva a foto obrigatória de hoje; o de produtos fica nulo (todos).
          expect(TYPE_SEEDS).toHaveLength(3)
          for (const seed of TYPE_SEEDS) {
            expect(await readRow<TypeRow>(database, TYPES, seed.id)).toEqual({
              items_minimum_count: null,
              items_mode: seed.itemsMode,
              photo_minimum_count: 1,
            })
          }

          // Exceção existente: tudo nulo, herda o tipo — o backfill não escolhe por ninguém.
          const inherits: OverrideRow = {
            items_minimum_count: null,
            items_mode: null,
            photo_minimum_count: null,
          }
          expect(
            await readRow<OverrideRow>(database, CONTRACTOR_OVERRIDES, overrideIds[0]),
          ).toEqual(inherits)
          expect(await readRow<OverrideRow>(database, RECIPIENT_OVERRIDES, overrideIds[1])).toEqual(
            inherits,
          )
        },
      })
    },
    60_000,
  )
})
