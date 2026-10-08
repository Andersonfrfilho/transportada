/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Banco descartável do calendário de dias úteis (spec 238 T1.3): cada teste cria o próprio banco,
 * migra, semeia e derruba. Semeadura sempre em série: dezenas de INSERTs concorrentes no pool já
 * derrubaram teste de integração aqui.
 */
import { and, asc, eq } from 'drizzle-orm'

import type { BusinessCalendarActor } from '../../src/business-calendar/application/business-calendar-actor.types.js'
import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  identityUsers,
  municipalHolidays,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from './disposable-database.fixture.js'

export const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL

export type TestDatabase = ReturnType<typeof createDatabaseProvider>

export type Tenant = { readonly companyId: string; readonly userId: string }

export const CAMPINAS = '3509502'
export const SAO_PAULO = '3550308'
export const IP_ADDRESS = '203.0.113.7'

export function actorOf(tenant: Tenant, correlationId: string): BusinessCalendarActor {
  return {
    companyId: tenant.companyId,
    correlationId,
    ipAddress: IP_ADDRESS,
    userId: tenant.userId,
  }
}

export async function seedTenant(database: TestDatabase): Promise<Tenant> {
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

export function readAudits(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.companyId, companyId))
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
}

export function readHolidayRows(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(municipalHolidays)
    .where(eq(municipalHolidays.companyId, companyId))
    .orderBy(asc(municipalHolidays.cityIbgeCode), asc(municipalHolidays.holidayOn))
}

export async function findHolidayRow(
  database: TestDatabase,
  params: {
    readonly companyId: string
    readonly holidayOn: string
    readonly cityIbgeCode?: string
  },
) {
  const [row] = await database.db
    .select()
    .from(municipalHolidays)
    .where(
      and(
        eq(municipalHolidays.companyId, params.companyId),
        eq(municipalHolidays.cityIbgeCode, params.cityIbgeCode ?? CAMPINAS),
        eq(municipalHolidays.holidayOn, params.holidayOn),
      ),
    )
  return row
}

export async function withBusinessCalendarDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_bizcal',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    // mesmo driver da produção (`prepare: false`)
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 },
        url: connectionString,
      }),
    operation,
  })
}
