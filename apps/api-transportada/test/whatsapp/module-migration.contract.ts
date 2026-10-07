/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 062 T006 — as migrations do `meta-whatsapp-module` na cadeia da transportada.
 *
 * Mesmo arranjo do schema de notificações: as migrations viajam dentro do pacote e não têm diretório
 * nosso em `drizzle/`. O que este contrato guarda é a **fronteira** — o schema entra inteiro, o
 * `public` não é tocado, e o rollback devolve o banco ao estado anterior.
 */
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  META_WHATSAPP_MIGRATIONS_TABLE,
  metaWhatsAppMigrationsFolder,
} from '@adatechnology/meta-whatsapp-module'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  META_WHATSAPP_ROLLBACK_FILE,
  META_WHATSAPP_SCHEMA,
  readMetaWhatsAppRollbackSql,
  runMetaWhatsAppSchemaMigrations,
} from '../../src/database/meta-whatsapp-migration.service.js'
import {
  readBusinessTables,
  testWithPostgres,
  withDisposableDatabase,
} from '../database-migration/support.js'

const ORIGINAL_MIGRATION_COUNT = 4

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

describe('as migrations do módulo de conversa (spec 062 T006)', () => {
  testWithPostgres('cria o schema meta_whatsapp sem tocar no public', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      const businessTablesBefore = await readBusinessTables(database)

      await runMetaWhatsAppSchemaMigrations({ connectionString })

      expect((await readSchemaTables(database, META_WHATSAPP_SCHEMA)).length).toBeGreaterThan(0)
      expect(await readBusinessTables(database)).toEqual(businessTablesBefore)
    })
  })

  testWithPostgres('o rollback devolve o estado anterior', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      const businessTablesBefore = await readBusinessTables(database)

      await runMetaWhatsAppSchemaMigrations({ connectionString })
      await database.unsafe(await readMetaWhatsAppRollbackSql())

      expect(await readSchemaTables(database, META_WHATSAPP_SCHEMA)).toEqual([])
      expect(await readBusinessTables(database)).toEqual(businessTablesBefore)
    })
  })

  /**
   * ⚠️ Derrubar só o schema deixaria o journal dizendo que já foi aplicado, e o banco ficaria sem as
   * tabelas **e sem erro aparente**. É por isso que o rollback apaga a tabela de controle junto.
   */
  testWithPostgres('reaplicar as migrations depois do rollback é limpo', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      await runMetaWhatsAppSchemaMigrations({ connectionString })
      await database.unsafe(await readMetaWhatsAppRollbackSql())
      await runMetaWhatsAppSchemaMigrations({ connectionString })

      expect((await readSchemaTables(database, META_WHATSAPP_SCHEMA)).length).toBeGreaterThan(0)
    })
  })

  testWithPostgres('o rollback é declarado ao lado do runner, não em drizzle/', async () => {
    const rollbackSql = await readMetaWhatsAppRollbackSql()

    expect(META_WHATSAPP_ROLLBACK_FILE).toMatch(/drizzle-meta-whatsapp\/rollback\.sql$/)
    expect(rollbackSql).toMatch(/drop schema (if exists )?"?meta_whatsapp"?/i)
    /** Sem esta linha o rollback é uma armadilha: some o schema e o journal continua marcado. */
    expect(rollbackSql).toMatch(/meta_whatsapp_migrations/i)
  })

  /**
   * ⚠️ O migrator decide pelo NOME da migration: banco que já rodou as quatro originais (pacote
   * `0.1.0`) só pode executar as aditivas. Reaplicar uma original recriaria tabela existente e
   * derrubaria o pre-deploy.
   */
  testWithPostgres('banco com as quatro originais aplicadas só roda as aditivas', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      const packageFolder = metaWhatsAppMigrationsFolder()
      const allNames = readdirSync(packageFolder).toSorted()
      const originalNames = allNames.slice(0, ORIGINAL_MIGRATION_COUNT)
      const originalsFolder = mkdtempSync(join(tmpdir(), 'meta-whatsapp-originals-'))
      try {
        for (const name of originalNames) {
          cpSync(join(packageFolder, name), join(originalsFolder, name), { recursive: true })
        }
        const provider = createDrizzleProvider({
          connection: { adapter: 'postgres', max: 1, url: connectionString },
        })
        try {
          await migrate(provider.db as never, {
            migrationsFolder: originalsFolder,
            migrationsTable: META_WHATSAPP_MIGRATIONS_TABLE,
          })
        } finally {
          await provider.close()
        }
        const readJournal = async () =>
          database<Array<{ readonly name: string }>>`
            select name from drizzle.meta_whatsapp_migrations order by id
          `
        expect((await readJournal()).map((row) => row.name)).toEqual(originalNames)

        await runMetaWhatsAppSchemaMigrations({ connectionString })

        expect((await readJournal()).map((row) => row.name)).toEqual(allNames)
      } finally {
        rmSync(originalsFolder, { force: true, recursive: true })
      }
    })
  })
})
