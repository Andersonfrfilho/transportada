/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1b.4 (CA00b), contra Postgres real: o backfill da tabela de momentos sobre tipos gravados
 * **antes** dela. Verifica as **linhas** da tabela — a leitura tolerante devolveria os mesmos
 * conjuntos com a tabela vazia, e mascararia um backfill arrancado. O banco descartável nasce
 * migrado, desfaz só a T1b.1 pelo próprio `rollback.sql`, recebe os tipos antigos, e o migrador
 * reaplica o `migration.sql` lido do disco (o molde da T1.3).
 */
import { join } from 'node:path'

import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { withDisposableDatabase } from '../fixtures/disposable-database.fixture.js'

const MIGRATION_DIRECTORY = new URL(
  '../../drizzle/20261006205158_occurrence_type_moments/',
  import.meta.url,
)
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

/** A tabela do plan, uma semente por linha — mais o tipo aposentado, que também entra. */
const SEEDS = [
  {
    active: true,
    flow: 'document',
    key: 'warehouse',
    moments: ['separation'],
    stage: 'separation',
  },
  {
    active: true,
    flow: 'stop',
    key: 'warehouseStop',
    moments: ['separation', 'stop'],
    stage: 'separation',
  },
  {
    active: true,
    flow: 'document',
    key: 'note',
    moments: ['document', 'office'],
    stage: 'delivery',
  },
  { active: true, flow: 'stop', key: 'stop', moments: ['office', 'stop'], stage: 'delivery' },
  {
    active: false,
    flow: 'document',
    key: 'retired',
    moments: ['document', 'office'],
    stage: 'delivery',
  },
  /** Spec 237: o tipo de recebimento é da chegada e não ganha linha de momento (terceira revisão A-1). */
  { active: true, flow: 'document', key: 'receiving', moments: [], stage: 'receiving' },
] as const

type MomentRow = Readonly<{ moment: string; occurrence_type_id: string }>

async function seedTypesBeforeTable(database: SQL): Promise<ReadonlyMap<string, string>> {
  const rollback = await Bun.file(join(MIGRATION_DIRECTORY.pathname, 'rollback.sql')).text()
  await database.unsafe(rollback)

  const companyId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${companyId}, 'active')`
  const idByKey = new Map<string, string>()
  for (const seed of SEEDS) {
    const id = crypto.randomUUID()
    idByKey.set(seed.key, id)
    await database`
      insert into company_occurrence_types (id, company_id, name, stage, flow, active)
      values (${id}, ${companyId}, ${seed.key}, ${seed.stage}, ${seed.flow}, ${seed.active})
    `
  }
  return idByKey
}

async function readMomentsByType(database: SQL): Promise<ReadonlyMap<string, readonly string[]>> {
  const rows = (await database`
    select occurrence_type_id, moment from company_occurrence_type_moments
  `) as MomentRow[]
  const byType = new Map<string, string[]>()
  for (const row of rows)
    byType.set(row.occurrence_type_id, [...(byType.get(row.occurrence_type_id) ?? []), row.moment])
  return new Map([...byType].map(([id, moments]) => [id, moments.toSorted()]))
}

/** Os `INSERT`s do backfill, lidos do disco — reexecutá-los não pode criar linha nova. */
async function rerunBackfill(database: SQL): Promise<void> {
  const migration = await Bun.file(join(MIGRATION_DIRECTORY.pathname, 'migration.sql')).text()
  const inserts = migration
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.replaceAll(/^--.*$/gmu, '').trim())
    .filter((statement) => statement.startsWith('INSERT INTO'))
  expect(inserts).toHaveLength(5)
  for (const insert of inserts) await database.unsafe(insert)
}

describe('o backfill dos momentos sobre tipos antigos (spec 246 T1b.4, CA00b)', () => {
  testWithPostgres(
    'cada tipo antigo ganha as linhas da tabela do plan, inativo inclusive, e reexecutar não duplica',
    async () => {
      if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
      await withDisposableDatabase({
        adminUrl: databaseUrl,
        namePrefix: 'transportada_moments',
        migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
        open: (connectionString) => new SQL(connectionString, { max: 1 }),
        operation: async (database, connectionString) => {
          const idByKey = await seedTypesBeforeTable(database)
          await runDatabaseMigrations({ connectionString })

          const momentsByType = await readMomentsByType(database)
          expect(momentsByType.size).toBe(SEEDS.filter((seed) => seed.moments.length > 0).length)
          for (const seed of SEEDS) {
            expect({
              key: seed.key,
              moments: momentsByType.get(idByKey.get(seed.key) ?? '') ?? [],
            }).toEqual({
              key: seed.key,
              moments: [...seed.moments].toSorted(),
            })
          }

          await rerunBackfill(database)
          expect(await readMomentsByType(database)).toEqual(momentsByType)
        },
      })
    },
    60_000,
  )
})
