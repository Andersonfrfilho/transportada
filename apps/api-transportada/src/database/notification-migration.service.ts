/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { runNotificationMigrations } from '@adatechnology/notification-module'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

export const NOTIFICATION_SCHEMA = 'notification'

/**
 * As migrations do módulo viajam dentro do pacote, então não existe diretório nosso em `drizzle/`
 * para o rollback ficar ao lado — e acrescentar um quebraria o contrato que fixa a lista de
 * migrations da aplicação. Ele mora ao lado do runner, num diretório irmão.
 */
export const NOTIFICATION_ROLLBACK_FILE = new URL(
  '../../drizzle-notification/rollback.sql',
  import.meta.url,
).pathname

type RunNotificationSchemaMigrationsParams = {
  readonly connectionString: string
}

export async function readNotificationRollbackSql(): Promise<string> {
  return readFile(NOTIFICATION_ROLLBACK_FILE, 'utf8')
}

export async function runNotificationSchemaMigrations({
  connectionString,
}: RunNotificationSchemaMigrationsParams): Promise<void> {
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
    await runNotificationMigrations({
      db: provider.db as never,
      migrate: migrate as never,
    })
  } finally {
    await provider.close()
  }
}
