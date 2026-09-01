/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { runUserMigrations } from '@adatechnology/user-module'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

export const USER_SCHEMA = 'user'

/**
 * As migrations do módulo viajam dentro do pacote, então não existe diretório nosso em `drizzle/`
 * para o rollback ficar ao lado — e acrescentar um quebraria o contrato que fixa a lista de
 * migrations da aplicação. Ele mora ao lado do runner, num diretório irmão (mesmo padrão do
 * schema de notificações).
 */
export const USER_ROLLBACK_FILE = new URL('../../drizzle-user/rollback.sql', import.meta.url)
  .pathname

export async function readUserRollbackSql(): Promise<string> {
  return readFile(USER_ROLLBACK_FILE, 'utf8')
}

type RunUserSchemaMigrationsParams = {
  readonly connectionString: string
}

export async function runUserSchemaMigrations({
  connectionString,
}: RunUserSchemaMigrationsParams): Promise<void> {
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
    await runUserMigrations({
      db: provider.db as never,
      migrate: migrate as never,
    })
  } finally {
    await provider.close()
  }
}
