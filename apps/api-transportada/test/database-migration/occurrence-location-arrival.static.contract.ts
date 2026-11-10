/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 315 T2/T2b: a migration da localização, do horário de chegada e da espera mínima é aditiva — colunas do
 * tipo com padrão constante, CHECKs depois das colunas, nenhum `UPDATE` em dado. O rollback recusa rodar com tipo
 * configurado e só desfaz o que a 315 criou.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_location_arrival'
const POSTGRES_IDENTIFIER_MAX_LENGTH = 63
const TYPES = '"company_occurrence_types"'
const CONSTRAINTS = [
  'company_occurrence_types_location_mode_check',
  'company_occurrence_types_arrival_time_mode_check',
  'company_occurrence_types_min_wait_check',
] as const

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('occurrence_location_arrival is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('a localização e o horário de chegada entram aditivos (spec 315 T2)', () => {
  test('todo nome de CHECK cabe em 63 caracteres', () => {
    for (const name of CONSTRAINTS) {
      expect(name.length).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_LENGTH)
    }
  })

  test('colunas com padrão constante, CHECKs depois delas, sem UPDATE', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    const columns = [
      `ALTER TABLE ${TYPES} ADD COLUMN "location_mode" varchar(16) DEFAULT 'off' NOT NULL;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "arrival_time_mode" varchar(16) DEFAULT 'off' NOT NULL;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "min_wait_after_arrival_minutes" smallint;`,
    ]
    const lastColumn = Math.max(...columns.map((fragment) => text.indexOf(fragment)))
    for (const fragment of columns) expect(text).toContain(fragment)
    for (const name of CONSTRAINTS) {
      expect(text.indexOf(`ADD CONSTRAINT "${name}"`)).toBeGreaterThan(lastColumn)
    }
    expect(text).not.toMatch(/\bUPDATE\b/u)
    expect(text).not.toMatch(/\bDROP\b/u)
  })

  test('a espera mínima exclui o horário de chegada digitado', async () => {
    const text = await readMigration('migration.sql')
    expect(text).toContain(
      `CHECK ("min_wait_after_arrival_minutes" is null or ("min_wait_after_arrival_minutes" between 1 and 1440 and "arrival_time_mode" = 'off'))`,
    )
  })

  test('o rollback recusa tipo configurado e só toca o que a 315 criou', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('refusing to drop the spec 315 columns')
    for (const name of CONSTRAINTS) expect(text).toContain(`DROP CONSTRAINT "${name}"`)
    for (const column of ['location_mode', 'arrival_time_mode', 'min_wait_after_arrival_minutes']) {
      expect(text).toContain(`DROP COLUMN "${column}"`)
    }
    expect(text).not.toContain('"items_mode"')
    expect(text).not.toContain('"attachment_mode"')
  })
})
