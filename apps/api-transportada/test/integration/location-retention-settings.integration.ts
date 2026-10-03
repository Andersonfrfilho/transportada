/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 239 T1.4 (D4, D5, CA2, CA3, CA5): a metade que só um Postgres de verdade prova. A gravação e
 * a linha de `audit_logs` vivem na mesma transação (falha no audit desfaz a gravação), a carência de
 * 24 h sai das quatro transições, e a contagem de impacto lê só a empresa do contexto, com teto.
 */
import { describe, expect, test } from 'bun:test'
import { asc, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { DrizzleLocationRetentionSettingsRepository } from '../../src/companies/infrastructure/drizzle-location-retention-settings.repository.js'
import {
  LOCATION_RETENTION_IMPACT_CAP,
  LOCATION_RETENTION_IMPACT_KIND,
} from '../../src/companies/domain/location-retention.constant.js'
import { LOCATION_PURGE_GRACE_PERIOD_MS } from '../../src/companies/domain/location-retention.policy.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  companyLocationRetentionSettings,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>

const NOW = new Date('2026-10-03T12:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000
const IP_ADDRESS = '203.0.113.7'
const SAVED_ACTION = 'company-location-retention.saved'
const CLEARED_ACTION = 'company-location-retention.cleared'
const FORBIDDEN_AUDIT_TOKENS = ['latitude', 'longitude', 'accuracy', '-23.55', 'eventId'] as const
const EXPIRED_AT = '2026-05-01T09:00:00.000Z'
const WITHIN_AT = '2026-09-30T09:00:00.000Z'
const SIXTY_DAYS_AT = '2026-08-04T09:00:00.000Z'
const IMPACT_NOW = NOW

type Tenant = {
  readonly companyId: string
  readonly stopId: string
  readonly tripId: string
  readonly tripDocumentId: string
  readonly occurrenceTypeId: string
  readonly userId: string
}

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs)
}

function actorOf(tenant: Tenant, correlationId: string) {
  return {
    companyId: tenant.companyId,
    correlationId,
    ipAddress: IP_ADDRESS,
    userId: tenant.userId,
  }
}

async function readAudits(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.companyId, companyId))
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
}

