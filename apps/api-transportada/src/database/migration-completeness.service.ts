/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { DEFAULT_MIGRATIONS_DIRECTORY } from './database-migration.service.js'
import { migrationJournal } from './drizzle-migration-status.repository.js'
import { MigrationsPendingError } from './migration-completeness.error.js'
import { listPendingMigrations } from './migration-status.policy.js'
import { isUndefinedTableError } from './postgres-error.support.js'

type AssertMigrationsAreCompleteParams = {
  readonly connectionString: string
  readonly migrationsFolder?: string
}

/**
 * Roda logo depois do `migrate()` do pre-deploy: se a pasta que a imagem enviou tem migration que o
 * journal do banco não registrou, o deploy tem de reprovar aqui — nunca reportar `migrated: true` com
 * o banco pela metade. Devolve quantas migrations locais foram conferidas, para o relatório.
 */
export async function assertMigrationsAreComplete({
  connectionString,
  migrationsFolder = DEFAULT_MIGRATIONS_DIRECTORY,
}: AssertMigrationsAreCompleteParams): Promise<number> {
  const shippedNames = readShippedMigrationNames(migrationsFolder)
  const appliedNames = await readAppliedMigrationNames(connectionString)

  const pendingNames = listPendingMigrations({ appliedNames, shippedNames })
  if (pendingNames.length > 0) {
    throw new MigrationsPendingError({ pendingNames })
  }

  return shippedNames.length
}

/** Mesma regra que o drizzle usa para descobrir o que foi enviado: pasta com `migration.sql`. */
function readShippedMigrationNames(migrationsFolder: string): readonly string[] {
  return readdirSync(migrationsFolder)
    .filter((entry) => existsSync(join(migrationsFolder, entry, 'migration.sql')))
    .toSorted((left, right) => left.localeCompare(right))
}

async function readAppliedMigrationNames(connectionString: string): Promise<readonly string[]> {
  const provider = createDrizzleProvider({
    connection: { adapter: 'postgres', max: 1, url: connectionString },
  })

  try {
    const rows = await provider.db.select({ name: migrationJournal.name }).from(migrationJournal)
    return rows.flatMap((row) => (row.name === null ? [] : [row.name]))
  } catch (error) {
    // Banco recém-criado, sem journal ainda: nenhuma migration aplicada, não é falha.
    if (isUndefinedTableError(error)) return []
    throw error
  } finally {
    await provider.close()
  }
}
