/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.1 (ADR-0100 §3): a migration da importação de feriados é aditiva. Seis tabelas novas e, nas
 * duas tabelas JÁ PUBLICADAS do calendário (`municipal_holidays` é lida pelo roteirizador), exatamente
 * os comandos abaixo, no fim do arquivo — a lista que o usuário confere antes de levar a produção.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  ALL_NEW_CONSTRAINT_NAMES,
  ALL_NEW_INDEX_NAMES,
  JOB,
  MIGRATION_SUFFIX,
  NEW_TABLES,
  POSTGRES_IDENTIFIER_MAX_BYTES,
  PREVIOUS_MIGRATION,
} from './holiday-provider-import.constant.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const RETENTION_SUFFIX = '_cargo_preview_retention'

const PUBLISHED_TABLE_STATEMENTS = [
  `ALTER TABLE "state_holidays" ADD COLUMN "provider_entry_id" uuid`,
  `ALTER TABLE "state_holidays" ADD CONSTRAINT "state_holidays_provider_entry_fk" FOREIGN KEY ("provider_entry_id") REFERENCES "holiday_provider_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "state_holidays" ADD CONSTRAINT "state_holidays_provider_once_check" CHECK ("provider_entry_id" is null or "recurrence" = 'once') NOT VALID`,
  `ALTER TABLE "state_holidays" VALIDATE CONSTRAINT "state_holidays_provider_once_check"`,
  `CREATE INDEX "state_holidays_provider_entry_idx" ON "state_holidays" ("company_id","provider_entry_id") WHERE "provider_entry_id" is not null`,
  `ALTER TABLE "municipal_holidays" ADD COLUMN "provider_entry_id" uuid`,
  `ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_provider_entry_fk" FOREIGN KEY ("provider_entry_id") REFERENCES "holiday_provider_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
  `ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_rule_or_provider_check" CHECK (not ("source_rule_id" is not null and "provider_entry_id" is not null)) NOT VALID`,
  `ALTER TABLE "municipal_holidays" VALIDATE CONSTRAINT "municipal_holidays_rule_or_provider_check"`,
  `CREATE INDEX "municipal_holidays_provider_entry_idx" ON "municipal_holidays" ("company_id","provider_entry_id") WHERE "provider_entry_id" is not null`,
]

async function findDirectory(suffix: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) => name.endsWith(suffix))
  if (directory === undefined) throw new Error(`${suffix} migration is required`)
  return directory
}

async function readFileText(suffix: string, file: string): Promise<string> {
  const path = join(migrationsDirectory.pathname, await findDirectory(suffix), file)
  return Bun.file(path).text()
}

const stripComments = (text: string): string => text.replaceAll(/--.*$/gmu, '')

const splitStatements = (text: string): readonly string[] =>
  stripComments(text)
    .split(';')
    .map((statement) => statement.replaceAll(/\s+/gu, ' ').trim())
    .filter((statement) => statement !== '' && !statement.startsWith('SET LOCAL'))

async function readPreviousJobs(): Promise<readonly string[]> {
  const retention = stripComments(await readFileText(RETENTION_SUFFIX, 'migration.sql'))
  const match = /ADD CONSTRAINT "job_schedules_job_check" CHECK \("job" in \(([^)]*)\)\)/u.exec(
    retention,
  )
  return [...(match?.[1] ?? '').matchAll(/'([^']+)'/gu)].map((item) => item[1] ?? '')
}

