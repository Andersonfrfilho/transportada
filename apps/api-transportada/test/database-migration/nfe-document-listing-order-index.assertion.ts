/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory } from './support.js'

const LISTING_ORDER_MIGRATION_SUFFIX = '_nfe_document_listing_order_index'
const INDEX_NAME = 'nfe_documents_company_updated_issued_id_idx'
const INDEX_DEFINITION = `CREATE INDEX ${INDEX_NAME} ON public.nfe_documents USING btree (company_id, updated_at DESC, issued_at DESC, id DESC)`

export type NfeDocumentListingOrderProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

/**
 * O índice precisa servir a ordem da listagem sem `Sort` no plano — `DESC NULLS LAST` gravado por
 * engano pareceria o mesmo índice e obrigaria o banco a ordenar a empresa inteira. E o rollback
 * precisa tirar só ele, deixando a migration reaplicável.
 */
export async function assertNfeDocumentListingOrderIndex(
  probe: NfeDocumentListingOrderProbe,
): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(LISTING_ORDER_MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('NF-e document listing order migration is required')

  expect(await readIndexDefinition(database)).toBe(INDEX_DEFINITION)
  const plan = await readListingPlan(database)
  expect(plan).toMatch(new RegExp(`Index (Only )?Scan using ${INDEX_NAME}`))
  expect(plan).not.toContain('Sort')

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
  expect(await readIndexDefinition(database)).toBeNull()
  const journal = await database<Array<{ readonly name: string }>>`
    select name from drizzle.__drizzle_migrations where name = ${directory}
  `
  expect(journal).toEqual([])

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
async function readListingPlan(database: SQL): Promise<string> {
  return database.begin(async (transaction) => {
    await transaction`set local enable_seqscan = off`
    const rows = await transaction<Array<{ readonly 'QUERY PLAN': string }>>`
      explain
      select id from nfe_documents
      where company_id = ${crypto.randomUUID()}::uuid
        and (updated_at, issued_at, id) < (now(), now(), ${crypto.randomUUID()}::uuid)
      order by updated_at desc, issued_at desc, id desc
      limit 26
    `
    return rows.map((row) => row['QUERY PLAN']).join('\n')
  })
}
