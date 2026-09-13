/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T008: a metade transacional do repositório (upsert + auditoria, na mesma transação) só
 * se prova contra um Postgres de verdade — um fake em memória não confere que a corrida de
 * criação/atualização de fato serializa no banco, nem que a linha de `audit_logs` nasce (ou não
 * nasce) junto com a de `contractor_mail_settings`.
 *
 * Revisão do `architect`: dois `PUT` concorrentes não podem mais os dois "vencer" com um
 * `onConflictDoUpdate` cego — o perdedor gravava o corpo dele por cima da linha do vencedor,
 * inclusive o envelope selado com o `settingsId` **dele**, que nunca mais abria (o `id` da linha
 * continuava sendo o do vencedor). Os dois testes de corrida abaixo prendem exatamente isso: o
 * perdedor recebe `409` e nada dele é persistido, e o vencedor abre com o próprio segredo.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createSecretEnvelopeProvider, type SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { eq } from 'drizzle-orm'

import { createContractorMailCredentialSecretService } from '../../src/contractor-mail/application/contractor-mail-credential-secret.service.js'
import { ContractorMailSettingsVersionConflictError } from '../../src/contractor-mail/domain/contractor-mail.error.js'
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

const secretService = createContractorMailCredentialSecretService({
  envelopeProvider: createSecretEnvelopeProvider({
    activeKeyId: 'test-v1',
    keys: { 'test-v1': Uint8Array.from({ length: 32 }, (_value, index) => index + 1) },
  }),
})

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
          expectedVersion: undefined,
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
          expectedVersion: created.version.toString(),
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
          expect(audit.permission).toBe('settings.manage')
          expect(audit.targetType).toBe('contractor_mail_settings')
          expect(audit.targetId).toBe(settingsId)
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

  /**
   * A corrida do item 1 da revisão: duas requisições acreditam, ao mesmo tempo, que são a
   * **primeira** configuração da empresa (`expectedVersion` ausente nas duas). Só uma pode vencer —
   * a outra tem de ser `409`, e nunca uma segunda linha, nem a dela sobrepondo a da vencedora.
   */
  testWithPostgres(
    'two concurrent first-time creations: the loser gets a version conflict, and the winner opens with its own secret',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, userId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)
        const settingsIdA = crypto.randomUUID()
        const settingsIdB = crypto.randomUUID()
        const envelopeA = await secretService.encrypt({
          apiKey: 're_first_racer',
          companyId,
          settingsId: settingsIdA,
          webhookSigningSecret: 'whsec_first_racer',
        })
        const envelopeB = await secretService.encrypt({
          apiKey: 're_second_racer',
          companyId,
          settingsId: settingsIdB,
          webhookSigningSecret: 'whsec_second_racer',
        })

        const outcomes = await Promise.allSettled([
          repository.saveSettings(
            buildCreateInput({ companyId, envelope: envelopeA, settingsId: settingsIdA, userId }),
          ),
          repository.saveSettings(
            buildCreateInput({ companyId, envelope: envelopeB, settingsId: settingsIdB, userId }),
          ),
        ])

        const fulfilled = outcomes.filter(
          (
            outcome,
          ): outcome is PromiseFulfilledResult<
            Awaited<ReturnType<typeof repository.saveSettings>>
          > => outcome.status === 'fulfilled',
        )
        const rejected = outcomes.filter(
          (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
        )
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0]?.reason).toBeInstanceOf(ContractorMailSettingsVersionConflictError)

        const winner = fulfilled[0]?.value
        if (winner === undefined) throw new Error('no winner was returned')
        const winnerIsFirst = winner.id === settingsIdA
        const winnerSecret = await secretService.decrypt({
          companyId,
          envelope: winner.secretEnvelope as SecretEnvelopeV1,
          settingsId: winner.id,
        })
        expect(winnerSecret).toEqual(
          winnerIsFirst
            ? { apiKey: 're_first_racer', webhookSigningSecret: 'whsec_first_racer' }
            : { apiKey: 're_second_racer', webhookSigningSecret: 'whsec_second_racer' },
        )

        // A escrita perdedora nunca chega à auditoria — a transação inteira dela é desfeita.
        const audits = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.companyId, companyId))
        expect(audits).toHaveLength(1)
        expect(audits[0]?.entityId).toBe(winner.id)

        const persisted = await repository.findSettings({ companyId })
        expect(persisted).toEqual(winner)
      })
    },
    30_000,
  )

  /**
   * A metade "atualização" do item 2 da revisão: uma versão velha nunca pode vencer, e o segredo já
   * selado da versão atual sobrevive intacto — a escrita rejeitada não grava nada.
   */
  testWithPostgres(
    'an update with a stale expectedVersion is rejected, and the current secret survives untouched',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, userId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)
        const settingsId = crypto.randomUUID()
        const originalEnvelope = await secretService.encrypt({
          apiKey: 're_original',
          companyId,
          settingsId,
          webhookSigningSecret: 'whsec_original',
        })

        const created = await repository.saveSettings(
          buildCreateInput({ companyId, envelope: originalEnvelope, settingsId, userId }),
        )
        expect(created.version).toBe(1n)

        const staleEnvelope = await secretService.encrypt({
          apiKey: 're_stale_writer',
          companyId,
          settingsId,
          webhookSigningSecret: 'whsec_stale_writer',
        })

        await expect(
          repository.saveSettings({
            audit: {
              action: 'contractor-mail.settings.saved',
              actorUserId: userId,
              afterSnapshot: { changedFields: ['senderName'] },
              beforeSnapshot: { id: settingsId, version: '0' },
              companyId,
              correlationId: 'contractor-mail-integration-stale',
              entityId: settingsId,
            },
            companyId,
            expectedVersion: '0',
            replyDomain: created.replyDomain,
            secretEnvelope: staleEnvelope,
            senderAddress: created.senderAddress,
            senderName: 'A stale writer should never land',
            settingsId,
          }),
        ).rejects.toBeInstanceOf(ContractorMailSettingsVersionConflictError)

        const current = await repository.findSettings({ companyId })
        expect(current?.version).toBe(1n)
        expect(current?.senderName).toBe('Fernandes Transportadora')
        if (current === undefined) throw new Error('settings vanished')
        const stillOriginal = await secretService.decrypt({
          companyId,
          envelope: current.secretEnvelope as SecretEnvelopeV1,
          settingsId,
        })
        expect(stillOriginal).toEqual({
          apiKey: 're_original',
          webhookSigningSecret: 'whsec_original',
        })

        const audits = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.companyId, companyId))
        expect(audits).toHaveLength(1)
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
          buildCreateInput({
            companyId: first.companyId,
            envelope: SECRET_ENVELOPE_V1,
            settingsId: crypto.randomUUID(),
            userId: first.userId,
          }),
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

function buildCreateInput(input: {
  readonly companyId: string
  readonly envelope: unknown
  readonly settingsId: string
  readonly userId: string
}) {
  return {
    audit: {
      action: 'contractor-mail.settings.saved',
      actorUserId: input.userId,
      afterSnapshot: { changedFields: ['senderAddress', 'senderName', 'replyDomain'] },
      beforeSnapshot: null,
      companyId: input.companyId,
      correlationId: crypto.randomUUID(),
      entityId: input.settingsId,
    },
    companyId: input.companyId,
    expectedVersion: undefined,
    replyDomain: 'resposta.fernandes-transportadora.com.br',
    secretEnvelope: input.envelope,
    senderAddress: 'ocorrencias@fernandes-transportadora.com.br',
    senderName: 'Fernandes Transportadora',
    settingsId: input.settingsId,
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
