/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Reproduz o episódio medido em staging 19/09/2026: banco com migrations pela metade. A trava
 * pura (`test/database-migration/migration-readiness.contract.ts`) já cobre `listPendingMigrations`
 * com fakes; este teste prova que `assertMigrationsAreComplete` lê a pasta e o journal de verdade.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { MigrationsPendingError } from '../../src/database/migration-completeness.error.js'
import { assertMigrationsAreComplete } from '../../src/database/migration-completeness.service.js'

const databaseUrl = process.env.DRIZZLE_TEST_DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('Trava de completude das migrations no pre-deploy', () => {
  testWithPostgres('banco totalmente migrado não acusa pendência', async () => {
    await withDisposableDatabase(async (connectionString) => {
      await runDatabaseMigrations({ connectionString })

      const checked = await assertMigrationsAreComplete({ connectionString })

      expect(checked).toBeGreaterThan(0)
    })
  })

  testWithPostgres(
    'banco sem journal (recém-criado) conta como nenhuma migration aplicada',
    async () => {
      await withDisposableDatabase(async (connectionString) => {
        const failure = await assertMigrationsAreComplete({ connectionString }).catch(
          (error: unknown) => error,
        )

        expect(failure).toBeInstanceOf(MigrationsPendingError)
        const error = failure as MigrationsPendingError
        expect(error.pendingCount).toBeGreaterThan(0)
      })
    },
  )

  // Mesmo defeito do incidente: migration aplicada na imagem, journal do banco sem o registro.
  testWithPostgres(
    'banco com o journal pela metade lança com o total e os nomes pendentes',
    async () => {
      await withDisposableDatabase(async (connectionString) => {
        await runDatabaseMigrations({ connectionString })

        const admin = new SQL(connectionString, { max: 1 })
        try {
          const applied = await admin<Array<{ readonly name: string }>>`
          select name from drizzle.__drizzle_migrations order by name
        `
          const removedName = applied[0]?.name
          if (removedName === undefined) throw new Error('fixture sem migrations aplicadas')

          await admin`delete from drizzle.__drizzle_migrations where name = ${removedName}`
        } finally {
          await admin.close({ timeout: 0 })
        }

        const failure = await assertMigrationsAreComplete({ connectionString }).catch(
          (error: unknown) => error,
        )

        expect(failure).toBeInstanceOf(MigrationsPendingError)
        const error = failure as MigrationsPendingError
        expect(error.pendingCount).toBe(1)
      })
    },
  )
})

async function withDisposableDatabase(
  operation: (connectionString: string) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('DRIZZLE_TEST_DATABASE_URL is required')

  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_147_migration_completeness_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''

  try {
    await admin.unsafe(`create database "${databaseName}"`)
    await operation(disposableUrl.toString())
  } finally {
    try {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
    } finally {
      await admin.close({ timeout: 0 })
    }
  }
}
