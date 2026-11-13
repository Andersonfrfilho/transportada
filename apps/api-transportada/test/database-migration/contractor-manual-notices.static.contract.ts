/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 T2 (D4): o registro do aviso manual à contratante entra aditivo — uma tabela nova, sem tocar o aviso
 * automático, os tipos nem `idempotency_records`. O rollback recusa rodar com aviso gravado e só desfaz o que a T2 criou.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_contractor_manual_notices'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('contractor_manual_notices migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('o registro do aviso manual entra aditivo (spec 324 T2)', () => {
  test('só cria a tabela nova, sem UPDATE, DROP nem ALTER de tabela existente', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('CREATE TABLE "occurrence_contractor_manual_notices"')
    expect(text).toContain(`CHECK ("status" in ('sent', 'failed'))`)
    expect(text).toContain(`CHECK ("status" <> 'sent' or "channel" is not null)`)
    expect(text).toContain(
      'REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE CASCADE',
    )
    expect(text).not.toMatch(/\bUPDATE\b(?! CASCADE)/u)
    expect(text).not.toMatch(/\bDROP\b/u)
    const altered = [...text.matchAll(/ALTER TABLE "([^"]+)"/gu)].map((match) => match[1])
    expect(altered.filter((table) => table !== 'occurrence_contractor_manual_notices')).toEqual([])
  })

  test('o rollback recusa aviso gravado e só desfaz a tabela da T2', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('refusing to drop the spec 324 T2 table')
    expect(text).toContain('DROP TABLE "occurrence_contractor_manual_notices";')
    expect(text).not.toContain('"idempotency_records"')
    expect(text).not.toContain('"company_occurrence_types"')
  })
})
