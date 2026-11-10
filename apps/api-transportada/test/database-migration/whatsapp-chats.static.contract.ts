/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T2: a caixa de conversas do WhatsApp entra aditiva — duas tabelas novas e o prazo de devolução por empresa
 * com padrão — e não toca a conversa da ocorrência (RF8). O rollback recusa rodar com histórico gravado.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_whatsapp_chats'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('whatsapp_chats migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('a caixa de conversas do WhatsApp entra aditiva (spec 319 T2)', () => {
  test('duas tabelas novas e o prazo com padrão de 30 min, sem UPDATE nem DROP', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('CREATE TABLE "whatsapp_chats"')
    expect(text).toContain('CREATE TABLE "whatsapp_chat_messages"')
    expect(text).toContain(
      'ALTER TABLE "whatsapp_evolution_settings" ADD COLUMN "chat_takeover_timeout_seconds" integer DEFAULT 1800 NOT NULL;',
    )
    expect(text).not.toMatch(/\bUPDATE\b(?! CASCADE)/u)
    expect(text).not.toMatch(/\bDROP\b/u)
  })

  test('RF1: um chat por empresa e JID, sem @lid, e o assumido sempre com dono e prazo', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      'CONSTRAINT "whatsapp_chats_company_jid_unique" UNIQUE("company_id","chat_jid")',
    )
    expect(text).toContain(`"chat_jid" ~ '^[0-9]{8,15}@s\\.whatsapp\\.net$'`)
    expect(text).not.toContain('@lid')
    expect(text).toContain('CONSTRAINT "whatsapp_chats_takeover_check"')
    expect(text).toContain(
      `CREATE INDEX "whatsapp_chats_operator_expires_idx" ON "whatsapp_chats" ("expires_at") WHERE "state" = 'operator';`,
    )
  })

  test('T1: o id do provedor é único por empresa, para o eco e a reentrega não duplicarem', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      `CREATE UNIQUE INDEX "whatsapp_chat_messages_company_provider_unique" ON "whatsapp_chat_messages" ("company_id","provider_message_id") WHERE "provider_message_id" is not null;`,
    )
  })

  test('RF8: nada na migration toca a conversa da ocorrência', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).not.toMatch(/occurrence/iu)
  })

  test('o rollback recusa histórico gravado e só desfaz o que a T2 criou', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('refusing to drop the spec 319 T2 tables')
    expect(text).toContain('refusing to drop the spec 319 T2 column')
    expect(text).toContain('DROP TABLE "whatsapp_chat_messages";')
    expect(text).toContain('DROP TABLE "whatsapp_chats";')
    expect(text).toContain('DROP COLUMN "chat_takeover_timeout_seconds";')
    expect(text.indexOf('DROP TABLE "whatsapp_chat_messages";')).toBeLessThan(
      text.indexOf('DROP TABLE "whatsapp_chats";'),
    )
    expect(text).not.toMatch(/occurrence/iu)
  })
})
