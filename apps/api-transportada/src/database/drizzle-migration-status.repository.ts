/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { pgSchema, text } from 'drizzle-orm/pg-core'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { listPendingMigrations, resolveMigrationsDirectory } from './migration-status.policy.js'
import type { MigrationStatusPort } from '../shared/api.types.js'

/** Fonte roda de `src/database/`, imagem roda de `dist/main.js`: são profundidades diferentes. */
const MIGRATIONS_DIRECTORY_CANDIDATES = [
  new URL('../../drizzle/', import.meta.url).pathname,
  new URL('../drizzle/', import.meta.url).pathname,
  join(process.cwd(), 'drizzle'),
] as const

/** Journal do próprio drizzle: fica fora de `database.schema.ts` para o drizzle-kit não gerá-lo. */
const migrationJournal = pgSchema('drizzle').table('__drizzle_migrations', {
  name: text('name'),
})

export type MigrationDatabase = ReturnType<typeof createDrizzleProvider>['db']

type DrizzleMigrationStatusRepositoryParams = {
  readonly database: MigrationDatabase
  readonly migrationsFolder?: string
}

export class DrizzleMigrationStatusRepository implements MigrationStatusPort {
  private readonly database: MigrationDatabase
  private readonly migrationsFolder: string | undefined
  private shippedNames: readonly string[] | undefined

  public constructor({ database, migrationsFolder }: DrizzleMigrationStatusRepositoryParams) {
    this.database = database
    this.migrationsFolder = migrationsFolder
  }

  public async countPending(): Promise<number> {
    // Leitura preguiçosa: erro aqui degrada a readiness, enquanto no boot derrubaria a API inteira.
    const shippedNames = (this.shippedNames ??= this.readShippedNames())

    const applied = await this.database
      .select({ name: migrationJournal.name })
      .from(migrationJournal)

    return listPendingMigrations({
      appliedNames: applied.flatMap((row) => (row.name === null ? [] : [row.name])),
      shippedNames,
    }).length
  }

  private readShippedNames(): readonly string[] {
    const folder =
      this.migrationsFolder ??
      resolveMigrationsDirectory({
        candidates: MIGRATIONS_DIRECTORY_CANDIDATES,
        exists: existsSync,
      })

    if (folder === undefined) {
      throw new Error('pasta de migrations não encontrada ao lado da aplicação')
    }

    // Espelha o `readMigrationFiles` do drizzle: só conta a pasta que tem `migration.sql`.
    return readdirSync(folder)
      .filter((entry) => existsSync(join(folder, entry, 'migration.sql')))
      .toSorted()
  }
}
