/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T2.3: a rotina de backfill do e-mail do destinatário entra no relógio já pausada pelo
 * sistema — em produção só roda por disparo manual, com autorização do usuário.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_nfe_recipient_email_backfill_job'
const JOB = 'nfe.recipient-email.backfill'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('nfe_recipient_email_backfill_job is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return text.replaceAll(/^--.*$/gmu, '')
}

describe('o backfill do e-mail do destinatário nasce pausado (spec 248 T2.3)', () => {
  test('semeia a linha do relógio desligada, pausada pelo sistema', async () => {
    const sqlText = await readMigration('migration.sql')

    expect(sqlText).toMatch(
      new RegExp(
        `\\('${JOB.replaceAll('.', '\\.')}',\\s*86400,\\s*now\\(\\),\\s*false,\\s*now\\(\\),\\s*'system'\\)`,
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
