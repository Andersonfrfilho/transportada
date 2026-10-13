/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: what the seeder checks before touching the database (local only), who it seeds for, and the
 * per-table row counts it prints (counts only, never a row).
 */
import type { SQL } from 'bun'

import { LOCAL_IDENTITY_USER_ID } from '../../src/database/local-identity-seed.constant.js'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export type ScenarioArguments = {
  readonly companyId?: string
  readonly isReset: boolean
  readonly shouldSeed: boolean
}

export type SeedTarget = { readonly actorUserId: string; readonly companyId: string }

export function parseScenarioArguments(argv: readonly string[]): ScenarioArguments {
  const isReset = argv.includes('--reset')
  const companyIndex = argv.indexOf('--company')
  const companyId = companyIndex === -1 ? undefined : argv[companyIndex + 1]
  if (companyIndex !== -1 && (companyId === undefined || companyId.startsWith('--'))) {
    throw new Error('--company exige o id da empresa')
  }
  return {
    ...(companyId === undefined ? {} : { companyId }),
    isReset,
    shouldSeed: !isReset || argv.includes('--seed'),
  }
}

/** The script writes test data, so it only ever runs against a database on this machine. */
export function assertLocalDatabase(databaseUrl: string | undefined): string {
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('DATABASE_URL é obrigatório')
  }
  let hostname: string
  try {
    hostname = new URL(databaseUrl).hostname
  } catch {
    throw new Error('DATABASE_URL inválido: recusado')
  }
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      'RECUSADO: este script só roda contra um banco local (localhost, 127.0.0.1 ou [::1])',
    )
  }
  return databaseUrl
}

type MembershipRow = { readonly company_id: string; readonly user_id: string }

/** The company of the local user's active membership (the one the seed of `db:seed:local` creates). */
export async function resolveSeedTarget(
  sql: SQL,
  requestedCompanyId: string | undefined,
): Promise<SeedTarget> {
  const rows: MembershipRow[] = await sql`
    select company_id, user_id
      from user_company_memberships
     where status = 'active'
       and user_id = ${LOCAL_IDENTITY_USER_ID}
       and (${requestedCompanyId ?? null}::uuid is null or company_id = ${requestedCompanyId ?? null}::uuid)
     limit 1`
  const [membership] = rows
  if (membership === undefined) {
    throw new Error(
      'Nenhum vínculo ativo do usuário local: rode `bun run db:seed:local` (ou passe --company)',
    )
  }
  return { actorUserId: membership.user_id, companyId: membership.company_id }
}

export async function countAllTables(sql: SQL): Promise<Map<string, number>> {
  const tables: { schemaname: string; tablename: string }[] = await sql`
    select schemaname, tablename
      from pg_tables
     where schemaname not in ('pg_catalog', 'information_schema')
     order by 1, 2`
  const counts = new Map<string, number>()
  for (const table of tables) {
    const name = `"${table.schemaname}"."${table.tablename}"`
    const [row] = await sql.unsafe(`select count(*)::int as total from ${name}`)
    counts.set(`${table.schemaname}.${table.tablename}`, Number(row?.total ?? 0))
  }
  return counts
}

export function printCountDelta(
  title: string,
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): void {
  console.info(title)
  let changedTables = 0
  for (const [table, total] of after) {
    const delta = total - (before.get(table) ?? 0)
    if (delta === 0) continue
    changedTables += 1
    console.info(`  ${table}: ${delta > 0 ? '+' : ''}${delta}`)
  }
  if (changedTables === 0) console.info('  (nenhuma tabela mudou)')
}
