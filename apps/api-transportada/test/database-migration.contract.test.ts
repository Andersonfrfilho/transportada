/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../src/database/database-migration.service.js'

const databaseUrl = process.env.DRIZZLE_TEST_DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test
const migrationsDirectory = new URL('../drizzle/', import.meta.url)
const DESTRUCTIVE_MIGRATION_PATTERN =
  /^\s*(drop|delete|truncate)\b|^\s*alter\s+table\b[^;]*\bdrop\b/im
const BUSINESS_TABLES = [
  'companies',
  'external_identities',
  'identity_users',
  'membership_roles',
  'user_company_memberships',
] as const

async function listMigrationDirectories(): Promise<readonly string[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted()
}

async function expectQueryToFail(
  query: PromiseLike<unknown>,
  expectedSqlState: '23503' | '23505' | '23514',
  expectedConstraint: string,
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
    expect(postgresError.constraint).toBe(expectedConstraint)
    return
  }

  throw new Error(`Expected PostgreSQL SQLSTATE ${expectedSqlState}`)
}

async function readBusinessTables(database: SQL): Promise<readonly string[]> {
  const tables = await database<Array<{ readonly table_name: string }>>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ${database(BUSINESS_TABLES)}
    order by table_name
  `

  return tables.map((row) => row.table_name)
}

async function readMigrationNames(database: SQL): Promise<readonly string[]> {
  const migrations = await database<Array<{ readonly name: string }>>`
    select name
    from drizzle.__drizzle_migrations
    order by created_at
  `

  return migrations.map((migration) => migration.name)
}

describe('Drizzle identity migration', () => {
  test('keeps the baseline empty and adds one additive identity migration', async () => {
    const migrationDirectories = await listMigrationDirectories()
    const [baselineDirectory, identityDirectory] = migrationDirectories

    expect(migrationDirectories).toHaveLength(2)
    if (baselineDirectory === undefined || identityDirectory === undefined) {
      throw new Error('Baseline and identity migration directories are required')
    }

    const baselineSql = await Bun.file(
      join(migrationsDirectory.pathname, baselineDirectory, 'migration.sql'),
    ).text()
    const identitySql = await Bun.file(
      join(migrationsDirectory.pathname, identityDirectory, 'migration.sql'),
    ).text()

    expect(baselineSql).not.toMatch(/\b(create table|create type|create sequence)\b/i)
    expect(baselineSql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)
    expect(identitySql).not.toMatch(DESTRUCTIVE_MIGRATION_PATTERN)

    for (const table of BUSINESS_TABLES) {
      expect(identitySql).toContain(`CREATE TABLE "${table}"`)
    }
  })

  test('versions a reverse-dependency rollback outside the automatic migration path', async () => {
    const migrationDirectories = await listMigrationDirectories()
    const identityDirectory = migrationDirectories[1]

    if (identityDirectory === undefined) {
      throw new Error('Identity migration directory is required')
    }

    const rollbackSql = await Bun.file(
      join(migrationsDirectory.pathname, identityDirectory, 'rollback.sql'),
    ).text()
    const identitySql = await Bun.file(
      join(migrationsDirectory.pathname, identityDirectory, 'migration.sql'),
    ).text()
    const identityHash = createHash('sha256').update(identitySql).digest('hex')
    const rollbackOrder = [
      'membership_roles',
      'user_company_memberships',
      'external_identities',
      'companies',
      'identity_users',
    ].map((table) => rollbackSql.indexOf(`DROP TABLE "${table}"`))

    expect(rollbackOrder.every((position) => position >= 0)).toBeTrue()
    expect(rollbackOrder).toEqual(rollbackOrder.toSorted((left, right) => left - right))
    expect(rollbackSql).toContain(`"name" = '${identityDirectory}'`)
    expect(rollbackSql).toContain(`"hash" = '${identityHash}'`)
    expect(rollbackSql).toContain('deleted_migrations <> 1')
    expect(rollbackSql).not.toContain('CASCADE')
  })

  test('does not run migrations from the API startup path', async () => {
    const mainSource = await Bun.file(new URL('../src/main.ts', import.meta.url)).text()
    const migrationServiceSource = await Bun.file(
      new URL('../src/database/database-migration.service.ts', import.meta.url),
    ).text()

    expect(mainSource).not.toContain('runDatabaseMigrations')
    expect(mainSource).not.toContain('db:migrate')
    expect(migrationServiceSource).toContain(`const MIGRATIONS_SCHEMA = 'drizzle'`)
    expect(migrationServiceSource).not.toContain('DRIZZLE_MIGRATIONS_SCHEMA')
  })

  testWithPostgres(
    'applies constraints, supports multiple roles, and rolls back a disposable database',
    async () => {
      if (databaseUrl === undefined) {
        throw new Error('DRIZZLE_TEST_DATABASE_URL is required')
      }

      const admin = new SQL(databaseUrl, { max: 1 })
      const databaseName = `transportada_t009_${crypto.randomUUID().replaceAll('-', '')}`
      const disposableUrl = new URL(databaseUrl)
      disposableUrl.pathname = `/${databaseName}`
      disposableUrl.search = ''
      let database: SQL | undefined
      let testFailure: unknown
      let hasTestFailure = false

      try {
        // Disposable database identifiers cannot be parameterized.
        await admin.unsafe(`create database "${databaseName}"`)
        await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
        database = new SQL(disposableUrl.toString(), { max: 1 })

        expect(await readBusinessTables(database)).toEqual([...BUSINESS_TABLES].toSorted())
        expect(await readMigrationNames(database)).toEqual([
          '20260718224814_baseline',
          '20260719025322_tenant_identity',
        ])

        const userId = crypto.randomUUID()
        const companyId = crypto.randomUUID()
        const membershipId = crypto.randomUUID()

        await database`
          insert into identity_users (id, status)
          values (${userId}, 'active')
        `
        await database`
          insert into external_identities (user_id, issuer, subject)
          values (${userId}, 'http://localhost:58080/realms/transportada-local', 'local-user')
        `
        await database`
          insert into companies (id, status)
          values (${companyId}, 'active')
        `
        await database`
          insert into user_company_memberships (id, user_id, company_id, status)
          values (${membershipId}, ${userId}, ${companyId}, 'active')
        `
        await database`
          insert into membership_roles (membership_id, role)
          values (${membershipId}, 'finance'), (${membershipId}, 'fiscal')
        `

        const roles = await database<Array<{ readonly role: string }>>`
          select role
          from membership_roles
          where membership_id = ${membershipId}
          order by role
        `
        expect(roles).toEqual([{ role: 'finance' }, { role: 'fiscal' }])

        await expectQueryToFail(
          database`
            insert into external_identities (user_id, issuer, subject)
            values (${userId}, 'http://localhost:58080/realms/transportada-local', 'local-user')
          `,
          '23505',
          'external_identities_issuer_subject_unique',
        )
        await expectQueryToFail(
          database`
            insert into external_identities (user_id, issuer, subject)
            values (${userId}, ${'\t\n'}, ${'\u00a0'})
          `,
          '23514',
          'external_identities_issuer_subject_not_blank_check',
        )
        await expectQueryToFail(
          database`
            insert into external_identities (user_id, issuer, subject)
            values (${crypto.randomUUID()}, 'https://issuer.example', 'unknown-user')
          `,
          '23503',
          'external_identities_user_id_identity_users_id_fkey',
        )
        await expectQueryToFail(
          database`
            insert into user_company_memberships (user_id, company_id, status)
            values (${crypto.randomUUID()}, ${companyId}, 'active')
          `,
          '23503',
          'user_company_memberships_user_id_identity_users_id_fkey',
        )
        await expectQueryToFail(
          database`
            insert into user_company_memberships (user_id, company_id, status)
            values (${userId}, ${crypto.randomUUID()}, 'active')
          `,
          '23503',
          'user_company_memberships_company_id_companies_id_fkey',
        )
        await expectQueryToFail(
          database`
            insert into user_company_memberships (user_id, company_id, status)
            values (${userId}, ${companyId}, 'active')
          `,
          '23505',
          'user_company_memberships_user_company_unique',
        )
        await expectQueryToFail(
          database`
            insert into identity_users (id, status)
            values (${crypto.randomUUID()}, 'pending')
          `,
          '23514',
          'identity_users_status_check',
        )
        await expectQueryToFail(
          database`
            insert into companies (id, status)
            values (${crypto.randomUUID()}, 'pending')
          `,
          '23514',
          'companies_status_check',
        )
        const statusCheckCompanyId = crypto.randomUUID()
        await database`
          insert into companies (id, status)
          values (${statusCheckCompanyId}, 'active')
        `
        await expectQueryToFail(
          database`
            insert into user_company_memberships (user_id, company_id, status)
            values (${userId}, ${statusCheckCompanyId}, 'pending')
          `,
          '23514',
          'user_company_memberships_status_check',
        )
        await expectQueryToFail(
          database`
            insert into membership_roles (membership_id, role)
            values (${membershipId}, 'platform-admin')
          `,
          '23514',
          'membership_roles_role_check',
        )
        await expectQueryToFail(
          database`
            insert into membership_roles (membership_id, role)
            values (${crypto.randomUUID()}, 'viewer')
          `,
          '23503',
          'membership_roles_membership_id_user_company_memberships_id_fkey',
        )
        await expectQueryToFail(
          database`
            insert into membership_roles (membership_id, role)
            values (${membershipId}, 'finance')
          `,
          '23505',
          'membership_roles_membership_id_role_pk',
        )

        const migrationDirectories = await listMigrationDirectories()
        const identityDirectory = migrationDirectories[1]
        if (identityDirectory === undefined) {
          throw new Error('Identity migration directory is required')
        }

        const rollbackSql = await Bun.file(
          join(migrationsDirectory.pathname, identityDirectory, 'rollback.sql'),
        ).text()
        await database.unsafe(rollbackSql)

        expect(await readBusinessTables(database)).toHaveLength(0)
        expect(await readMigrationNames(database)).toEqual(['20260718224814_baseline'])

        await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
        expect(await readBusinessTables(database)).toEqual([...BUSINESS_TABLES].toSorted())
        expect(await readMigrationNames(database)).toEqual([
          '20260718224814_baseline',
          '20260719025322_tenant_identity',
        ])

        await database.unsafe(rollbackSql)
        expect(await readBusinessTables(database)).toHaveLength(0)
        expect(await readMigrationNames(database)).toEqual(['20260718224814_baseline'])
      } catch (error) {
        hasTestFailure = true
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
        const remainingDatabases = await admin<Array<{ readonly datname: string }>>`
          select datname
          from pg_database
          where datname = ${databaseName}
        `
        if (remainingDatabases.length !== 0) {
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

      if (hasTestFailure) {
        throw testFailure
      }
      if (cleanupFailures.length > 0) {
        throw cleanupFailures[0]
      }
    },
    30_000,
  )
})
