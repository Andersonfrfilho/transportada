/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.4 (§5.1, D9): o que só um Postgres de verdade prova na configuração da transcrição.
 * Sem linha vale ligada; o PUT cria a linha, o mesmo valor não audita nem mexe em `updated_at`,
 * religar regrava `enabled_since`, duas escritas concorrentes não duplicam linha nem auditoria, e
 * outra empresa não lê nem escreve a configuração.
 */
import { describe, expect, test } from 'bun:test'
import { asc, eq } from 'drizzle-orm'

import { DrizzleAudioTranscriptionSettingsRepository } from '../../src/companies/infrastructure/drizzle-audio-transcription-settings.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import {
  auditLogs,
  companies,
  companyAudioTranscriptionSettings,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>
type Tenant = { readonly companyId: string; readonly userId: string }

const IP_ADDRESS = '203.0.113.7'
const CHANGED_ACTION = 'company-audio-transcription.changed'

function actorOf(tenant: Tenant, correlationId: string) {
  return {
    companyId: tenant.companyId,
    correlationId,
    ipAddress: IP_ADDRESS,
    userId: tenant.userId,
  }
}

async function readRows(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(companyAudioTranscriptionSettings)
    .where(eq(companyAudioTranscriptionSettings.companyId, companyId))
}

async function readAudits(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.companyId, companyId))
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
}

describe('audio transcription settings repository integration (spec 264 T2.4)', () => {
  testWithPostgres('without a row the answer is enabled and nothing is stored', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)

      expect(await repository.find({ companyId: tenant.companyId })).toEqual({
        enabled: true,
        updatedAt: null,
      })
      expect(await readRows(database, tenant.companyId)).toEqual([])
    })
  })

  testWithPostgres(
    'the first PUT creates the row with the database clock and one audit entry',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)

        const saved = await repository.save({ ...actorOf(tenant, 'corr-off'), enabled: false })

        const [row] = await readRows(database, tenant.companyId)
        expect(saved).toEqual({ enabled: false, updatedAt: row?.updatedAt ?? null })
        expect(row).toMatchObject({
          enabled: false,
          routineStartedAt: null,
          updatedByUserId: tenant.userId,
        })
        expect(row?.enabledSince.getTime()).toBe(row?.updatedAt.getTime())
        expect(await repository.find({ companyId: tenant.companyId })).toEqual(saved)

        const audits = await readAudits(database, tenant.companyId)
        expect(audits).toHaveLength(1)
        expect(audits[0]).toMatchObject({
          action: CHANGED_ACTION,
          actorUserId: tenant.userId,
          afterSnapshot: { enabled: false },
          beforeSnapshot: { enabled: true },
          companyId: tenant.companyId,
          correlationId: 'corr-off',
          entityId: tenant.companyId,
          entityType: 'company_audio_transcription_settings',
          metadata: { ipAddress: IP_ADDRESS },
          permission: 'settings.manage',
          targetId: tenant.companyId,
          targetType: 'company_audio_transcription_settings',
        })
        expect(Object.keys(audits[0]?.metadata ?? {})).toEqual(['ipAddress'])
      })
    },
  )

  testWithPostgres('the same value neither audits nor touches updated_at', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)

      // sem linha, ligar é o valor atual: nada a gravar
      expect(await repository.save({ ...actorOf(tenant, 'noop-1'), enabled: true })).toEqual({
        enabled: true,
        updatedAt: null,
      })
      expect(await readRows(database, tenant.companyId)).toEqual([])

      await repository.save({ ...actorOf(tenant, 'off'), enabled: false })
      const [before] = await readRows(database, tenant.companyId)
      await Bun.sleep(30)
      await repository.save({ ...actorOf(tenant, 'noop-2'), enabled: false })

      expect(before).toBeDefined()
      expect(await readRows(database, tenant.companyId)).toEqual(before ? [before] : [])
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres(
    're-enabling rewrites enabled_since, disabling does not, and the routine marker stays',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)
        const marker = new Date('2026-01-01T00:00:00.000Z')
        const earlier = new Date('2026-02-01T00:00:00.000Z')
        await database.db.insert(companyAudioTranscriptionSettings).values({
          companyId: tenant.companyId,
          enabledSince: earlier,
          routineStartedAt: marker,
          updatedAt: earlier,
        })

        await repository.save({ ...actorOf(tenant, 'off'), enabled: false })
        const [disabled] = await readRows(database, tenant.companyId)
        expect(disabled?.enabledSince.getTime()).toBe(earlier.getTime())
        expect(disabled?.updatedAt.getTime()).toBeGreaterThan(earlier.getTime())

        await Bun.sleep(30)
        await repository.save({ ...actorOf(tenant, 'on'), enabled: true })
        const [enabled] = await readRows(database, tenant.companyId)
        expect(enabled?.enabled).toBe(true)
        expect(enabled?.enabledSince.getTime()).toBeGreaterThan(disabled?.updatedAt.getTime() ?? 0)
        expect(enabled?.routineStartedAt?.getTime()).toBe(marker.getTime())

        const audits = await readAudits(database, tenant.companyId)
        expect(audits.map((audit) => [audit.beforeSnapshot, audit.afterSnapshot])).toEqual([
          [{ enabled: true }, { enabled: false }],
          [{ enabled: false }, { enabled: true }],
        ])
      })
    },
  )

  testWithPostgres('two concurrent first PUTs leave one row and one audit entry', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)

      const results = await Promise.all([
        repository.save({ ...actorOf(tenant, 'race-1'), enabled: false }),
        repository.save({ ...actorOf(tenant, 'race-2'), enabled: false }),
        repository.save({ ...actorOf(tenant, 'race-3'), enabled: false }),
      ])

      expect(results.every((result) => !result.enabled)).toBe(true)
      expect(await readRows(database, tenant.companyId)).toHaveLength(1)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres('another company neither reads nor writes this configuration', async () => {
    await withDisposableDatabase(async (database) => {
      const tenantA = await seedTenant(database)
      const tenantB = await seedTenant(database)
      const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)

      await repository.save({ ...actorOf(tenantA, 'a-off'), enabled: false })

      expect(await repository.find({ companyId: tenantB.companyId })).toEqual({
        enabled: true,
        updatedAt: null,
      })
      expect(await readRows(database, tenantB.companyId)).toEqual([])
      expect(await readAudits(database, tenantB.companyId)).toEqual([])

      await repository.save({ ...actorOf(tenantB, 'b-off'), enabled: false })
      await repository.save({ ...actorOf(tenantB, 'b-on'), enabled: true })

      expect((await repository.find({ companyId: tenantA.companyId })).enabled).toBe(false)
      expect(await readAudits(database, tenantA.companyId)).toHaveLength(1)
      expect(await readAudits(database, tenantB.companyId)).toHaveLength(2)
    })
  })
})

async function seedTenant(database: TestDatabase): Promise<Tenant> {
  const tenant: Tenant = { companyId: crypto.randomUUID(), userId: crypto.randomUUID() }
  await database.db.insert(companies).values({ id: tenant.companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: tenant.userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId: tenant.companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: tenant.userId,
  })
  return tenant
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_audiotr',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 },
        url: connectionString,
      }),
    operation,
  })
}
