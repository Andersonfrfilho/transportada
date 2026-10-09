/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 (T3.2 / T6.1): a migration do índice de `nfe_addresses` é só um índice, e o dono de cada
 * decisão que o usuário confere antes de levar a produção está aqui: comum e não `CONCURRENTLY` (o
 * migrador aplica o lote numa transação), com `IF NOT EXISTS` (para o índice criado à mão antes do PR),
 * `lock_timeout` em volta e nome explícito dentro dos 63 bytes do Postgres.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { nfeAddresses } from '../../src/database/nfe.schema.js'
import {
  INDEX_COLUMNS,
  INDEX_NAME,
  MIGRATION_SUFFIX,
  POSTGRES_IDENTIFIER_MAX_BYTES,
} from './nfe-addresses-participant-index.constant.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const CREATE_INDEX = `CREATE INDEX IF NOT EXISTS "${INDEX_NAME}" ON "nfe_addresses" ("company_id","participant_id");`

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error(`${MIGRATION_SUFFIX} migration is required`)
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

function positionOf(sqlText: string, fragment: string): number {
  const position = sqlText.indexOf(fragment)
  if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
  return position
}

describe('the nfe_addresses participant index enters additive', () => {
  test('the explicit name fits in the 63 bytes Postgres keeps', () => {
    expect(new TextEncoder().encode(INDEX_NAME).length).toBeLessThanOrEqual(
      POSTGRES_IDENTIFIER_MAX_BYTES,
    )
  })

  test('the migration refuses an INVALID leftover, then one plain CREATE INDEX IF NOT EXISTS, between the lock_timeout guards', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions.match(/CREATE INDEX/gu)).toHaveLength(1)
    expect(instructions).toContain(CREATE_INDEX)
    // O migrador roda o lote numa transação: `CONCURRENTLY` aborta com 25001.
    expect(instructions).not.toContain('CONCURRENTLY')
    expect(instructions).not.toMatch(/\b(ALTER|DROP|UPDATE|DELETE|INSERT|TRUNCATE)\b/u)

    const order = [
      `SET LOCAL lock_timeout = '3s';`,
      'NOT "indisvalid"',
      'RAISE EXCEPTION',
      CREATE_INDEX,
      'SET LOCAL lock_timeout = DEFAULT;',
    ].map((fragment) => positionOf(instructions, fragment))
    expect(order).toEqual(order.toSorted((left, right) => left - right))
  })

  test('the rollback drops only the index, then the journal entry with ROW_COUNT', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      `DROP INDEX IF EXISTS "${INDEX_NAME}";`,
      `WHERE "name" = '${directory}'`,
      'GET DIAGNOSTICS deleted_migrations = ROW_COUNT;',
      'IF deleted_migrations <> 1 THEN',
      'COMMIT;',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    const instructions = withoutComments(text)
    expect(instructions.match(/\bDROP\b/gu)).toHaveLength(1)
    expect(instructions).not.toMatch(/\bCASCADE\b|\bALTER\b|\bUPDATE\b|\bCONCURRENTLY\b/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })

  test('the TypeScript schema declares the same index, so db:generate starts from the truth', () => {
    const declared = getTableConfig(nfeAddresses).indexes.find(
      (index) => index.config.name === INDEX_NAME,
    )

    expect(declared?.config.columns.map((column) => ('name' in column ? column.name : ''))).toEqual(
      [...INDEX_COLUMNS],
    )
    expect(declared?.config.unique).toBe(false)
    expect(declared?.config.where).toBeUndefined()
  })
})
