/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  readUserRollbackSql,
  runUserSchemaMigrations,
  USER_ROLLBACK_FILE,
  USER_SCHEMA,
} from '../../src/database/user-migration.service.js'
import {
  readBusinessTables,
  testWithPostgres,
  withDisposableDatabase,
} from '../database-migration/support.js'

/**
 * O schema `user` é de terceiro: as migrations viajam dentro do `@adatechnology/user-module` e não
 * têm diretório nosso em `drizzle/`. O que este contrato guarda é a fronteira — o schema entra
 * inteiro, o `public` não é tocado, e o rollback devolve o banco ao estado anterior.
 */
const USER_TABLES = ['password_reset_tokens', 'refresh_tokens', 'users'] as const

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

describe('User migration contract', () => {
  testWithPostgres('cria o schema user sem tocar no public', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      const businessTablesBefore = await readBusinessTables(database)

      await runUserSchemaMigrations({ connectionString })

      const userTables = await readSchemaTables(database, USER_SCHEMA)
      expect(userTables).toEqual([...USER_TABLES])
      expect(await readBusinessTables(database)).toEqual(businessTablesBefore)
    })
  })

  testWithPostgres('o rollback devolve o estado anterior', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      const businessTablesBefore = await readBusinessTables(database)

      await runUserSchemaMigrations({ connectionString })
      await database.unsafe(await readUserRollbackSql())

      expect(await readSchemaTables(database, USER_SCHEMA)).toEqual([])
      expect(await readBusinessTables(database)).toEqual(businessTablesBefore)

      const schemas = await database<Array<{ readonly schema_name: string }>>`
        select schema_name from information_schema.schemata where schema_name = ${USER_SCHEMA}
      `
      expect(schemas).toEqual([])
    })
  })

  testWithPostgres('reaplicar as migrations depois do rollback é limpo', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      await runUserSchemaMigrations({ connectionString })
      await database.unsafe(await readUserRollbackSql())
      await runUserSchemaMigrations({ connectionString })

      expect(await readSchemaTables(database, USER_SCHEMA)).toEqual([...USER_TABLES])
    })
  })

  testWithPostgres('o rollback é declarado ao lado do runner, não em drizzle/', async () => {
    const rollbackSql = await readUserRollbackSql()

    expect(USER_ROLLBACK_FILE).toMatch(/drizzle-user\/rollback\.sql$/)
    expect(rollbackSql).toMatch(/drop schema (if exists )?"?user"?/i)
  })
})
