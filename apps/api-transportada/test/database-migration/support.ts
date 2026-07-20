import { SQL } from 'bun'
import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'

export const databaseUrl = process.env.DRIZZLE_TEST_DATABASE_URL
export const testWithPostgres = databaseUrl === undefined ? test.skip : test
export const migrationsDirectory = new URL('../../drizzle/', import.meta.url)
export const DESTRUCTIVE_MIGRATION_PATTERN =
  /^\s*(drop|delete|truncate)\b|^\s*alter\s+table\b[^;]*\bdrop\b/im

export const IDENTITY_TABLES = [
  'companies',
  'external_identities',
  'identity_users',
  'membership_roles',
  'user_company_memberships',
] as const

export const FISCAL_TABLES = [
  'audit_logs',
  'company_fiscal_profiles',
  'digital_certificates',
  'fiscal_sequence_reservations',
  'fiscal_sequences',
  'idempotency_records',
] as const

export async function listMigrationDirectories(): Promise<readonly string[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted()
}

export async function expectQueryToFail(
  query: PromiseLike<unknown>,
  expectedSqlState: '23503' | '23505' | '23514' | '55000',
  expectedConstraint?: string,
): Promise<void> {
  try {
    await query
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    const postgresError = error as {
      readonly constraint?: unknown
      readonly errno?: unknown
    }
    expect(postgresError.errno).toBe(expectedSqlState)
    if (expectedConstraint !== undefined) {
      expect(postgresError.constraint).toBe(expectedConstraint)
    }
    return
  }

  throw new Error(`Expected PostgreSQL SQLSTATE ${expectedSqlState}`)
}

export async function readBusinessTables(database: SQL): Promise<readonly string[]> {
  const expectedTables = [...IDENTITY_TABLES, ...FISCAL_TABLES]
  const tables = await database<Array<{ readonly table_name: string }>>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ${database(expectedTables)}
    order by table_name
  `

  return tables.map((row) => row.table_name)
}

export async function readMigrationNames(database: SQL): Promise<readonly string[]> {
  const migrations = await database<Array<{ readonly name: string }>>`
    select name
    from drizzle.__drizzle_migrations
    order by created_at
  `

  return migrations.map((migration) => migration.name)
}

export async function withDisposableDatabase(
  callback: (database: SQL, connectionString: string) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('DRIZZLE_TEST_DATABASE_URL is required')

  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t008_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: SQL | undefined
  let testFailure: unknown

  try {
    await admin.unsafe(`create database "${databaseName}"`)
    database = new SQL(disposableUrl.toString(), { max: 1 })
    await callback(database, disposableUrl.toString())
  } catch (error) {
    testFailure = error
  }

  const cleanupFailures: unknown[] = []
  try {
    await database?.close({ timeout: 0 })
  } catch (error) {
    cleanupFailures.push(error)
  }
  try {
    await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
  } catch (error) {
    cleanupFailures.push(error)
  }
  try {
    const remaining = await admin<Array<{ readonly datname: string }>>`
      select datname from pg_database where datname = ${databaseName}
    `
    if (remaining.length !== 0) {
      cleanupFailures.push(new Error(`Disposable database ${databaseName} was not removed`))
    }
  } catch (error) {
    cleanupFailures.push(error)
  }
  try {
    await admin.close({ timeout: 0 })
  } catch (error) {
    cleanupFailures.push(error)
  }

  if (testFailure !== undefined) throw testFailure
  if (cleanupFailures[0] !== undefined) throw cleanupFailures[0]
}
