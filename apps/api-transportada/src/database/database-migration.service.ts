/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

const DEFAULT_MIGRATIONS_DIRECTORY = new URL('../../drizzle/', import.meta.url).pathname
const MIGRATIONS_SCHEMA = 'drizzle'

type RunDatabaseMigrationsParams = {
  readonly connectionString: string
  readonly migrationsFolder?: string
}

export async function runDatabaseMigrations({
  connectionString,
  migrationsFolder = DEFAULT_MIGRATIONS_DIRECTORY,
}: RunDatabaseMigrationsParams): Promise<void> {
  if (connectionString.length === 0) {
    throw new Error('Database connection string must not be empty')
  }

  const provider = createDrizzleProvider({
    connection: {
      adapter: 'postgres',
      max: 1,
      url: connectionString,
    },
  })

  try {
    await migrate(provider.db, {
      migrationsFolder,
      migrationsSchema: MIGRATIONS_SCHEMA,
    })
  } finally {
    await provider.close()
  }
}

if (import.meta.main) {
  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL is required to apply database migrations')
  }

  await runDatabaseMigrations({
    connectionString,
  })
}
