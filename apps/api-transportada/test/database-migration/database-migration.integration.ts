import { join } from 'node:path'

import { describe, expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { assertFiscalConstraints } from './fiscal-constraints.assertion.js'
import { assertIdentityConstraints } from './identity-constraints.assertion.js'
import {
  FISCAL_TABLES,
  IDENTITY_TABLES,
  listMigrationDirectories,
  migrationsDirectory,
  readBusinessTables,
  readMigrationNames,
  testWithPostgres,
  withDisposableDatabase,
} from './support.js'

describe('Drizzle migration integration', () => {
  testWithPostgres(
    'applies, constrains, rolls back, and reapplies the fiscal migration',
    async () => {
      await withDisposableDatabase(async (database, connectionString) => {
        const migrationDirectories = await listMigrationDirectories()
        const fiscalDirectory = migrationDirectories[2]
        const identityDirectory = migrationDirectories[1]
        if (fiscalDirectory === undefined || identityDirectory === undefined) {
          throw new Error('Identity and fiscal migrations are required')
        }

        await runDatabaseMigrations({ connectionString })
        expect(await readBusinessTables(database)).toEqual(
          [...IDENTITY_TABLES, ...FISCAL_TABLES].toSorted(),
        )
        expect(await readMigrationNames(database)).toEqual(migrationDirectories)

        const identityFixture = await assertIdentityConstraints(database)
        await assertFiscalConstraints(database, identityFixture)

        const fiscalRollback = await Bun.file(
          join(migrationsDirectory.pathname, fiscalDirectory, 'rollback.sql'),
        ).text()
        await database.unsafe(fiscalRollback)
        expect(await readBusinessTables(database)).toEqual([...IDENTITY_TABLES].toSorted())
        expect(await readMigrationNames(database)).toEqual(migrationDirectories.slice(0, 2))

        await runDatabaseMigrations({ connectionString })
        expect(await readBusinessTables(database)).toEqual(
          [...IDENTITY_TABLES, ...FISCAL_TABLES].toSorted(),
        )
        expect(await readMigrationNames(database)).toEqual(migrationDirectories)

        await database.unsafe(fiscalRollback)
        const identityRollback = await Bun.file(
          join(migrationsDirectory.pathname, identityDirectory, 'rollback.sql'),
        ).text()
        await database.unsafe(identityRollback)
        expect(await readBusinessTables(database)).toHaveLength(0)
        expect(await readMigrationNames(database)).toEqual(migrationDirectories.slice(0, 1))
      })
    },
    30_000,
  )
})
