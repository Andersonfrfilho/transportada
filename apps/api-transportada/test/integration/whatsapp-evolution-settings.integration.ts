/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T4 — a configuração do Evolution contra Postgres. O que só o banco prova: regravar uma
 * configuração `active` com o aviso já lido não quebra no CHECK (o Postgres confere a linha proposta
 * do INSERT antes do conflito), atualizar sem chave mantém o envelope, e o resumo não leva a chave.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  identityUsers,
  userCompanyMemberships,
  whatsappEvolutionSettings,
} from '../../src/database/database.schema.js'
import type { WhatsAppEvolutionSaveRecord } from '../../src/whatsapp/application/whatsapp-evolution.port.js'
import { DrizzleWhatsAppEvolutionRepository } from '../../src/whatsapp/infrastructure/drizzle-whatsapp-evolution.repository.js'

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

function record(
  input: Pick<WhatsAppEvolutionSaveRecord, 'companyId' | 'settingsId'> &
    Partial<WhatsAppEvolutionSaveRecord> & { readonly actorUserId: string },
): WhatsAppEvolutionSaveRecord {
  return {
    audit: {
      action: 'whatsapp-evolution.settings.saved',
      actorUserId: input.actorUserId,
      afterSnapshot: { changedFields: [] },
      beforeSnapshot: null,
      correlationId: 'corr-1',
    },
    baseUrl: 'https://evolution.exemplo.com',
    dailyCap: 50,
    defaultProvider: 'meta',
    instanceName: 'transportada',
    minIntervalSeconds: 15,
    resetConnection: false,
    riskAcknowledgedBy: undefined,
    secretEnvelope: undefined,
    status: 'disabled',
    ...input,
  }
}

describe('a configuração do Evolution contra Postgres (spec 281 T4)', () => {
  testWithPostgres(
    'regravar uma configuração ligada, com o aviso já lido, não quebra e mantém a chave',
    async () => {
      await withSharedDatabase(async (database) => {
        const { companyId, userId } = await seedCompany(database)
        const repository = new DrizzleWhatsAppEvolutionRepository(database.db)
        const settingsId = crypto.randomUUID()

        const created = await repository.save(
          record({
            actorUserId: userId,
            companyId,
            riskAcknowledgedBy: userId,
            secretEnvelope: ENVELOPE,
            settingsId,
            status: 'active',
          }),
        )
        expect(created.status).toBe('active')
        expect(created.apiKeyConfigured).toBe(true)
        expect(created.riskAcknowledgedAt).not.toBeNull()

        // Segundo save: o aviso já foi aceito (`riskAcknowledgedBy` ausente) e o dono só muda o teto.
        const updated = await repository.save(
          record({ actorUserId: userId, companyId, dailyCap: 80, settingsId, status: 'active' }),
        )

        expect(updated.dailyCap).toBe(80)
        expect(updated.status).toBe('active')
        expect(updated.version).toBe('2')
        expect(updated.apiKeyConfigured).toBe(true)
        expect(updated.riskAcknowledgedAt).toBe(created.riskAcknowledgedAt)

        const [stored] = await database.db
          .select({ envelope: whatsappEvolutionSettings.secretEnvelope })
          .from(whatsappEvolutionSettings)
          .where(eq(whatsappEvolutionSettings.companyId, companyId))
        expect(stored?.envelope).toEqual(ENVELOPE)
        expect(JSON.stringify(updated)).not.toContain('cipher-original')

        const audits = await database.db
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(eq(auditLogs.companyId, companyId))
        expect(audits).toHaveLength(2)
      })
    },
  )

  testWithPostgres('o banco recusa ligar sem o aviso de risco', async () => {
    await withSharedDatabase(async (database) => {
      const { companyId, userId } = await seedCompany(database)
      const repository = new DrizzleWhatsAppEvolutionRepository(database.db)

      await expect(
        repository.save(
          record({
            actorUserId: userId,
            companyId,
            secretEnvelope: ENVELOPE,
            settingsId: crypto.randomUUID(),
            status: 'active',
          }),
        ),
      ).rejects.toThrow()
    })
  })

  testWithPostgres(
    'mudar o endereço zera o estado da conexão e o estado só audita ao mudar',
    async () => {
      await withSharedDatabase(async (database) => {
        const { companyId, userId } = await seedCompany(database)
        const repository = new DrizzleWhatsAppEvolutionRepository(database.db)
        const settingsId = crypto.randomUUID()
        await repository.save(
          record({ actorUserId: userId, companyId, secretEnvelope: ENVELOPE, settingsId }),
        )

        const audit = {
          action: 'whatsapp-evolution.connection.changed',
          actorUserId: userId,
          correlationId: 'c',
        }
        await repository.recordConnection({ audit, companyId, state: 'open' })
        await repository.recordConnection({ audit, companyId, state: 'open' })
        const connected = await repository.find({ companyId })
        expect(connected?.connectionState).toBe('open')
        expect(connected?.connectionCheckedAt).not.toBeNull()

        const moved = await repository.save(
          record({
            actorUserId: userId,
            baseUrl: 'https://outro.exemplo.com',
            companyId,
            resetConnection: true,
            settingsId,
          }),
        )
        expect(moved.connectionState).toBe('unknown')
        expect(moved.connectionCheckedAt).toBeNull()

        const changes = await database.db
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(eq(auditLogs.action, 'whatsapp-evolution.connection.changed'))
        expect(changes.length).toBeGreaterThanOrEqual(1)
        expect(changes.filter(() => true).length).toBeLessThanOrEqual(2)
      })
    },
  )

  testWithPostgres('a leitura de outra empresa não enxerga a configuração', async () => {
    await withSharedDatabase(async (database) => {
      const first = await seedCompany(database)
      const second = await seedCompany(database)
      const repository = new DrizzleWhatsAppEvolutionRepository(database.db)
      await repository.save(
        record({
          actorUserId: first.userId,
          companyId: first.companyId,
          secretEnvelope: ENVELOPE,
          settingsId: crypto.randomUUID(),
        }),
      )

      expect(await repository.find({ companyId: second.companyId })).toBeNull()
      expect(await repository.findCredential({ companyId: second.companyId })).toBeNull()
    })
  })
})

async function seedCompany(database: TestDatabase) {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })

  return { companyId, userId }
}

let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_281_${crypto.randomUUID().replaceAll('-', '')}`
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
}, 60_000)

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
