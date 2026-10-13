/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.4b: a varredura do aviso automático entra no relógio já pausada pelo sistema — só liga
 * com autorização do usuário em produção.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_automatic_mail_sweep_job'
const JOB = 'occurrence.automatic-mail.sweep'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('occurrence_automatic_mail_sweep_job is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return text.replaceAll(/^--.*$/gmu, '')
}

describe('a varredura do aviso automático nasce pausada (spec 248 T4.4b)', () => {
  test('semeia a linha do relógio desligada, pausada pelo sistema, de cinco em cinco minutos', async () => {
    const sqlText = await readMigration('migration.sql')

    expect(sqlText).toMatch(
      new RegExp(
        `\\('${JOB.replaceAll('.', '\\.')}',\\s*300,\\s*now\\(\\),\\s*false,\\s*now\\(\\),\\s*'system'\\)`,
        'u',
      ),
    )
  })

  test('o nome entra nas duas CHECK de job e não toca coluna, índice nem tabela', async () => {
    const sqlText = await readMigration('migration.sql')

    expect(sqlText.match(new RegExp(`'${JOB}'`, 'gu'))).toHaveLength(3)
    expect(sqlText).not.toMatch(
      /add\s+column|drop\s+column|create\s+(unique\s+)?index|create\s+table/iu,
    )
  })

  test('o rollback apaga só o que a rotina criou e devolve as CHECK de antes', async () => {
    const sqlText = await readMigration('rollback.sql')

    expect(sqlText).toContain(`DELETE FROM "job_schedules" WHERE "job" = '${JOB}'`)
    expect(sqlText).toContain(`DELETE FROM "job_executions" WHERE "job" = '${JOB}'`)
    expect(sqlText.match(new RegExp(`'${JOB}'`, 'gu'))).toHaveLength(2)
  })
})
