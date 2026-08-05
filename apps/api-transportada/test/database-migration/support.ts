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

export const FREIGHT_TABLES = [
  'freight_calculations',
  'freight_rule_versions',
  'freight_rules',
] as const

export const NFE_TABLES = [
  'nfe_addresses',
  'nfe_distribution_cursors',
  'nfe_documents',
  'nfe_events',
  'nfe_import_items',
  'nfe_imports',
  'nfe_participants',
  'nfe_products',
  'nfe_volumes',
  'processed_messages',
  'processing_outbox',
  'stored_objects',
] as const

export const CTE_BATCH_TABLES = [
  'cte_batches',
  'cte_batch_events',
  'cte_batch_items',
  'cte_batch_item_charges',
  'cte_batch_item_documents',
  'cte_submission_records',
] as const

export const CTE_ISSUANCE_TABLES = [
  'cte_fiscal_documents',
  'cte_issuance_attempts',
  'cte_issuance_events',
  'cte_retry_schedules',
  'cte_issuance_outbox',
] as const

export const CTE_PROFILE_TABLES = [
  'cte_emission_profiles',
  'cte_emission_profile_matchers',
  'cte_emission_profile_components',
] as const

export const BILLING_TABLES = [
  'billing_invoice_documents',
  'billing_invoice_events',
  'billing_invoice_items',
  'billing_invoices',
] as const

export const OPERATIONS_TABLES = ['processing_jobs'] as const

export const FLEET_TABLES = [
  'fleet_vehicles',
  'fleet_drivers',
  'fleet_driver_vehicle_assignments',
] as const

export const MDFE_TABLES = [
  'mdfe_manifests',
  'mdfe_manifest_drivers',
  'mdfe_manifest_items',
  'mdfe_manifest_loading_cities',
  'mdfe_issuance_attempts',
  'mdfe_fiscal_documents',
  'mdfe_issuance_events',
  'mdfe_issuance_outbox',
  'mdfe_processed_messages',
  'mdfe_issuance_payloads',
] as const

export const TRIP_TABLES = ['trips', 'trip_drivers', 'trip_documents'] as const

export const INVITATION_TABLES = ['user_invitations', 'user_invitation_roles'] as const

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
  const expectedTables = [
    ...IDENTITY_TABLES,
    ...INVITATION_TABLES,
    ...FISCAL_TABLES,
    ...FREIGHT_TABLES,
    ...NFE_TABLES,
    ...CTE_BATCH_TABLES,
    ...CTE_ISSUANCE_TABLES,
    ...CTE_PROFILE_TABLES,
    ...BILLING_TABLES,
    ...OPERATIONS_TABLES,
    ...FLEET_TABLES,
    ...MDFE_TABLES,
    ...TRIP_TABLES,
  ]
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
