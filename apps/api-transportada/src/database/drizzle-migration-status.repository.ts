/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { pgSchema, text } from 'drizzle-orm/pg-core'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { listPendingMigrations } from './migration-status.policy.js'
import type { MigrationStatusPort } from '../shared/api.types.js'

const DEFAULT_MIGRATIONS_DIRECTORY = new URL('../../drizzle/', import.meta.url).pathname

/** Journal do próprio drizzle: fica fora de `database.schema.ts` para o drizzle-kit não gerá-lo. */
const migrationJournal = pgSchema('drizzle').table('__drizzle_migrations', {
  name: text('name'),
})

type MigrationDatabase = ReturnType<typeof createDrizzleProvider>['db']

type DrizzleMigrationStatusRepositoryParams = {
  readonly database: MigrationDatabase
  readonly migrationsFolder?: string
}

export class DrizzleMigrationStatusRepository implements MigrationStatusPort {
  private readonly database: MigrationDatabase
  private readonly shippedNames: readonly string[]

  public constructor({
    database,
    migrationsFolder = DEFAULT_MIGRATIONS_DIRECTORY,
  }: DrizzleMigrationStatusRepositoryParams) {
    this.database = database
    this.shippedNames = readShippedMigrationNames(migrationsFolder)
  }

  public async countPending(): Promise<number> {
    const applied = await this.database
      .select({ name: migrationJournal.name })
      .from(migrationJournal)

    return listPendingMigrations({
      appliedNames: applied.flatMap((row) => (row.name === null ? [] : [row.name])),
      shippedNames: this.shippedNames,
    }).length
  }
}

/** Espelha o `readMigrationFiles` do drizzle: só conta a pasta que tem `migration.sql`. */
function readShippedMigrationNames(migrationsFolder: string): readonly string[] {
  return readdirSync(migrationsFolder)
    .filter((entry) => existsSync(join(migrationsFolder, entry, 'migration.sql')))
    .toSorted()
}