describe('location retention settings repository integration (spec 239 T1.4)', () => {
  testWithPostgres(
    'enabling opens the 24 h grace, extending keeps it, shortening reopens it, disabling releases it',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database, 'A')
        const repository = new DrizzleLocationRetentionSettingsRepository(database.db)
        expect(await repository.find({ companyId: tenant.companyId })).toBeNull()

        const enabled = await repository.save({
          ...actorOf(tenant, 'corr-enable'),
          affectedEstimate: { capped: false, count: 12 },
          next: { purgeEnabled: true, retentionDays: 90 },
          now: NOW,
        })
        expect(enabled.purgeEffectiveAt?.getTime()).toBe(
          NOW.getTime() + LOCATION_PURGE_GRACE_PERIOD_MS,
        )
        expect(enabled).toMatchObject({ purgeEnabled: true, retentionDays: 90 })

        const [enableAudit] = await readAudits(database, tenant.companyId)
        expect(enableAudit).toMatchObject({
          action: SAVED_ACTION,
          actorUserId: tenant.userId,
          afterSnapshot: {
            purgeEffectiveAt: enabled.purgeEffectiveAt?.toISOString(),
            purgeEnabled: true,
            retentionDays: 90,
          },
          beforeSnapshot: null,
          companyId: tenant.companyId,
          correlationId: 'corr-enable',
          entityId: tenant.companyId,
          entityType: 'company_location_retention_settings',
          metadata: { affectedEstimate: { capped: false, count: 12 }, ipAddress: IP_ADDRESS },
          permission: 'settings.manage',
          targetId: tenant.companyId,
          targetType: 'company_location_retention_settings',
        })

        // alongar com a carência ainda correndo: nem reabre, nem encurta
        const extended = await repository.save({
          ...actorOf(tenant, 'corr-extend'),
          affectedEstimate: { capped: false, count: 0 },
          next: { purgeEnabled: true, retentionDays: 90 },
          now: at(HOUR_MS),
        })
        expect(extended.purgeEffectiveAt?.getTime()).toBe(enabled.purgeEffectiveAt?.getTime())

        const shortened = await repository.save({
          ...actorOf(tenant, 'corr-shorten'),
          affectedEstimate: { capped: false, count: 40 },
          next: { purgeEnabled: true, retentionDays: 30 },
          now: at(2 * HOUR_MS),
        })
        expect(shortened.purgeEffectiveAt?.getTime()).toBe(
          at(2 * HOUR_MS).getTime() + LOCATION_PURGE_GRACE_PERIOD_MS,
        )

        const lengthened = await repository.save({
          ...actorOf(tenant, 'corr-lengthen'),
          affectedEstimate: { capped: false, count: 0 },
          next: { purgeEnabled: true, retentionDays: 60 },
          now: at(3 * HOUR_MS),
        })
        expect(lengthened.purgeEffectiveAt?.getTime()).toBe(shortened.purgeEffectiveAt?.getTime())

        const disabled = await repository.save({
          ...actorOf(tenant, 'corr-disable'),
          affectedEstimate: null,
          next: { purgeEnabled: false, retentionDays: 60 },
          now: at(4 * HOUR_MS),
        })
        expect(disabled).toMatchObject({ purgeEnabled: false })
        expect(disabled.purgeEffectiveAt?.getTime()).toBe(at(4 * HOUR_MS).getTime())

        const audits = await readAudits(database, tenant.companyId)
        expect(audits.map((audit) => audit.correlationId)).toEqual([
          'corr-enable',
          'corr-extend',
          'corr-shorten',
          'corr-lengthen',
          'corr-disable',
        ])
        expect(audits[2]?.beforeSnapshot).toMatchObject({ retentionDays: 90 })
        expect(audits[2]?.afterSnapshot).toMatchObject({ retentionDays: 30 })
        expect(audits[4]?.metadata).toEqual({ affectedEstimate: null, ipAddress: IP_ADDRESS })
        const rows = await database.db.select().from(companyLocationRetentionSettings)
        expect(rows).toHaveLength(1)
        for (const audit of audits) {
          const text = JSON.stringify(audit)
          for (const token of FORBIDDEN_AUDIT_TOKENS) expect(text).not.toContain(token)
        }
      })
    },
  )

  testWithPostgres(
    'concurrent first writes keep one row and a coherent before/after chain',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database, 'A')
        const repository = new DrizzleLocationRetentionSettingsRepository(database.db)
        const writes = Array.from({ length: 8 }, (_, index) =>
          repository.save({
            ...actorOf(tenant, `corr-race-${index}`),
            affectedEstimate: null,
            next: { purgeEnabled: true, retentionDays: 30 + index },
            now: at(index * HOUR_MS),
          }),
        )

        await Promise.all(writes)

        expect(await database.db.select().from(companyLocationRetentionSettings)).toHaveLength(1)
        const audits = await readAudits(database, tenant.companyId)
        expect(audits).toHaveLength(8)
        // sem linha só existe um "antes" nulo: a serialização por empresa faz o resto ver a anterior
        expect(audits.filter((audit) => audit.beforeSnapshot === null)).toHaveLength(1)
        const afterDays = audits.map(
          (audit) => (audit.afterSnapshot as { retentionDays: number }).retentionDays,
        )
        for (const audit of audits) {
          if (audit.beforeSnapshot === null) continue
          expect(afterDays).toContain(
            (audit.beforeSnapshot as { retentionDays: number }).retentionDays,
          )
        }
      })
    },
  )

  testWithPostgres('a failing audit rolls the write back, on insert and on update', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database, 'A')
      const repository = new DrizzleLocationRetentionSettingsRepository(database.db)
      // sem membership na empresa, o FK composto de `audit_logs` recusa a linha de auditoria
      const stranger = { ...actorOf(tenant, 'corr-fail'), userId: crypto.randomUUID() }
      await database.db.insert(identityUsers).values({ id: stranger.userId, status: 'active' })

      await expect(
        repository.save({
          ...stranger,
          affectedEstimate: null,
          next: { purgeEnabled: true, retentionDays: 30 },
          now: NOW,
        }),
      ).rejects.toThrow()
      expect(await repository.find({ companyId: tenant.companyId })).toBeNull()
      expect(await readAudits(database, tenant.companyId)).toHaveLength(0)

      await repository.save({
        ...actorOf(tenant, 'corr-ok'),
        affectedEstimate: null,
        next: { purgeEnabled: true, retentionDays: 90 },
        now: NOW,
      })
      await expect(
        repository.save({
          ...stranger,
          affectedEstimate: null,
          next: { purgeEnabled: false, retentionDays: 30 },
          now: at(HOUR_MS),
        }),
      ).rejects.toThrow()
      expect(await repository.find({ companyId: tenant.companyId })).toMatchObject({
        purgeEnabled: true,
        retentionDays: 90,
      })
      expect(await readAudits(database, tenant.companyId)).toHaveLength(1)

      await expect(repository.clear(stranger)).rejects.toThrow()
      expect(await repository.find({ companyId: tenant.companyId })).not.toBeNull()
    })
  })

  testWithPostgres(
    'a failure after the audit insert rolls the write and the audit back together',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database, 'A')
        const failingAfterCallback = {
          transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
            database.db.transaction(async (transaction) => {
              await callback(transaction)
              throw new Error('simulated failure after the audit insert')
            }),
        }
        const repository = new DrizzleLocationRetentionSettingsRepository(
          failingAfterCallback as never,
        )

        await expect(
          repository.save({
            ...actorOf(tenant, 'corr-late-failure'),
            affectedEstimate: null,
            next: { purgeEnabled: true, retentionDays: 30 },
            now: NOW,
          }),
        ).rejects.toThrow('simulated failure')

        const settings = new DrizzleLocationRetentionSettingsRepository(database.db)
        expect(await settings.find({ companyId: tenant.companyId })).toBeNull()
        expect(await readAudits(database, tenant.companyId)).toHaveLength(0)

        await settings.save({
          ...actorOf(tenant, 'corr-ok'),
          affectedEstimate: null,
          next: { purgeEnabled: true, retentionDays: 30 },
          now: NOW,
        })
        await expect(
          new DrizzleLocationRetentionSettingsRepository(failingAfterCallback as never).clear(
            actorOf(tenant, 'corr-late-clear'),
          ),
        ).rejects.toThrow('simulated failure')
        expect(await settings.find({ companyId: tenant.companyId })).not.toBeNull()
        expect(await readAudits(database, tenant.companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'clear returns to the default, audits once, and is silent without a row',
    async () => {
      await withDisposableDatabase(async (database) => {
        const tenant = await seedTenant(database, 'A')
        const repository = new DrizzleLocationRetentionSettingsRepository(database.db)

        await repository.clear(actorOf(tenant, 'corr-empty'))
        expect(await readAudits(database, tenant.companyId)).toHaveLength(0)

        const saved = await repository.save({
          ...actorOf(tenant, 'corr-save'),
          affectedEstimate: null,
          next: { purgeEnabled: true, retentionDays: 45 },
          now: NOW,
        })
        await repository.clear(actorOf(tenant, 'corr-clear'))

        expect(await repository.find({ companyId: tenant.companyId })).toBeNull()
        const audits = await readAudits(database, tenant.companyId)
        expect(audits).toHaveLength(2)
        expect(audits[1]).toMatchObject({
          action: CLEARED_ACTION,
          actorUserId: tenant.userId,
          afterSnapshot: null,
          beforeSnapshot: {
            purgeEffectiveAt: saved.purgeEffectiveAt?.toISOString(),
            purgeEnabled: true,
            retentionDays: 45,
          },
          correlationId: 'corr-clear',
          metadata: { ipAddress: IP_ADDRESS },
          permission: 'settings.manage',
        })
      })
    },
  )

  testWithPostgres('two companies never see, change or count each other', async () => {
    await withDisposableDatabase(async (database) => {
      const tenantA = await seedTenant(database, 'A')
      const tenantB = await seedTenant(database, 'B')
      const repository = new DrizzleLocationRetentionSettingsRepository(database.db)

      await repository.save({
        ...actorOf(tenantA, 'corr-a'),
        affectedEstimate: null,
        next: { purgeEnabled: true, retentionDays: 30 },
        now: NOW,
      })
      expect(await repository.find({ companyId: tenantB.companyId })).toBeNull()

      await repository.save({
        ...actorOf(tenantB, 'corr-b'),
        affectedEstimate: null,
        next: { purgeEnabled: true, retentionDays: 90 },
        now: NOW,
      })
      await repository.clear(actorOf(tenantA, 'corr-clear-a'))
      expect(await repository.find({ companyId: tenantA.companyId })).toBeNull()
      expect(await repository.find({ companyId: tenantB.companyId })).toMatchObject({
        purgeEnabled: true,
        retentionDays: 90,
      })
      expect(
        (await readAudits(database, tenantB.companyId)).map((audit) => audit.correlationId),
      ).toEqual(['corr-b'])

      // A: vencida (91 dias), de 60 dias, dentro do prazo e já apagada (sem ponto, `expired`) em cada
      // tabela; B: duas vencidas
      await insertPositionedRows(database, tenantA, EXPIRED_AT)
      await insertPositionedRows(database, tenantA, SIXTY_DAYS_AT)
      await insertPositionedRows(database, tenantA, WITHIN_AT)
      await insertPositionedRows(database, tenantA, EXPIRED_AT, { isPositioned: false })
      await insertPositionedRows(database, tenantB, EXPIRED_AT)
      await insertPositionedRows(database, tenantB, EXPIRED_AT)

      const countsOf = async (tenant: Tenant, retentionDays: number) => {
        const entries = await repository.countImpact({
          companyId: tenant.companyId,
          now: IMPACT_NOW,
          retentionDays,
        })
        return entries.map((entry) => [entry.kind, entry.count, entry.capped])
      }
      const everyKindWith = (count: number) =>
        Object.values(LOCATION_RETENTION_IMPACT_KIND).map((kind) => [kind, count, false])

      // prazo 90: só a de 91 dias; a de 60, a de 3 dias e a sem ponto não contam
      expect(await countsOf(tenantA, 90)).toEqual(everyKindWith(1))
      expect(await countsOf(tenantB, 90)).toEqual(everyKindWith(2))
      // prazo 30: a de 60 dias passa a contar (o prazo entra na consulta); a sem ponto continua fora
      expect(await countsOf(tenantA, 30)).toEqual(everyKindWith(2))
    })
  })

  testWithPostgres('the impact count stops at the cap and says so', async () => {
    await withDisposableDatabase(async (database) => {
      const tenant = await seedTenant(database, 'A')
      const repository = new DrizzleLocationRetentionSettingsRepository(database.db)
      await database.db.execute(sql`
        insert into trip_stop_events
          (id, company_id, stop_id, kind, latitude, longitude, accuracy_meters, captured_at,
           actor_user_id, location_state, created_at)
        select gen_random_uuid(), ${tenant.companyId}::uuid, ${tenant.stopId}::uuid, 'delivered',
               '-23.5505199', '-46.6333094', '9.00', ${EXPIRED_AT}::timestamptz,
               ${tenant.userId}::uuid, 'captured', ${EXPIRED_AT}::timestamptz
        from generate_series(1, ${LOCATION_RETENTION_IMPACT_CAP + 1})
      `)

      const impact = await repository.countImpact({
        companyId: tenant.companyId,
        now: IMPACT_NOW,
        retentionDays: 90,
      })

      expect(impact[0]).toEqual({
        capped: true,
        count: LOCATION_RETENTION_IMPACT_CAP,
        kind: LOCATION_RETENTION_IMPACT_KIND.stopEvent,
      })
      expect(impact.slice(1).every((entry) => entry.count === 0 && !entry.capped)).toBe(true)
    })
  })
})

