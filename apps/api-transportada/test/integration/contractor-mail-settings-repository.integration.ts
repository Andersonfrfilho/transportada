/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T008: a metade transacional do repositório (upsert + auditoria, na mesma transação) só
 * se prova contra um Postgres de verdade — um fake em memória não confere que `onConflictDoUpdate`
 * preserva `id`/`webhook_id` e incrementa `version`, nem que a linha de `audit_logs` nasce (ou não
 * nasce) junto com a de `contractor_mail_settings`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { DrizzleContractorMailRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  contractorMailMessages,
  contractorMailThreads,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const SECRET_ENVELOPE_V1 = {
  algorithm: 'A256GCM',
  ciphertext: 'c3ludGhldGljLWNpcGhlcnRleHQ',
  keyId: 'test-v1',
  nonce: 'c3ludGhldGljLW5vbmNl',
  version: 1,
}
const SECRET_ENVELOPE_V2 = { ...SECRET_ENVELOPE_V1, ciphertext: 'c2Vjb25kLXZlcnNpb24' }

describe('contractor mail settings repository integration (spec 143, T008)', () => {
  testWithPostgres(
    'creates the row and its audit together, then updates in place without changing id or webhook id',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, userId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)
        const settingsId = crypto.randomUUID()

        const created = await repository.saveSettings({
          audit: {
            action: 'contractor-mail.settings.saved',
            actorUserId: userId,
            afterSnapshot: { changedFields: ['senderAddress', 'senderName', 'replyDomain'] },
            beforeSnapshot: null,
            companyId,
            correlationId: 'contractor-mail-integration-0001',
            entityId: settingsId,
          },
          companyId,
          replyDomain: 'resposta.fernandes-transportadora.com.br',
          secretEnvelope: SECRET_ENVELOPE_V1,
          senderAddress: 'ocorrencias@fernandes-transportadora.com.br',
          senderName: 'Fernandes Transportadora',
          settingsId,
        })

        expect(created.id).toBe(settingsId)
        expect(created.version).toBe(1n)
        expect(created.webhookId).toMatch(/^[0-9a-f-]{36}$/u)

        const updated = await repository.saveSettings({
          audit: {
            action: 'contractor-mail.settings.saved',
            actorUserId: userId,
            afterSnapshot: { changedFields: ['senderName'] },
            beforeSnapshot: { id: created.id, version: '1' },
            companyId,
            correlationId: 'contractor-mail-integration-0002',
            entityId: settingsId,
          },
          companyId,
          replyDomain: created.replyDomain,
          secretEnvelope: SECRET_ENVELOPE_V2,
          senderAddress: created.senderAddress,
          senderName: 'Fernandes Transportes Ltda',
          settingsId,
        })

        expect(updated.id).toBe(created.id)
        expect(updated.webhookId).toBe(created.webhookId)
        expect(updated.version).toBe(2n)
        expect(updated.senderName).toBe('Fernandes Transportes Ltda')
        expect(updated.secretEnvelope).toEqual(SECRET_ENVELOPE_V2)

        const audits = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.companyId, companyId))
        expect(audits).toHaveLength(2)
        expect(new Set(audits.map((row) => row.entityId))).toEqual(new Set([settingsId]))
        for (const audit of audits) {
          expect(JSON.stringify(audit.afterSnapshot)).not.toContain('ciphertext')
        }

        const found = await repository.findSettings({ companyId })
        expect(found).toEqual(updated)
        const foundByWebhookId = await repository.findSettingsByWebhookId({
          webhookId: created.webhookId,
        })
        expect(foundByWebhookId).toEqual(updated)
      })
    },
    30_000,
  )

  testWithPostgres(
    'keeps settings isolated per company',
    async () => {
      await withDisposableDatabase(async (database) => {
        const first = await seedTenant(database)
        const second = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)

        await repository.saveSettings(
          buildSaveInput({ companyId: first.companyId, userId: first.userId }),
        )

        expect(await repository.findSettings({ companyId: second.companyId })).toBeUndefined()
      })
    },
    30_000,
  )

  testWithPostgres(
    'reads the setup_test thread state once T009/T010 have written it, and undefined before that',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)

        expect(await repository.findSetupTestStatus({ companyId })).toBeUndefined()

        const [thread] = await database.db
          .insert(contractorMailThreads)
          .values({
            companyId,
            contractorId: null,
            replyTokenHash: 'a'.repeat(64),
            subjectId: crypto.randomUUID(),
            subjectType: 'setup_test',
          })
          .returning({ id: contractorMailThreads.id })
        if (thread === undefined) throw new Error('thread was not inserted')

        await database.db.insert(contractorMailMessages).values([
          {
            bodyText: 'E-mail de teste da configuração.',
            companyId,
            deliveryStatus: 'sent',
            direction: 'outbound',
            fromAddress: 'ocorrencias@fernandes-transportadora.com.br',
            threadId: thread.id,
          },
          {
            bodyText: 'Recebi o teste.',
            companyId,
            dkimResult: 'aligned',
            direction: 'inbound',
            fromAddress: 'admin@fernandes-transportadora.com.br',
            threadId: thread.id,
          },
        ])

        expect(await repository.findSetupTestStatus({ companyId })).toEqual({
          dkimResult: 'aligned',
          hasInboundReply: true,
          hasOutboundSent: true,
        })
      })
    },
    30_000,
  )
})

function buildSaveInput(input: { readonly companyId: string; readonly userId: string }) {
  const settingsId = crypto.randomUUID()
  return {
    audit: {
      action: 'contractor-mail.settings.saved',
      actorUserId: input.userId,
      afterSnapshot: { changedFields: ['senderAddress', 'senderName', 'replyDomain'] },
      beforeSnapshot: null,
      companyId: input.companyId,
      correlationId: crypto.randomUUID(),
      entityId: settingsId,
    },
    companyId: input.companyId,
    replyDomain: 'resposta.fernandes-transportadora.com.br',
    secretEnvelope: SECRET_ENVELOPE_V1,
    senderAddress: 'ocorrencias@fernandes-transportadora.com.br',
    senderName: 'Fernandes Transportadora',
    settingsId,
  }
}

async function seedTenant(
  database: TestDatabase,
): Promise<{ readonly companyId: string; readonly userId: string }> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  return { companyId, userId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_cmail_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
