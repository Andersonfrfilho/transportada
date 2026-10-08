/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.2: a migration do calendário útil é aditiva. Três tabelas novas e, na tabela JÁ
 * PUBLICADA `municipal_holidays` (que o roteirizador lê), exatamente seis comandos — a lista abaixo é
 * a que o usuário confere antes de levar a migration a produção.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_business_calendar'
const PREVIOUS_MIGRATION = '20261007133324_cargo_preview_retention'
const POSTGRES_IDENTIFIER_MAX_BYTES = 63
const NEW_TABLES = [
  'municipal_holiday_rules',
  'state_holidays',
  'company_business_calendar_settings',
] as const

const STATEMENTS_ON_MUNICIPAL_HOLIDAYS = [
  `ALTER TABLE "municipal_holidays" ADD COLUMN "kind" text DEFAULT 'holiday' NOT NULL`,
  `ALTER TABLE "municipal_holidays" ADD COLUMN "source_rule_id" uuid`,
  `ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_kind_check" CHECK ("kind" in ('holiday', 'city_anniversary')) NOT VALID`,
  `ALTER TABLE "municipal_holidays" VALIDATE CONSTRAINT "municipal_holidays_kind_check"`,
  `ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_company_source_rule_fk" FOREIGN KEY ("company_id","source_rule_id") REFERENCES "municipal_holiday_rules"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `CREATE INDEX "municipal_holidays_company_source_rule_idx" ON "municipal_holidays" ("company_id","source_rule_id") WHERE "source_rule_id" is not null`,
]

async function findDirectory(): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('business_calendar migration is required')
  return directory
}

async function readFileText(file: string): Promise<string> {
  const path = join(migrationsDirectory.pathname, await findDirectory(), file)
  return Bun.file(path).text()
}

const stripComments = (text: string): string => text.replaceAll(/--.*$/gmu, '')

const splitStatements = (text: string): readonly string[] =>
  stripComments(text)
    .split(';')
    .map((statement) => statement.replaceAll(/\s+/gu, ' ').trim())
    .filter((statement) => statement !== '')

describe('a migration do calendário útil entra aditiva (spec 238 T1.2)', () => {
  test('é posterior à última migration publicada e traz migration, rollback e snapshot', async () => {
    const directory = await findDirectory()

    expect(directory > PREVIOUS_MIGRATION).toBeTrue()
    for (const file of ['migration.sql', 'rollback.sql', 'snapshot.json']) {
      expect(
        await Bun.file(join(migrationsDirectory.pathname, directory, file)).exists(),
      ).toBeTrue()
    }
  })

  test('em `municipal_holidays` toca exatamente os seis comandos aprovados, nessa ordem', async () => {
    const statements = splitStatements(await readFileText('migration.sql')).filter((statement) =>
      statement.includes('"municipal_holidays"'),
    )

    expect(statements).toEqual(STATEMENTS_ON_MUNICIPAL_HOLIDAYS)
  })

  test('os seis comandos são os ÚLTIMOS: o lock da tabela publicada é retido o menor tempo possível', async () => {
    const statements = splitStatements(await readFileText('migration.sql')).filter(
      (statement) => !statement.startsWith('SET LOCAL'),
    )
    const lastSix = statements.slice(-STATEMENTS_ON_MUNICIPAL_HOLIDAYS.length)

    expect(lastSix).toEqual(STATEMENTS_ON_MUNICIPAL_HOLIDAYS)
    expect(
      statements
        .slice(0, -STATEMENTS_ON_MUNICIPAL_HOLIDAYS.length)
        .some((statement) => statement.includes('"municipal_holidays"')),
    ).toBeFalse()
  })

  test('o cabeçalho não promete o que o migrador não cumpre: o lock vai até o COMMIT do lote', async () => {
    const raw = await readFileText('migration.sql')

    expect(raw).toContain('ACCESS EXCLUSIVE')
    expect(raw).toContain('até o COMMIT do lote inteiro')
    expect(raw).toContain('deploy sem migration longa')
    expect(raw).not.toMatch(/NOT VALID[^\n]*alivia/iu)
    expect(raw).not.toContain('(SHARE UPDATE EXCLUSIVE: leitura e escrita seguem)')
  })

  test('o ano até onde a regra foi gerada é limitado ao intervalo do domínio (1583 a 9999)', async () => {
    const sqlText = stripComments(await readFileText('migration.sql'))

    expect(sqlText).toContain(
      'CONSTRAINT "municipal_holiday_rules_materialized_through_year_check" CHECK ("materialized_through_year" between 1583 and 9999)',
    )
  })

  test('nenhum dado é escrito e nada existente é apagado, renomeado ou alterado', async () => {
    const sqlText = stripComments(await readFileText('migration.sql'))

    expect(sqlText).not.toMatch(/(^|;)\s*(insert|update|delete|truncate)\b/imu)
    expect(sqlText).not.toMatch(/\b(drop|rename)\b/iu)
    expect(sqlText).not.toMatch(/alter\s+column/iu)
    expect(sqlText).not.toMatch(/create\s+type/iu)
  })

  test('as três tabelas nascem antes do ALTER que referencia a das regras', async () => {
    const sqlText = stripComments(await readFileText('migration.sql'))
    const foreignKey = sqlText.indexOf('"municipal_holidays_company_source_rule_fk"')

    for (const table of NEW_TABLES) {
      const created = sqlText.indexOf(`CREATE TABLE "${table}"`)
      expect(created).toBeGreaterThan(-1)
    }
    expect(sqlText.indexOf('CREATE TABLE "municipal_holiday_rules"')).toBeLessThan(foreignKey)
  })

  test('espera de lock limitada, devolvida ao padrão, e o custo de lock descrito no cabeçalho', async () => {
    const raw = await readFileText('migration.sql')
    const sqlText = stripComments(raw)
    const timeout = sqlText.indexOf("SET LOCAL lock_timeout = '3s'")

    expect(raw).toContain('Custo de lock')
    expect(timeout).toBeGreaterThan(-1)
    expect(timeout).toBeLessThan(sqlText.indexOf('CREATE TABLE'))
    expect(sqlText.trimEnd()).toEndWith('SET LOCAL lock_timeout = DEFAULT;')
  })

  test('todo identificador novo cabe em 63 bytes', async () => {
    const sqlText = stripComments(await readFileText('migration.sql'))
    const identifiers = [...sqlText.matchAll(/"([^"]+)"/gu)].map((match) => match[1] ?? '')

    expect(identifiers.length).toBeGreaterThan(40)
    for (const identifier of identifiers) {
      expect(Buffer.byteLength(identifier)).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_BYTES)
    }
  })

  test('o rollback desfaz na ordem inversa e deixa as datas materializadas como datas fixas', async () => {
    const raw = await readFileText('rollback.sql')
    const sqlText = stripComments(raw)
    const positions = [
      'DROP CONSTRAINT "municipal_holidays_company_source_rule_fk"',
      'DROP INDEX "municipal_holidays_company_source_rule_idx"',
      'DROP COLUMN "source_rule_id"',
      'DROP COLUMN "kind"',
      'DROP CONSTRAINT "municipal_holidays_kind_check"',
      ...NEW_TABLES.map((table) => `DROP TABLE "${table}"`),
    ].map((fragment) => sqlText.indexOf(fragment))

    expect(positions.every((position) => position > -1)).toBeTrue()
    expect(positions.slice(0, 3)).toEqual(positions.slice(0, 3).toSorted((a, b) => a - b))
    expect(positions[0]).toBeLessThan(positions[5] ?? -1)
    expect(sqlText.indexOf('DROP TABLE "municipal_holiday_rules"')).toBeGreaterThan(
      sqlText.indexOf('DROP COLUMN "source_rule_id"'),
    )
    expect(sqlText).not.toMatch(/delete\s+from\s+"municipal_holidays"/iu)
    expect(sqlText).not.toContain('CASCADE')
    expect(raw).toContain('datas fixas')
    expect(sqlText).toContain('deleted_migrations <> 1')
    expect(raw).toMatch(/^--[\s\S]*\bBEGIN;/u)
    expect(sqlText.trimEnd()).toEndWith('COMMIT;')
  })
})
