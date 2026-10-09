/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T2.1 (ADR-0102 §3, D11): a migration da chave da FeriadosAPI é aditiva e pequena. Os nomes de
 * constraint são explícitos e cabem nos 63 bytes do Postgres; a CHECK da chave não deixa buraco de NULL; o
 * rollback apaga só a tabela (nenhum dado de negócio) e a linha do journal, sem recusar.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  BUDGET_MAX,
  BUDGET_MIN,
  COLUMN_NAMES,
  CONSTRAINT_NAMES,
  EXPECTED_NAME_BYTES,
  MIGRATION_SUFFIX,
  POSTGRES_IDENTIFIER_MAX_BYTES,
  TABLE_NAME,
} from './holiday-provider-settings.constant.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

/** A maior das migrations da spec 260 (fora de staging): a 262 tem de ser mais nova que ela (E15). */
const NEWEST_SPEC_260_MIGRATION = '20261009205256_quick_reply_driver_audience'

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

describe('the holiday provider settings migration enters additive', () => {
  test('every explicit name fits in the 63 bytes Postgres keeps, with the lengths the ADR counted', () => {
    for (const [name, expectedBytes] of Object.entries(EXPECTED_NAME_BYTES)) {
      const bytes = new TextEncoder().encode(name).length
      expect(bytes).toBe(expectedBytes)
      expect(bytes).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_BYTES)
    }
    expect(new TextEncoder().encode(TABLE_NAME).length).toBe(25)
  })

  test('the directory is newer than the newest migration of spec 260 and last in the chain', async () => {
    const { directory } = await readMigration('migration.sql')
    const directories = await listMigrationDirectories()

    expect(directory > NEWEST_SPEC_260_MIGRATION).toBe(true)
    expect(directories.at(-1)).toBe(directory)
  })

  test('the migration creates one table with the ten columns and the five named constraints, nothing else', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions.match(/CREATE TABLE/gu)).toHaveLength(1)
    expect(instructions).toContain(`CREATE TABLE "${TABLE_NAME}"`)
    for (const column of COLUMN_NAMES) expect(instructions).toContain(`"${column}"`)
    for (const name of [
      CONSTRAINT_NAMES.budgetCheck,
      CONSTRAINT_NAMES.providerCheck,
      CONSTRAINT_NAMES.providerUnique,
      CONSTRAINT_NAMES.tokenCheck,
      CONSTRAINT_NAMES.versionCheck,
    ]) {
      expect(instructions).toContain(`CONSTRAINT "${name}"`)
    }
    expect(instructions).not.toMatch(/\b(ALTER|DROP|UPDATE|DELETE|INSERT|TRUNCATE)\b/u)
    expect(instructions).not.toMatch(/CREATE TYPE|\bENUM\b/iu)
    expect(instructions).not.toMatch(/\bREFERENCES\b|FOREIGN KEY/iu)
  })

  test('the checks bound the budget, the version and the provider, and leave no NULL hole in the token check', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions).toContain(`"provider" in ('feriadosapi')`)
    expect(instructions).toContain(
      `"monthly_request_budget" between ${BUDGET_MIN} and ${BUDGET_MAX}`,
    )
    expect(instructions).toContain('"version" > 0')
    const tokenCheck = instructions.slice(
      instructions.indexOf(`CONSTRAINT "${CONSTRAINT_NAMES.tokenCheck}"`),
    )
    expect(tokenCheck).toContain(`jsonb_typeof("token_envelope") = 'object'`)
    expect(tokenCheck).toContain('"token_hint" IS NOT NULL')
    expect(tokenCheck).toContain('"token_updated_at" IS NOT NULL')
    expect(tokenCheck).toContain('"token_envelope" IS NULL')
  })

  test('the rollback drops only the table, then the journal entry with ROW_COUNT, and never refuses', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      `DROP TABLE "${TABLE_NAME}";`,
      `WHERE "name" = '${directory}'`,
      'GET DIAGNOSTICS deleted_migrations = ROW_COUNT;',
      'IF deleted_migrations <> 1 THEN',
      'COMMIT;',
    ].map((fragment) => {
      const position = text.indexOf(fragment)
      if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
      return position
    })

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    const instructions = withoutComments(text)
    expect(instructions.match(/\bDROP\b/gu)).toHaveLength(1)
    // D11: nenhum dado de negócio; a chave se reemite no fornecedor. Só a conferência do journal levanta erro.
    expect(instructions.match(/RAISE EXCEPTION/gu)).toHaveLength(1)
    expect(instructions).not.toMatch(/\bCASCADE\b|\bALTER\b|\bUPDATE\b|\bCONCURRENTLY\b/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
