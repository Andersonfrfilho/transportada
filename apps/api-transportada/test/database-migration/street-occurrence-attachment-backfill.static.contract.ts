/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1d.2 (RF1d): o backfill da foto da ocorrência de rua é um `INSERT ... SELECT` só, que
 * copia a coluna antiga para a tabela da 161 sem tocar mais nada. O rollback **não apaga linha** —
 * não há como separar o que o backfill criou do que a escrita dupla criou depois —, só o registro do
 * journal.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_street_occurrence_attachment_backfill'
const ATTACHMENTS = '"trip_document_occurrence_attachments"'

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('street_occurrence_attachment_backfill is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

/** Os comentários explicam o que não se faz; só as instruções contam. Espaços viram um. */
function instructionsOf(sqlText: string): string {
  return sqlText
    .replaceAll(/^--.*$/gmu, '')
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

describe('a foto da ocorrência de rua ganha a linha da 161 (spec 246 T1d.2)', () => {
  test('um INSERT ... SELECT só, com a hora da ocorrência, sem duplicar e sem tocar a coluna', async () => {
    const instructions = instructionsOf((await readMigration('migration.sql')).text)

    expect(instructions).toContain(
      `INSERT INTO ${ATTACHMENTS} ("company_id", "occurrence_id", "stored_object_id", "thumbnail_object_id", "position", "created_at") SELECT o."company_id", o."id", o."attachment_object_id", NULL, 1, o."created_at" FROM "trip_document_occurrences" o WHERE o."attachment_object_id" IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM ${ATTACHMENTS} a WHERE a."company_id" = o."company_id" AND a."occurrence_id" = o."id" ) ON CONFLICT ON CONSTRAINT "trip_document_occurrence_attachments_unique_position" DO NOTHING;`,
    )
    expect(instructions.match(/\bINSERT\b/gu)).toHaveLength(1)
    // `attachment_object_id` permanece gravada; nada de schema muda nesta migration.
    expect(instructions).not.toMatch(/\b(UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/u)
    // A retenção mora em `stored_objects`, e o objeto é o mesmo: nada a copiar.
    expect(instructions).not.toContain('retention_until')
  })

  test('o rollback só tira o registro do journal, conferindo que tirou um', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const instructions = instructionsOf(text)

    expect(text).toMatch(/^--[\s\S]*\bBEGIN;/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
    expect(instructions).toContain(
      `DELETE FROM "drizzle"."__drizzle_migrations" WHERE "name" = '${directory}';`,
    )
    expect(instructions).toContain('ROW_COUNT')
    expect(instructions.match(/\bDELETE\b/gu)).toHaveLength(1)
    expect(instructions).not.toContain(ATTACHMENTS)
    expect(instructions).not.toMatch(/\b(DROP|TRUNCATE|CASCADE)\b/u)
  })
})
