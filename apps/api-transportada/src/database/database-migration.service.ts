/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

import { runNotificationSchemaMigrations } from './notification-migration.service.js'

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

/**
 * Todo schema que o arranque vai encontrar, na ordem em que precisa existir. As migrations do
 * schema de notificações viajam dentro do pacote e têm tabela de controle própria, então rodam
 * depois — mas rodam sempre junto: migrar só `drizzle/` deixa o seed de templates escrevendo numa
 * tabela inexistente, e o pre-deploy morre com o banco já migrado.
 */
export async function runAllDatabaseMigrations({
  connectionString,
  migrationsFolder,
}: RunDatabaseMigrationsParams): Promise<void> {
  await runDatabaseMigrations(
    migrationsFolder === undefined ? { connectionString } : { connectionString, migrationsFolder },
  )
  await runNotificationSchemaMigrations({ connectionString })
}

if (import.meta.main) {
  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL is required to apply database migrations')
  }

  // Só aqui, no passo manual: o startup da API não migra nada.
  await runAllDatabaseMigrations({
    connectionString,
  })

  // As migrations do schema de notificações viajam dentro do pacote e têm tabela de controle
  // própria, então rodam depois — e só aqui, no passo manual: o startup da API não migra nada.
  await runNotificationSchemaMigrations({
    connectionString,
  })
}
