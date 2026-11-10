/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T2 (D3, D4, CA03): a coleta de canhoto entra aditiva — tabela nova e a marca do tipo com padrão `false` —
 * e não toca `trip_documents` (a trava de entregue e o vínculo vivo seguem). O rollback recusa rodar com coleta
 * gravada ou tipo marcado.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_canhoto_pickups'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('canhoto_pickups migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('a coleta de canhoto entra aditiva (spec 321 T2)', () => {
  test('tabela nova e a marca do tipo com padrão `false`, sem UPDATE nem DROP', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('CREATE TABLE "trip_canhoto_pickups"')
    expect(text).toContain(
      'ALTER TABLE "company_occurrence_types" ADD COLUMN "creates_canhoto_pickup" boolean DEFAULT false NOT NULL;',
    )
    expect(text).toContain(
      `CREATE UNIQUE INDEX "trip_canhoto_pickups_open_origin_unique" ON "trip_canhoto_pickups" ("company_id","origin_trip_document_id") WHERE "status" in ('pending', 'scheduled');`,
    )
    expect(text).not.toMatch(/\bUPDATE\b(?! CASCADE)/u)
    expect(text).not.toMatch(/\bDROP\b/u)
  })

  test('CA03: nada na migration altera `trip_documents` nem a trava de entregue', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).not.toMatch(/ALTER TABLE "trip_documents"/u)
    expect(text).not.toContain('trip_documents_delivered_locks_release_check')
  })

  test('o rollback recusa coleta gravada ou tipo marcado, e só desfaz o que a T2 criou', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('refusing to drop the spec 321 T2 table')
    expect(text).toContain('refusing to drop the spec 321 T2 column')
    expect(text).toContain('DROP TABLE "trip_canhoto_pickups";')
    expect(text).toContain('DROP COLUMN "creates_canhoto_pickup";')
    expect(text).not.toContain('"blocks_contractor_notice"')
    expect(text).not.toContain('"trip_documents"')
  })
})
