/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T8: o `resolved` do `system` pela coleta de canhoto ganha a causa (`scheduled` = encaixada numa viagem nova,
 * `collected` = canhoto aprovado). Aditivo: coluna anulável, CHECK novo, nenhum dado reescrito; o rollback recusa rodar
 * com ocorrência concluída pelo encaixe (sem a coluna ela seria lida como canhoto aprovado).
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_canhoto_pickup_resolution_cause'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) {
    throw new Error('canhoto_pickup_resolution_cause migration is required')
  }
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('a causa da conclusão pela coleta de canhoto (spec 321 T8)', () => {
  test('coluna anulável e CHECK novo, sem UPDATE nem DROP', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      'ALTER TABLE "trip_occurrence_resolution_events" ADD COLUMN "canhoto_pickup_cause" varchar(16);',
    )
    expect(text).toContain(
      `CHECK ("canhoto_pickup_cause" is null or ("canhoto_pickup_cause" in ('collected', 'scheduled') and "canhoto_pickup_id" is not null and "kind" = 'resolved'))`,
    )
    expect(text).not.toMatch(/\bUPDATE\b/u)
    expect(text).not.toMatch(/\bDROP\b/u)
  })

  test('o rollback recusa ocorrência concluída pelo encaixe e tira só a coluna e o CHECK', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain(`WHERE "canhoto_pickup_cause" = 'scheduled'`)
    expect(text).toContain('RAISE EXCEPTION')
    expect(text).toContain(
      'DROP CONSTRAINT "trip_occurrence_resolution_events_canhoto_pickup_cause_check";',
    )
    expect(text).toContain('DROP COLUMN "canhoto_pickup_cause";')
    expect(text).toContain("'20261119161731_canhoto_pickup_resolution_cause'")
  })
})
