/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { runMetaWhatsAppMigrations } from '@adatechnology/meta-whatsapp-module'

export const META_WHATSAPP_SCHEMA = 'meta_whatsapp'

/**
 * Mesmo arranjo do schema de notificações: as migrations viajam dentro do pacote, então não existe
 * diretório nosso em `drizzle/` para o rollback ficar ao lado — e acrescentar um quebraria o
 * contrato que fixa a lista de migrations da aplicação.
 */
export const META_WHATSAPP_ROLLBACK_FILE = new URL(
  '../../drizzle-meta-whatsapp/rollback.sql',
  import.meta.url,
).pathname

type RunMetaWhatsAppSchemaMigrationsParams = {
  readonly connectionString: string
}

export async function readMetaWhatsAppRollbackSql(): Promise<string> {
  return readFile(META_WHATSAPP_ROLLBACK_FILE, 'utf8')
}

export async function runMetaWhatsAppSchemaMigrations({
  connectionString,
}: RunMetaWhatsAppSchemaMigrationsParams): Promise<void> {
  if (connectionString.length === 0) {
    throw new Error('Database connection string must not be empty')
  }

  const provider = createDrizzleProvider({
    connection: { adapter: 'postgres', max: 1, url: connectionString },
  })

  try {
    /**
     * ⚠️ Assinatura diferente da do `notification-module`: a versão publicada deste pacote recebe a
     * conexão direto e escolhe o migrator dela, em vez de receber o `migrate` por injeção. Não é
     * lugar de uniformizar — mudar isso é changeset no pacote.
     */
    await runMetaWhatsAppMigrations(provider.db as never)
  } finally {
    await provider.close()
  }
}
