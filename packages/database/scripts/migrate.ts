import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

const defaultMigrationsDirectory = new URL('../drizzle/', import.meta.url).pathname

export interface DatabaseMigrationOptions {
  readonly connectionString: string
  readonly migrationsFolder?: string
  readonly migrationsSchema?: string
}

export async function runDatabaseMigrations({
  connectionString,
  migrationsFolder = defaultMigrationsDirectory,
  migrationsSchema = 'drizzle',
}: DatabaseMigrationOptions): Promise<void> {
  if (connectionString.length === 0) {
    throw new Error('Database connection string must not be empty')
  }

  const provider = createDrizzleProvider({
    connection: {
      url: connectionString,
      adapter: 'postgres',
      max: 1,
    },
  })

  try {
    await migrate(provider.db, {
      migrationsFolder,
      migrationsSchema,
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
    migrationsSchema: process.env.DRIZZLE_MIGRATIONS_SCHEMA,
  })
}