async function insertPositionedRows(
  database: TestDatabase,
  tenant: Tenant,
  createdAt: string,
  options: { readonly isPositioned: boolean } = { isPositioned: true },
): Promise<void> {
  const position = options.isPositioned
    ? { accuracy: '9.00', latitude: '-23.5505199', longitude: '-46.6333094' }
    : { accuracy: null, latitude: null, longitude: null }
  const locationState = options.isPositioned ? 'captured' : 'expired'
  const capturedAt = options.isPositioned ? createdAt : null
  const eventId = crypto.randomUUID()
  const objectId = crypto.randomUUID()
  const { db } = database
  await db.execute(sql`
    insert into trip_stop_events
      (id, company_id, stop_id, kind, latitude, longitude, accuracy_meters, captured_at,
       actor_user_id, location_state, created_at)
    values (${eventId}, ${tenant.companyId}, ${tenant.stopId}, 'delivered', ${position.latitude},
      ${position.longitude}, ${position.accuracy}, ${capturedAt}, ${tenant.userId},
      ${locationState}, ${createdAt})
  `)
  await db.execute(sql`
    insert into stored_objects
      (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes, status)
    values (${objectId}, ${tenant.companyId}, 'integration', ${`retention/${objectId}`}, 's3',
      'delivery_proof', 'image/jpeg', ${objectId.replaceAll('-', '').padEnd(64, '0')}, 100, 'final')
  `)
  await db.execute(sql`
    insert into trip_delivery_proofs
      (id, company_id, stop_event_id, kind, object_id, actor_user_id, latitude, longitude,
       accuracy_meters, captured_at, punctuality, location_state, created_at)
    values (${crypto.randomUUID()}, ${tenant.companyId}, ${eventId}, 'photo', ${objectId},
      ${tenant.userId}, ${position.latitude}, ${position.longitude}, ${position.accuracy},
      ${capturedAt}, 'on_time', ${locationState}, ${createdAt})
  `)
  await db.execute(sql`
    insert into trip_status_events
      (id, company_id, trip_id, from_status, to_status, actor_user_id, occurred_at, recorded_at,
       latitude, longitude, accuracy_meters, captured_at, location_state)
    values (${crypto.randomUUID()}, ${tenant.companyId}, ${tenant.tripId}, 'draft', 'route_planned',
      ${tenant.userId}, ${createdAt}, ${createdAt}, ${position.latitude}, ${position.longitude},
      ${position.accuracy}, ${capturedAt}, ${locationState})
  `)
  await db.execute(sql`
    insert into trip_stop_occurrences
      (id, company_id, stop_id, kind, actor_user_id, occurrence_type_id, created_at, latitude,
       longitude, accuracy_meters, captured_at, location_state)
    values (${crypto.randomUUID()}, ${tenant.companyId}, ${tenant.stopId}, 'unexpected_charge',
      ${tenant.userId}, ${tenant.occurrenceTypeId}, ${createdAt}, ${position.latitude},
      ${position.longitude}, ${position.accuracy}, ${capturedAt}, ${locationState})
  `)
  await db.execute(sql`
    insert into trip_document_occurrences
      (id, company_id, trip_document_id, stage, occurrence_type_id, actor_user_id, created_at,
       latitude, longitude, accuracy_meters, captured_at, location_state)
    values (${crypto.randomUUID()}, ${tenant.companyId}, ${tenant.tripDocumentId}, 'separation',
      ${tenant.occurrenceTypeId}, ${tenant.userId}, ${createdAt}, ${position.latitude},
      ${position.longitude}, ${position.accuracy}, ${capturedAt}, ${locationState})
  `)
}

