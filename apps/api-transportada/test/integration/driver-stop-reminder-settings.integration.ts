/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T4.2 contra o Postgres: sem linha vale o padrão desligado e nada é gravado; o PUT cria a linha e uma
 * trilha de auditoria; o mesmo valor não audita nem mexe em `updated_at`; outra empresa não lê nem escreve.
 */
import { describe, expect, test } from 'bun:test'
import { asc, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { companyDriverReminderSettings } from '../../src/database/company-driver-reminder-settings.schema.js'
import {
  auditLogs,
  companies,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS,
  DRIVER_STOP_REMINDER_SETTINGS_AUDIT,
} from '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js'
import { DrizzleDriverStopReminderSettingsRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder-settings.repository.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>
type Tenant = { readonly companyId: string; readonly userId: string }

const IP_ADDRESS = '203.0.113.7'
const CHANGED = {
  dwellMinutes: 20,
  enabled: true,
  graceMinMinutes: 15,
  gracePercent: 40,
  intervalMinutes: 45,
  maxAttempts: 2,
  operatingHours: [
    { end: '12:00', start: '07:00', weekday: 1 },
    { end: '18:00', start: '13:00', weekday: 1 },
  ],
}

function saveParams(tenant: Tenant, values: typeof CHANGED, correlationId: string) {
  return {
    ...values,
    companyId: tenant.companyId,
    correlationId,
    ipAddress: IP_ADDRESS,
    userId: tenant.userId,
  }
}

const readRows = (database: TestDatabase, companyId: string) =>
  database.db
    .select()
    .from(companyDriverReminderSettings)
    .where(eq(companyDriverReminderSettings.companyId, companyId))

const readAudits = (database: TestDatabase, companyId: string) =>
  database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.companyId, companyId))
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))

describe('driver stop reminder settings integration (spec 299 T4.2)', () => {
  testWithPostgres(
    'without a row the answer is the disabled defaults and nothing is stored',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleDriverStopReminderSettingsRepository(database.db)

        expect(await repository.find({ companyId: tenant.companyId })).toEqual({
          settings: DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS,
          updatedAt: null,
        })
        expect(DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS.enabled).toBe(false)
        expect(await readRows(database, tenant.companyId)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'the first save creates the row and one audit entry; find reads it back',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleDriverStopReminderSettingsRepository(database.db)

        const saved = await repository.save(saveParams(tenant, CHANGED, 'correlation-1'))
        expect(saved.settings).toEqual(CHANGED)
        expect(saved.updatedAt).toBeInstanceOf(Date)
        expect((await repository.find({ companyId: tenant.companyId })).settings).toEqual(CHANGED)
        expect(await readRows(database, tenant.companyId)).toHaveLength(1)

        const audits = await readAudits(database, tenant.companyId)
        expect(audits).toHaveLength(1)
        expect(audits[0]).toMatchObject({
          action: DRIVER_STOP_REMINDER_SETTINGS_AUDIT.ACTION,
          actorUserId: tenant.userId,
          afterSnapshot: CHANGED,
          beforeSnapshot: DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS,
          correlationId: 'correlation-1',
          entityType: DRIVER_STOP_REMINDER_SETTINGS_AUDIT.TARGET,
          metadata: { ipAddress: IP_ADDRESS },
          permission: 'settings.manage',
        })
      })
    },
  )

  testWithPostgres(
    'saving the same values neither audits nor touches updated_at; a change does both',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database)
        const repository = new DrizzleDriverStopReminderSettingsRepository(database.db)
        const first = await repository.save(saveParams(tenant, CHANGED, 'correlation-1'))
        const again = await repository.save(saveParams(tenant, CHANGED, 'correlation-2'))

        expect(again.updatedAt).toEqual(first.updatedAt)
        expect(await readAudits(database, tenant.companyId)).toHaveLength(1)

        const next = { ...CHANGED, enabled: false, maxAttempts: 4, operatingHours: [] }
        await repository.save(saveParams(tenant, next, 'correlation-3'))
        const audits = await readAudits(database, tenant.companyId)
        expect(audits).toHaveLength(2)
        expect(audits[1]).toMatchObject({ afterSnapshot: next, beforeSnapshot: CHANGED })
        expect(await readRows(database, tenant.companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres('one company never reads or writes the settings of another', async () => {
    await withDisposableDatabase(async (database) => {
      const tenantA = await seedTenant(database)
      const tenantB = await seedTenant(database)
      const repository = new DrizzleDriverStopReminderSettingsRepository(database.db)
      await repository.save(saveParams(tenantA, CHANGED, 'correlation-a'))

      expect(await repository.find({ companyId: tenantB.companyId })).toEqual({
        settings: DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS,
        updatedAt: null,
      })
      await repository.save(saveParams(tenantB, { ...CHANGED, maxAttempts: 5 }, 'correlation-b'))
      expect((await repository.find({ companyId: tenantA.companyId })).settings.maxAttempts).toBe(2)
      expect(await readAudits(database, tenantA.companyId)).toHaveLength(1)
      expect(await readAudits(database, tenantB.companyId)).toHaveLength(1)
    })
  })

  testWithPostgres('two concurrent first saves leave one row and one audit entry', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database)
      const repository = new DrizzleDriverStopReminderSettingsRepository(database.db)
      await Promise.all([
        repository.save(saveParams(tenant, CHANGED, 'correlation-1')),
        repository.save(saveParams(tenant, CHANGED, 'correlation-2')),
      ])
      expect(await readRows(database, tenant.companyId)).toHaveLength(1)
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
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
    namePrefix: 'transportada_reminder_settings',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 },
        url: connectionString,
      }),
    operation,
  })
}
