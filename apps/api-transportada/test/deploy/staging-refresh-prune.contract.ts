/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const REFRESH_DIRECTORY = new URL('deploy/staging-refresh/', REPOSITORY_ROOT)
const SCRIPT_PATH = new URL('staging-refresh.sh', REFRESH_DIRECTORY)
const PRUNE_SQL_PATH = new URL('prune-source.sql', REFRESH_DIRECTORY)
const DOCKERFILE_PATH = new URL('Dockerfile', REFRESH_DIRECTORY)
const SCHEMA_DIRECTORY = new URL('apps/api-transportada/src/', REPOSITORY_ROOT)

/** Toda tabela do Drizzle desta app, descoberta nos schemas — não numa lista escrita à mão. */
async function drizzleTableNames(): Promise<string[]> {
  const names = new Set<string>()
  const root = Bun.fileURLToPath(SCHEMA_DIRECTORY)
  for await (const file of new Glob('**/*.ts').scan({ cwd: root, absolute: true })) {
    const content = await Bun.file(file).text()
    for (const match of content.matchAll(/pgTable\(\s*'([a-z_]+)'/g)) {
      names.add(match[1] as string)
    }
  }
  return [...names].sort()
}

interface PolicyRow {
  table: string
  mode: string
  dateColumn: string | null
}

async function readPolicy(): Promise<PolicyRow[]> {
  const sql = await Bun.file(PRUNE_SQL_PATH).text()
  const block = sql.slice(
    sql.indexOf('insert into refresh_work.policy'),
    sql.indexOf('-- (tabela, coluna) cuja linha'),
  )
  return [...block.matchAll(/\(\s*'([^']+)',\s*'([a-z]+)',\s*(null|'[a-z_]+')\s*\)/g)].map(
    (match) => ({
      table: match[1] as string,
      mode: match[2] as string,
      dateColumn: match[3] === 'null' ? null : (match[3] as string).slice(1, -1),
    }),
  )
}

/**
 * Spec 291. O recorte é "tudo o que não está na lista não vai": tabela nova sem política seria
 * esvaziada em silêncio no refresh de domingo. Aqui ela quebra o CI no dia em que nasce.
 */
describe('contrato do recorte do staging-refresh (spec 291)', () => {
  test('toda tabela do Drizzle tem exatamente uma política', async () => {
    const tables = await drizzleTableNames()
    const policy = await readPolicy()
    const covered = policy.map((row) => row.table)

    expect(tables.length).toBeGreaterThan(200)
    expect(tables.filter((table) => !covered.includes(table))).toEqual([])
    expect(covered.filter((table, index) => covered.indexOf(table) !== index)).toEqual([])
  })

  test('a política não cita tabela que não existe mais', async () => {
    const tables = await drizzleTableNames()
    const policy = await readPolicy()

    expect(
      policy
        .map((row) => row.table)
        .filter((table) => !table.includes('.') && !tables.includes(table)),
    ).toEqual([])
  })

  test('janela só com coluna de data, e as demais políticas sem ela', async () => {
    for (const row of await readPolicy()) {
      expect(['keep', 'empty', 'window', 'referenced']).toContain(row.mode)
      expect(row.mode === 'window').toBe(row.dateColumn !== null)
    }
  })

  test('conversas, anexos, filas e emissão ficam de fora; cadastros e modelos vão inteiros', async () => {
    const policy = new Map((await readPolicy()).map((row) => [row.table, row.mode]))

    for (const table of [
      'occurrence_conversation_messages',
      'occurrence_conversation_attachments',
      'contractor_mail_messages',
      'trip_document_occurrence_attachments',
      'cte_batches',
      'mdfe_manifests',
      'nfse_service_invoices',
      'billing_invoices',
      'whatsapp_channels',
      'nfse_provider_credentials',
      'audit_logs',
      'notification.devices',
      'meta_whatsapp.messages',
    ]) {
      expect(policy.get(table)).toBe('empty')
    }
    for (const table of [
      'companies',
      'company_fiscal_profiles',
      'fleet_vehicles',
      'fleet_drivers',
      'contractors',
      'delivery_clients',
      'company_occurrence_types',
      'contractor_mail_templates',
      'notification.templates',
    ]) {
      expect(policy.get(table)).toBe('keep')
    }
    for (const table of [
      'nfe_documents',
      'trips',
      'trip_document_occurrences',
      'delivery_charges',
    ]) {
      expect(policy.get(table)).toBe('window')
    }
    expect(policy.get('stored_objects')).toBe('referenced')
  })

  test('as FKs voltam validando, e contato real vira example.com', async () => {
    const sql = await Bun.file(PRUNE_SQL_PATH).text()

    expect(sql).toContain('alter table %s add constraint %I %s')
    expect(sql).not.toMatch(/not valid/i)
    expect(sql).toContain('@example.com')
    expect(sql).toContain('staging_refresh_scrub_table_missing')
    expect(sql).toContain('staging_refresh_scrub_column_missing')
  })

  test('o recorte roda antes de qualquer schema de staging cair', async () => {
    const script = await Bun.file(SCRIPT_PATH).text()
    const restore = script.slice(script.indexOf('restore_over_staging() {'))

    expect(restore.indexOf('build_pruned_dump')).toBeGreaterThan(-1)
    expect(restore.indexOf('build_pruned_dump')).toBeLessThan(restore.indexOf('drop schema'))
    expect(restore.indexOf('PRUNED_DUMP_PATH')).toBeLessThan(restore.indexOf('drop schema'))
  })

  test('o banco temporário tem nome fixo e é derrubado no cleanup', async () => {
    const script = await Bun.file(SCRIPT_PATH).text()
    const cleanup = script.slice(
      script.indexOf('cleanup() {'),
      script.indexOf('require_variables() {'),
    )

    expect(script).toContain('readonly SOURCE_DATABASE_NAME=staging_refresh_source')
    expect(cleanup).toContain('drop_source_database')
    expect(script).toContain('STAGING_REFRESH_WINDOW_DAYS:-60')
  })

  test('a imagem traz o SQL do recorte', async () => {
    const dockerfile = await Bun.file(DOCKERFILE_PATH).text()

    expect(dockerfile).toContain('deploy/staging-refresh/prune-source.sql')
  })
})
