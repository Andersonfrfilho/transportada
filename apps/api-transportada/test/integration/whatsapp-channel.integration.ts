/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 062 T003 — a credencial contra Postgres. Duas coisas que só o banco prova: que atualizar sem
 * token **não apaga** o que está selado (é `onConflictDoUpdate` com o campo ausente, não um `set`
 * com `undefined` que o driver poderia traduzir para nulo), e que o `tokenConfigured` da tela sai da
 * existência da chave no envelope — não de a coluna ser nula, que ela nunca é.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, whatsappChannels } from '../../src/database/database.schema.js'
import { DrizzleWhatsAppChannelRepository } from '../../src/whatsapp/infrastructure/drizzle-whatsapp-channel.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const ENVELOPE = {
  algorithm: 'A256GCM' as const,
  ciphertext: 'cipher-original',
  keyId: 'key-1',
  nonce: 'nonce-1',
  version: 1 as const,
}

describe('a credencial do WhatsApp contra Postgres (spec 062 T003)', () => {
  testWithPostgres('atualizar sem token preserva o que está selado', async () => {
    await withSharedDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: companyId, status: 'active' })
      const repository = new DrizzleWhatsAppChannelRepository(database.db)

      const created = await repository.save({
        companyId,
        displayPhoneNumber: '5516999998888',
        phoneNumberId: '123456789012345',
        secretEnvelope: ENVELOPE,
        status: 'active',
        wabaId: '987654321098765',
      })
      expect(created.tokenConfigured).toBe(true)

      const updated = await repository.save({
        companyId,
        displayPhoneNumber: '',
        phoneNumberId: '123456789012399',
        /** O caso de uso manda `undefined` quando o operador não reenvia o token. */
        secretEnvelope: undefined,
        status: 'disabled',
        wabaId: '987654321098765',
      })

      expect(updated.phoneNumberId).toBe('123456789012399')
      expect(updated.status).toBe('disabled')
      expect(updated.tokenConfigured).toBe(true)
      /** A versão sobe a cada gravação: é o que a tela usa para detectar edição concorrente. */
      expect(updated.version).toBe('2')

      const [row] = await database.db
        .select({ envelope: whatsappChannels.secretEnvelope })
        .from(whatsappChannels)
        .where(eq(whatsappChannels.companyId, companyId))
      expect((row?.envelope as { ciphertext: string }).ciphertext).toBe('cipher-original')

      /** E o segredo continua fora da leitura: `find` nunca traz o envelope. */
      const found = await repository.find({ companyId })
      expect(JSON.stringify(found)).not.toContain('cipher-original')
    })
  })

  /**
   * `tokenConfigured` não pode sair de `is not null`: a coluna é `not null` e o canal sem token grava
   * `{}` — o predicado responderia "tem token" para um canal que não tem.
   */
  testWithPostgres('canal gravado sem envelope não se diz configurado', async () => {
    await withSharedDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: companyId, status: 'active' })
      const repository = new DrizzleWhatsAppChannelRepository(database.db)

      const created = await repository.save({
        companyId,
        displayPhoneNumber: '',
        phoneNumberId: '223456789012345',
        secretEnvelope: undefined,
        status: 'active',
        wabaId: '987654321098765',
      })

      expect(created.tokenConfigured).toBe(false)
      /**
       * ⚠️ `findSecret` **acha a linha mesmo assim** — ela existe e está ativa. Quem recusa o
       * envelope vazio é o serviço de segredo (T001), com `WHATSAPP_CHANNEL_UNAVAILABLE`, e não este
       * repositório: separar as duas coisas é o que impede o driver de tratar "sem canal" e "canal
       * quebrado" como a mesma resposta.
       */
      expect(await repository.findSecret({ companyId })).not.toBeNull()
    })
  })

  /** Canal desligado não envia — desligar é o botão que o operador tem para parar o fluxo. */
  testWithPostgres('canal desligado não é oferecido ao envio', async () => {
    await withSharedDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: companyId, status: 'active' })
      const repository = new DrizzleWhatsAppChannelRepository(database.db)

      await repository.save({
        companyId,
        displayPhoneNumber: '',
        phoneNumberId: '323456789012345',
        secretEnvelope: ENVELOPE,
        status: 'disabled',
        wabaId: '987654321098765',
      })

      expect(await repository.findSecret({ companyId })).toBeNull()
      /** Mas continua visível na tela de configuração: desligado não é apagado. */
      expect((await repository.find({ companyId }))?.status).toBe('disabled')
    })
  })
})

let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_062_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${name}"`)
    await runDatabaseMigrations({ connectionString: url.toString() })
    shared = { database: createDrizzleProvider({ connection: url.toString() }), name }
  } finally {
    await admin.close({ timeout: 0 })
  }
})

afterAll(async () => {
  if (databaseUrl === undefined || shared === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    await shared.database.close()
    await admin.unsafe(`drop database if exists "${shared.name}" with (force)`)
  } finally {
    await admin.close({ timeout: 0 })
  }
})

async function withSharedDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (shared === undefined) throw new Error('A PostgreSQL test URL is required')
  await operation(shared.database)
}