/** Empresa com ator membro, viagem, parada, nota e tipo de ocorrência: o mínimo das cinco tabelas. */
async function seedTenant(database: TestDatabase, label: 'A' | 'B'): Promise<Tenant> {
  const tenant: Tenant = {
    companyId: crypto.randomUUID(),
    occurrenceTypeId: crypto.randomUUID(),
    stopId: crypto.randomUUID(),
    tripDocumentId: crypto.randomUUID(),
    tripId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
  }
  const vehicleId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const nfeDocumentId = crypto.randomUUID()
  const plate = label === 'A' ? 'GCQ8E47' : 'GCQ8E49'
  const accessKey = (label === 'A' ? '1' : '2').repeat(44)
  const { db } = database

  await db.insert(companies).values({ id: tenant.companyId, status: 'active' })
  await db.insert(identityUsers).values({ id: tenant.userId, status: 'active' })
  await db.insert(userCompanyMemberships).values({
    companyId: tenant.companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: tenant.userId,
  })
  await db.execute(sql`
    insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
    values (${vehicleId}, ${tenant.companyId}, ${plate}, 'traction', 'tractor_unit', 'SP')
  `)
  await db.execute(sql`
    insert into trips (id, company_id, vehicle_id, status)
    values (${tenant.tripId}, ${tenant.companyId}, ${vehicleId}, 'completed')
  `)
  await db.execute(sql`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${tenant.stopId}, ${tenant.companyId}, ${tenant.tripId}, 1, '3550308|01001000|100', 'Centro, 100')
  `)
  await db.execute(sql`
    insert into stored_objects
      (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes, status)
    values (${xmlObjectId}, ${tenant.companyId}, 'integration', ${`retention/${xmlObjectId}`}, 's3',
      'nfe_document', 'application/xml', ${xmlObjectId.replaceAll('-', '').padEnd(64, '0')}, 100, 'final')
  `)
  await db.execute(sql`
    insert into nfe_imports
      (id, company_id, source, requested_by_user_id, correlation_id, idempotency_key,
       request_fingerprint, status)
    values (${importId}, ${tenant.companyId}, 'upload', ${tenant.userId}, ${`retention-${label}`},
      ${`retention-${label}`}, ${`retention-${label}`}, 'completed')
  `)
  await db.execute(sql`
    insert into nfe_documents
      (id, company_id, access_key, model, number, series, issued_at, operation_nature,
       operation_type, status, source, total_value, products_value, xml_object_id, xml_sha256,
       import_id, created_by_user_id, authorization_protocol)
    values (${nfeDocumentId}, ${tenant.companyId}, ${accessKey}, '55', '1', '1', ${NOW.toISOString()},
      'venda', '1', 'authorized', 'upload', '10.00', '10.00', ${xmlObjectId}, ${'0'.repeat(64)},
      ${importId}, ${tenant.userId}, 'retention')
  `)
  await db.execute(sql`
    insert into trip_documents (id, company_id, trip_id, nfe_document_id)
    values (${tenant.tripDocumentId}, ${tenant.companyId}, ${tenant.tripId}, ${nfeDocumentId})
  `)
  await db.execute(sql`
    insert into company_occurrence_types (id, company_id, name, stage, notifies, active)
    values (${tenant.occurrenceTypeId}, ${tenant.companyId}, 'Caixa violada', 'separation', false, true)
  `)
  return tenant
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_locret',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    // mesmo driver da produção (`prepare: false`), para `make_interval(days => $n)` rodar como lá
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 },
        url: connectionString,
      }),
    operation,
  })
}
