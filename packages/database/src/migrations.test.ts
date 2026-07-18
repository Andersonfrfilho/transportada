import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { runDatabaseMigrations } from '../scripts/migrate.js'

const databaseUrl = process.env.DRIZZLE_TEST_DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test
const migrationsDirectory = new URL('../drizzle/', import.meta.url)
const destructiveSql = /\b(drop|alter|delete|truncate)\b/i

describe('Drizzle migration baseline', () => {
  test('contains no business or destructive SQL', async () => {
    const entries = await readdir(migrationsDirectory, { withFileTypes: true })
    const migrationDirectories = entries.filter((entry) => entry.isDirectory())

    expect(migrationDirectories).toHaveLength(1)

    const migrationSql = await Bun.file(
      join(migrationsDirectory.pathname, migrationDirectories[0]!.name, 'migration.sql'),
    ).text()

    expect(migrationSql).not.toMatch(destructiveSql)
    expect(migrationSql).not.toMatch(/\b(create table|create type|create sequence)\b/i)
  })

  testWithPostgres('applies the empty baseline and cleans its disposable schema', async () => {
    const admin = new SQL(databaseUrl!)
    const schemaName = `transportada_t007_${crypto.randomUUID().replaceAll('-', '')}`

    try {
      await admin.unsafe(`create schema "${schemaName}"`)
      await runDatabaseMigrations({
        connectionString: databaseUrl!,
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
