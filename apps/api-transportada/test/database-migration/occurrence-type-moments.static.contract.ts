/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1b.1: a tabela de momentos nasce no padrão de tenant, com a CHECK gerada de
 * `OCCURRENCE_MOMENTS`, e o backfill é fiel a todo leitor de hoje — quatro regras, tipos inativos
 * entram, `ON CONFLICT DO NOTHING`. `separation + stop` vira `separation` **e** `stop` (D-c). O
 * rollback derruba só a tabela e o registro do journal: `stage` e `flow` do tipo ficam.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { inList } from '../../src/database/schema-check.constant.js'
import { OCCURRENCE_MOMENTS } from '../../src/shared/trip-occurrence.constant.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_moments'
const MOMENTS = '"company_occurrence_type_moments"'
const ON_CONFLICT = 'ON CONFLICT ON CONSTRAINT "company_occurrence_type_moments_unique" DO NOTHING;'

/** As quatro regras da tabela do plan, uma instrução cada: arrancar uma é visível. */
const BACKFILL_RULES = [
  `'separation' FROM "company_occurrence_types" WHERE "stage" = 'separation'`,
  `'document' FROM "company_occurrence_types" WHERE "stage" = 'delivery' AND "flow" = 'document'`,
  `'stop' FROM "company_occurrence_types" WHERE "stage" = 'delivery' AND "flow" = 'stop'`,
  `'stop' FROM "company_occurrence_types" WHERE "stage" = 'separation' AND "flow" = 'stop'`,
  `'office' FROM "company_occurrence_types" WHERE "stage" = 'delivery'`,
] as const

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('occurrence_type_moments is required')
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

describe('o momento vira conjunto (spec 246 T1b.1)', () => {
  test('tabela de tenant → FKs → backfill nas quatro regras, sem filtrar tipo inativo', async () => {
    const { text } = await readMigration('migration.sql')
    const order = [
      `CREATE TABLE ${MOMENTS}`,
      `CHECK ("moment" in (${inList(OCCURRENCE_MOMENTS)}))`,
      '"company_occurrence_type_moments_company_id_companies_id_fk"',
      '"company_occurrence_type_moments_type_fk"',
      ...BACKFILL_RULES,
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    const statements = withoutComments(text)
    expect(statements.match(/INSERT INTO "company_occurrence_type_moments"/gu)).toHaveLength(
      BACKFILL_RULES.length,
    )
    expect(statements.split(ON_CONFLICT)).toHaveLength(BACKFILL_RULES.length + 1)
    expect(statements).not.toMatch(/"active"|\bDROP\b|\bUPDATE "/u)
  })

  test('o rollback derruba só a tabela e o journal, e não toca stage nem flow', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      `DROP TABLE IF EXISTS ${MOMENTS}`,
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(withoutComments(text)).not.toMatch(/"company_occurrence_types"|"stage"|"flow"/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
