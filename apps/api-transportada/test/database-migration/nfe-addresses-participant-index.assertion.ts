/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  INDEX_DEFINITION,
  INDEX_NAME,
  MIGRATION_SUFFIX,
} from './nfe-addresses-participant-index.constant.js'
import { migrationsDirectory } from './support.js'

export type NfeAddressesParticipantIndexProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

/**
 * O índice existe com o nome e as colunas combinados, serve a busca `(company_id, participant_id)` com as
 * DUAS colunas na condição (um índice só por `company_id` pareceria o mesmo índice e filtraria o resto),
 * a migration repete sem erro (o índice criado à mão antes do PR) e o rollback tira só ele.
 */
export async function assertNfeAddressesParticipantIndex(
  probe: NfeAddressesParticipantIndexProbe,
): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error(`${MIGRATION_SUFFIX} migration is required`)

  expect(await readIndexDefinition(database)).toBe(INDEX_DEFINITION)
  const plan = await readParticipantLookupPlan(database)
  expect(plan).toMatch(new RegExp(`Index Scan using ${INDEX_NAME}`, 'u'))
  expect(plan).toMatch(/Index Cond: \(\(company_id = .*\) AND \(participant_id = /u)

  const migration = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'migration.sql'),
  ).text()
  await database.begin((transaction) => transaction.unsafe(migration))
  expect(await readIndexDefinition(database)).toBe(INDEX_DEFINITION)

  // `IF NOT EXISTS` aceitaria calado o resto de um CONCURRENTLY interrompido: a migration recusa.
  await database.unsafe(
    `update pg_index set indisvalid = false where indexrelid = '${INDEX_NAME}'::regclass`,
  )
  await expect(database.begin((transaction) => transaction.unsafe(migration))).rejects.toThrow(
    'INVÁLIDO',
  )
  await database.unsafe(
    `update pg_index set indisvalid = true where indexrelid = '${INDEX_NAME}'::regclass`,
  )

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(`drop index ${INDEX_NAME}`)
  await database.unsafe(rollback)
  expect(await readIndexDefinition(database)).toBeNull()
  const journal = await database<Array<{ readonly name: string }>>`
    select name from drizzle.__drizzle_migrations where name = ${directory}
  `
  expect(journal).toEqual([])

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await readIndexDefinition(database)).toBe(INDEX_DEFINITION)

  await database.unsafe(rollback)
  expect(await readIndexDefinition(database)).toBeNull()
  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await readIndexDefinition(database)).toBe(INDEX_DEFINITION)
}

async function readIndexDefinition(database: SQL): Promise<string | null> {
  const [row] = await database<Array<{ readonly indexdef: string }>>`
    select indexdef from pg_indexes where indexname = ${INDEX_NAME}
  `
  return row?.indexdef ?? null
}

/** Tabela vazia faz o planejador preferir varredura sequencial; desligá-la mostra o que o índice serve. */
async function readParticipantLookupPlan(database: SQL): Promise<string> {
  return database.begin(async (transaction) => {
    await transaction`set local enable_seqscan = off`
    await transaction`set local enable_bitmapscan = off`
    const rows = await transaction<Array<{ readonly 'QUERY PLAN': string }>>`
      explain
      select id from nfe_addresses
      where company_id = ${crypto.randomUUID()}::uuid
        and participant_id = ${crypto.randomUUID()}::uuid
    `
    return rows.map((row) => row['QUERY PLAN']).join('\n')
  })
}
