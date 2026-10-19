/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { NOTIFICATION_MIGRATIONS_TABLE } from '@adatechnology/notification-module'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  NOTIFICATION_ROLLBACK_FILE,
  NOTIFICATION_SCHEMA,
  readNotificationRollbackSql,
  runNotificationSchemaMigrations,
} from '../../src/database/notification-migration.service.js'
import {
  readBusinessTables,
  testWithPostgres,
  withDisposableDatabase,
} from '../database-migration/support.js'

/**
 * O schema `notification` é de terceiro: as migrations viajam dentro do pacote e não têm diretório
 * nosso em `drizzle/`. O que este contrato guarda é a fronteira — o schema entra inteiro, o
 * `public` não é tocado, e o rollback devolve o banco ao estado anterior.
 */
const NOTIFICATION_TABLES = [
  'category_policies',
  'deliveries',
  'devices',
  'notifications',
  'preferences',
  'suppressions',
  'templates',
] as const

async function readSchemaTables(
  database: { <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> },
  schema: string,
): Promise<readonly string[]> {
  const tables = await database<Array<{ readonly table_name: string }>>`
    select table_name
    from information_schema.tables
    where table_schema = ${schema}
    order by table_name
  `

  return tables.map((table) => table.table_name)
}

describe('Notification migration contract', () => {
  testWithPostgres('cria o schema notification sem tocar no public', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      const businessTablesBefore = await readBusinessTables(database)

      await runNotificationSchemaMigrations({ connectionString })

      const notificationTables = await readSchemaTables(database, NOTIFICATION_SCHEMA)
      expect(notificationTables).toEqual([...NOTIFICATION_TABLES])
      expect(await readBusinessTables(database)).toEqual(businessTablesBefore)
    })
  })

  testWithPostgres('o rollback devolve o estado anterior', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      const businessTablesBefore = await readBusinessTables(database)

      await runNotificationSchemaMigrations({ connectionString })
      await database.unsafe(await readNotificationRollbackSql())

      expect(await readSchemaTables(database, NOTIFICATION_SCHEMA)).toEqual([])
      expect(await readBusinessTables(database)).toEqual(businessTablesBefore)

      const schemas = await database<Array<{ readonly schema_name: string }>>`
        select schema_name from information_schema.schemata where schema_name = ${NOTIFICATION_SCHEMA}
      `
      expect(schemas).toEqual([])
    })
  })

  testWithPostgres('reaplicar as migrations depois do rollback é limpo', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      await runNotificationSchemaMigrations({ connectionString })
      await database.unsafe(await readNotificationRollbackSql())
      await runNotificationSchemaMigrations({ connectionString })

      expect(await readSchemaTables(database, NOTIFICATION_SCHEMA)).toEqual([
        ...NOTIFICATION_TABLES,
      ])
    })
  })

  testWithPostgres('o rollback é declarado ao lado do runner, não em drizzle/', async () => {
    const rollbackSql = await readNotificationRollbackSql()

    expect(NOTIFICATION_ROLLBACK_FILE).toMatch(/drizzle-notification\/rollback\.sql$/)
    expect(rollbackSql).toMatch(/drop schema (if exists )?"?notification"?/i)
  })

  test('o serviço aplica as migrations do módulo no layout v1', async () => {
    const source = await readFile(
      new URL('../../src/database/notification-migration.service.ts', import.meta.url),
      'utf8',
    )

    expect(source).toMatch(/layout:\s*'v1'/)
  })

  testWithPostgres(
    'banco do rc.3 sobe para o 0.2.x aplicando só as duas migrations novas',
    async () => {
      await withDisposableDatabase(async (database, connectionString) => {
        await runDatabaseMigrations({ connectionString })
        const provider = createDrizzleProvider({
          connection: { adapter: 'postgres', max: 1, url: connectionString },
        })
        try {
          await migrate(provider.db as never, {
            migrationsFolder: new URL('../fixtures/notification-migrations-rc3', import.meta.url)
              .pathname,
            migrationsTable: NOTIFICATION_MIGRATIONS_TABLE,
          })
        } finally {
          await provider.close()
        }
        const readApplied = () =>
          database.unsafe(
            `select name from drizzle."${NOTIFICATION_MIGRATIONS_TABLE}" order by name`,
          ) as Promise<Array<{ readonly name: string }>>
        const atRc3 = (await readApplied()).map((row) => row.name)
        expect(atRc3).toEqual([
          '20260802053704_melodic_selene',
          '20260802130118_jittery_raider',
          '20260802131549_bizarre_dagger',
        ])
        expect(await readSchemaTables(database, NOTIFICATION_SCHEMA)).not.toContain(
          'category_policies',
        )

        await runNotificationSchemaMigrations({ connectionString })

        expect((await readApplied()).map((row) => row.name)).toEqual([
          ...atRc3,
          '20260824183059_silky_omega_sentinel',
          '20260825123207_bright_shape',
        ])
        expect(await readSchemaTables(database, NOTIFICATION_SCHEMA)).toEqual([
          ...NOTIFICATION_TABLES,
        ])
      })
    },
  )
})