describe('a migration da importação de feriados entra aditiva (spec 252 T2.1)', () => {
  test('é posterior à última migration publicada e traz migration, rollback e snapshot', async () => {
    const directory = await findDirectory(MIGRATION_SUFFIX)

    expect(directory > PREVIOUS_MIGRATION).toBeTrue()
    for (const file of ['migration.sql', 'rollback.sql', 'snapshot.json']) {
      expect(
        await Bun.file(join(migrationsDirectory.pathname, directory, file)).exists(),
      ).toBeTrue()
    }
  })

  test('cria as seis tabelas e nenhuma outra', async () => {
    const sqlText = stripComments(await readFileText(MIGRATION_SUFFIX, 'migration.sql'))

    const created = [...sqlText.matchAll(/CREATE TABLE "([^"]+)"/gu)].map((match) => match[1])
    expect(created.toSorted()).toEqual([...NEW_TABLES].toSorted())
  })

  test('todo nome do ADR-0100 §3 está explícito no SQL e todo identificador cabe em 63 bytes', async () => {
    const migrationText = stripComments(await readFileText(MIGRATION_SUFFIX, 'migration.sql'))
    const rollbackText = stripComments(await readFileText(MIGRATION_SUFFIX, 'rollback.sql'))

    // A PK inline leva o nome do Postgres (`<tabela>_pkey`); o integration o confere contra `pg_constraint`.
    const explicitNames = [...ALL_NEW_CONSTRAINT_NAMES, ...ALL_NEW_INDEX_NAMES].filter(
      (name) => !name.endsWith('_pkey') || migrationText.includes(`CONSTRAINT "${name}"`),
    )
    expect(explicitNames.length).toBeGreaterThanOrEqual(35)
    for (const name of explicitNames) expect(migrationText).toContain(`"${name}"`)
    for (const text of [migrationText, rollbackText]) {
      const identifiers = [...text.matchAll(/"([^"]+)"/gu)].map((match) => match[1] ?? '')
      expect(identifiers.length).toBeGreaterThan(40)
      for (const identifier of identifiers) {
        expect(Buffer.byteLength(identifier)).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_BYTES)
      }
    }
  })

  test('nas tabelas publicadas toca exatamente os dez comandos aprovados, e eles são os ÚLTIMOS', async () => {
    const statements = splitStatements(await readFileText(MIGRATION_SUFFIX, 'migration.sql'))

    expect(statements.slice(-PUBLISHED_TABLE_STATEMENTS.length)).toEqual(PUBLISHED_TABLE_STATEMENTS)
    expect(
      statements
        .slice(0, -PUBLISHED_TABLE_STATEMENTS.length)
        .filter(
          (statement) =>
            statement.includes('"state_holidays"') || statement.includes('"municipal_holidays"'),
        ),
    ).toEqual([])
  })

  test('a tabela que o roteirizador lê é a última a ser trancada', async () => {
    const statements = splitStatements(await readFileText(MIGRATION_SUFFIX, 'migration.sql'))
    const firstMunicipal = statements.findIndex((statement) =>
      statement.includes('"municipal_holidays"'),
    )
    const lastState = statements.findLastIndex((statement) =>
      statement.includes('"state_holidays"'),
    )

    expect(lastState).toBeLessThan(firstMunicipal)
  })

  test('as duas CHECK de `job` aceitam o nome novo, mantêm os de antes e entram NOT VALID', async () => {
    const sqlText = stripComments(await readFileText(MIGRATION_SUFFIX, 'migration.sql'))
    const previousJobs = await readPreviousJobs()
    const expectedList = [...previousJobs, JOB].map((job) => `'${job}'`).join(', ')

    expect(previousJobs.length).toBeGreaterThan(15)
    for (const [table, constraint] of [
      ['job_executions', 'job_executions_job_check'],
      ['job_schedules', 'job_schedules_job_check'],
    ] as const) {
      expect(sqlText).toContain(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`)
      expect(sqlText).toContain(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK ("job" in (${expectedList})) NOT VALID;`,
      )
      expect(sqlText).toContain(`ALTER TABLE "${table}" VALIDATE CONSTRAINT "${constraint}"`)
    }
    expect(sqlText.match(new RegExp(`'${JOB}'`, 'gu'))).toHaveLength(3)
  })

  test('a rotina nasce PAUSADA DE FÁBRICA (D13): desligada, origem `system`, diária', async () => {
    const sqlText = stripComments(await readFileText(MIGRATION_SUFFIX, 'migration.sql'))

    expect(sqlText).toContain(
      `INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at", "enabled", "paused_at", "paused_origin") VALUES\n\t('${JOB}', 86400, now(), false, now(), 'system');`,
    )
    expect(sqlText.indexOf('INSERT INTO "job_schedules"')).toBeGreaterThan(
      sqlText.indexOf('VALIDATE CONSTRAINT "job_schedules_job_check"'),
    )
  })

  test('a única linha escrita é a do relógio e nada existente é apagado ou renomeado', async () => {
    const sqlText = stripComments(await readFileText(MIGRATION_SUFFIX, 'migration.sql'))

    expect(sqlText.match(/(^|;)\s*insert\b/gimu)).toHaveLength(1)
    expect(sqlText).not.toMatch(/(^|;)\s*(update|delete|truncate)\b/imu)
    expect(sqlText).not.toMatch(/\b(rename|drop\s+(table|column|index))\b/iu)
    expect(sqlText).not.toMatch(/alter\s+column|create\s+type/iu)
    expect(sqlText.match(/\bdrop\s+constraint\b/giu)).toHaveLength(2)
  })

  test('espera de lock limitada, devolvida ao padrão, e o custo de lock descrito no cabeçalho', async () => {
    const raw = await readFileText(MIGRATION_SUFFIX, 'migration.sql')
    const sqlText = stripComments(raw)
    const timeout = sqlText.indexOf("SET LOCAL lock_timeout = '3s'")

    expect(raw).toContain('Custo de lock')
    expect(raw).toContain('ACCESS EXCLUSIVE')
    expect(raw).toContain('até o COMMIT do lote inteiro')
    expect(timeout).toBeGreaterThan(-1)
    expect(timeout).toBeLessThan(sqlText.indexOf('CREATE TABLE'))
    expect(sqlText.trimEnd()).toEndWith('SET LOCAL lock_timeout = DEFAULT;')
  })

  test('o rollback recusa antes de tocar em qualquer coisa e fecha o journal', async () => {
    const raw = await readFileText(MIGRATION_SUFFIX, 'rollback.sql')
    const sqlText = stripComments(raw)
    const refusal = sqlText.indexOf('Rollback recusado')

    expect(raw).toMatch(/^--[\s\S]*\bBEGIN;/u)
    expect(sqlText.trimEnd()).toEndWith('COMMIT;')
    expect(refusal).toBeGreaterThan(-1)
    expect(refusal).toBeLessThan(sqlText.indexOf('DELETE FROM'))
    expect(refusal).toBeLessThan(sqlText.indexOf('DROP'))
    for (const guarded of [
      '"provider_entry_id" IS NOT NULL',
      '"holiday_import_suppressions"',
      '"finished_at" IS NULL',
    ]) {
      expect(sqlText.slice(0, sqlText.indexOf('DELETE FROM'))).toContain(guarded)
    }
    expect(sqlText).toContain('deleted_migrations <> 1')
    expect(sqlText).not.toContain('CASCADE')
  })

  test('o rollback devolve as listas de `job` de antes e apaga só a rotina', async () => {
    const sqlText = stripComments(await readFileText(MIGRATION_SUFFIX, 'rollback.sql'))
    const previousList = (await readPreviousJobs()).map((job) => `'${job}'`).join(', ')

    expect(sqlText).toContain(`DELETE FROM "job_executions" WHERE "job" = '${JOB}'`)
    expect(sqlText).toContain(`DELETE FROM "job_schedules" WHERE "job" = '${JOB}'`)
    // Os dois DELETE e a contagem de execução aberta da recusa.
    expect(sqlText.match(new RegExp(`'${JOB}'`, 'gu'))).toHaveLength(3)
    for (const constraint of ['job_executions_job_check', 'job_schedules_job_check']) {
      expect(sqlText).toContain(`ADD CONSTRAINT "${constraint}" CHECK ("job" in (${previousList}))`)
    }
    expect(sqlText).not.toMatch(/delete\s+from\s+"(municipal_holidays|state_holidays)"/iu)
  })

  test('o rollback desfaz a coluna antes de derrubar a tabela que a FK referencia', async () => {
    const sqlText = stripComments(await readFileText(MIGRATION_SUFFIX, 'rollback.sql'))
    const dropEntries = sqlText.indexOf('DROP TABLE "holiday_provider_entries"')

    expect(dropEntries).toBeGreaterThan(-1)
    for (const table of ['municipal_holidays', 'state_holidays']) {
      for (const fragment of [
        `ALTER TABLE "${table}" DROP CONSTRAINT "${table}_provider_entry_fk"`,
        `DROP INDEX "${table}_provider_entry_idx"`,
        `ALTER TABLE "${table}" DROP COLUMN "provider_entry_id"`,
      ]) {
        const position = sqlText.indexOf(fragment)
        expect(position).toBeGreaterThan(-1)
        expect(position).toBeLessThan(dropEntries)
      }
    }
    for (const table of NEW_TABLES) expect(sqlText).toContain(`DROP TABLE "${table}"`)
  })
})
