/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../src/database/database-migration.service.js'

const databaseUrl = process.env.DRIZZLE_TEST_DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test
const migrationsDirectory = new URL('../drizzle/', import.meta.url)
const DESTRUCTIVE_SQL_PATTERN = /\b(drop|alter|delete|truncate)\b/i
const BUSINESS_SQL_PATTERN = /\b(create table|create type|create sequence)\b/i

describe('Drizzle migration baseline', () => {
  test('contains no business or destructive SQL', async () => {
    const entries = await readdir(migrationsDirectory, { withFileTypes: true })
    const migrationDirectories = entries.filter((entry) => entry.isDirectory())
    const migrationDirectory = migrationDirectories[0]

    expect(migrationDirectories).toHaveLength(1)
    if (migrationDirectory === undefined) {
      throw new Error('The baseline migration directory is required')
    }

    const migrationSql = await Bun.file(
      join(migrationsDirectory.pathname, migrationDirectory.name, 'migration.sql'),
    ).text()

    expect(migrationSql).not.toMatch(DESTRUCTIVE_SQL_PATTERN)
    expect(migrationSql).not.toMatch(BUSINESS_SQL_PATTERN)
  })

  testWithPostgres('applies the empty baseline and cleans its disposable schema', async () => {
    if (databaseUrl === undefined) {
      throw new Error('DRIZZLE_TEST_DATABASE_URL is required')
    }

    const admin = new SQL(databaseUrl)
    const schemaName = `transportada_t012_${crypto.randomUUID().replaceAll('-', '')}`

    try {
      // Disposable schema identifiers cannot be parameterized.
      await admin.unsafe(`create schema "${schemaName}"`)
      await runDatabaseMigrations({
        connectionString: databaseUrl,
        migrationsSchema: schemaName,
      })

      const tables = await admin<Array<{ readonly table_name: string }>>`
        select table_name
        from information_schema.tables
        where table_schema = ${schemaName}
        order by table_name
      `

      expect(tables).toEqual([{ table_name: '__drizzle_migrations' }])
    } finally {
      await admin.unsafe(`drop schema if exists "${schemaName}" cascade`)
      const remainingSchemas = await admin<Array<{ readonly schema_name: string }>>`
        select schema_name
        from information_schema.schemata
        where schema_name = ${schemaName}
      `
      expect(remainingSchemas).toHaveLength(0)
      await admin.close()
    }
  })
})
