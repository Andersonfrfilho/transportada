/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T1: as marcas do tipo entram aditivas — duas colunas booleanas com padrão que não muda tipo nenhum, sem
 * `UPDATE`. O rollback recusa rodar com tipo marcado e só desfaz o que a 321 criou.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_contractor_notice_block'
const TYPES = '"company_occurrence_types"'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('occurrence_contractor_notice_block is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('as marcas da contratante e da carga entram aditivas (spec 321 T1)', () => {
  test('colunas com padrão que mantém o comportamento de hoje, sem UPDATE nem DROP', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      `ALTER TABLE ${TYPES} ADD COLUMN "blocks_contractor_notice" boolean DEFAULT false NOT NULL;`,
    )
    expect(text).toContain(
      `ALTER TABLE ${TYPES} ADD COLUMN "counts_cargo_on_pickup_trip" boolean DEFAULT true NOT NULL;`,
    )
    expect(text).not.toMatch(/\bUPDATE\b/u)
    expect(text).not.toMatch(/\bDROP\b/u)
  })

  test('o rollback recusa tipo marcado e só toca o que a 321 criou', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('refusing to drop the spec 321 columns')
    expect(text).toContain('WHERE "blocks_contractor_notice" OR NOT "counts_cargo_on_pickup_trip"')
    expect(text).toContain('DROP COLUMN "blocks_contractor_notice"')
    expect(text).toContain('DROP COLUMN "counts_cargo_on_pickup_trip"')
    expect(text).not.toContain('"emails_contractor"')
    expect(text).not.toContain('"notifies"')
  })
})
