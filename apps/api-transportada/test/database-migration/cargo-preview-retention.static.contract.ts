/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.8: a migration da retenção só mexe em vocabulário de CHECK e na linha do relógio —
 * nenhuma coluna, índice ou tabela nova, nenhum dado reescrito. As CHECK entram `NOT VALID` e são
 * validadas à parte; o rollback devolve as listas de antes e apaga só o que a rotina criou.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_cargo_preview_retention'
const JOB = 'cargo-preview.retention.apply'
const KIND = 'retention_applied'
const POSTGRES_IDENTIFIER_MAX_LENGTH = 63
const CONSTRAINTS = [
  ['job_executions', 'job_executions_job_check'],
  ['job_schedules', 'job_schedules_job_check'],
  ['cargo_preview_events', 'cargo_preview_events_kind_check'],
  ['cargo_preview_events', 'cargo_preview_events_item_scope_check'],
] as const

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('cargo_preview_retention is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return text.replaceAll(/^--.*$/gmu, '')
}

describe('a retenção dos dados da planilha entra aditiva (spec 237 T4.8)', () => {
  test('não cria nem apaga coluna, índice ou tabela e não reescreve dado', async () => {
    const sqlText = await readMigration('migration.sql')

    expect(sqlText).not.toMatch(
      /add\s+column|drop\s+column|create\s+(unique\s+)?index|create\s+table/iu,
    )
    expect(sqlText).not.toMatch(/^\s*(update|delete|truncate)\b/imu)
  })

  test('as quatro CHECK aceitam o nome novo e entram NOT VALID, validadas à parte', async () => {
    const sqlText = await readMigration('migration.sql')

    for (const [table, constraint] of CONSTRAINTS) {
      expect(constraint.length).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_LENGTH)
      expect(sqlText).toContain(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`)
      expect(sqlText).toMatch(
        new RegExp(`ADD CONSTRAINT "${constraint}" CHECK [^;]+ NOT VALID;`, 'u'),
      )
      expect(sqlText).toContain(`ALTER TABLE "${table}" VALIDATE CONSTRAINT "${constraint}"`)
    }
    expect(sqlText.match(new RegExp(`'${JOB}'`, 'gu'))).toHaveLength(3)
    expect(sqlText.match(new RegExp(`'${KIND}'`, 'gu'))).toHaveLength(2)
  })

  test('o evento de retenção é da prévia inteira: entra entre os que exigem item nulo', async () => {
    const sqlText = await readMigration('migration.sql')

    expect(sqlText).toContain(
      `("kind" in ('uploaded', 'parsed', 'failed', 'arrival_proposed', '${KIND}')) = ("item_id" is null)`,
    )
  })

  test('a rotina nasce com a linha do relógio: diária, a primeira batida na migration', async () => {
    const sqlText = await readMigration('migration.sql')

    expect(sqlText).toContain(
      `INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at") VALUES\n\t('${JOB}', 86400, now());`,
    )
  })

  test('o rollback devolve as listas de antes e apaga só a rotina, deixando o evento gravado', async () => {
    const sqlText = await readMigration('rollback.sql')

    expect(sqlText).toContain(`DELETE FROM "job_executions" WHERE "job" = '${JOB}'`)
    expect(sqlText).toContain(`DELETE FROM "job_schedules" WHERE "job" = '${JOB}'`)
    expect(sqlText).not.toContain(`'${JOB}',`)
    expect(sqlText).not.toMatch(/delete\s+from\s+"cargo_preview_events"/iu)
    expect(sqlText).toContain('"__drizzle_migrations"')
  })
})
