/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.5 (D5) contra o Postgres: o canal sai da última atividade do grupo do motorista
 * (`whatsapp_group_requests.last_activity_at`) contra a última entrada individual da sessão da Meta; o uso do app
 * não conta e a atividade de outra empresa nunca entra.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { fleetDriverWhatsappGroups, fleetDrivers } from '../../src/database/fleet.schema.js'
import { whatsappGroupRequests } from '../../src/database/whatsapp-group-request.schema.js'
import { createDrizzleDriverReminderChannelResolver } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-reminder-channel.resolver.js'
import { reportStopDeparture } from '../../src/trips/application/report-stop-departure.use-case.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import {
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const GROUP = '120363000000000001@g.us'
const PHONE = '16999990001'
const WHATSAPP_PHONE = '5516999990001'
const BASE = new Date('2026-11-07T12:00:00.000Z')
const at = (hours: number) => new Date(BASE.getTime() + hours * 3_600_000)

async function seedDriverGroup(database: TestDatabase, company: Company, groupJid: string) {
  await database.db
    .update(fleetDrivers)
    .set({ phone: PHONE })
    .where(eq(fleetDrivers.id, company.firstDriverId))
  await database.db.insert(fleetDriverWhatsappGroups).values({
    companyId: company.companyId,
    driverId: company.firstDriverId,
    groupJid,
  })
}

async function recordGroupActivity(
  database: TestDatabase,
  company: Company,
  groupJid: string,
  lastActivityAt: Date,
) {
  await database.db.insert(whatsappGroupRequests).values({
    closedAt: lastActivityAt,
    companyId: company.companyId,
    driverId: company.firstDriverId,
    expiresAt: lastActivityAt,
    groupJid,
    lastActivityAt,
    openedAt: lastActivityAt,
    ownerNumber: WHATSAPP_PHONE,
    status: 'completed',
    step: 'stop.arrive',
    timeoutSeconds: 600,
  })
}

function build(database: TestDatabase, lastInboundByCompany: Record<string, Date | undefined>) {
  return createDrizzleDriverReminderChannelResolver({
    database: database.db,
    sessions: {
      getContext: async (companyId, whatsappNumber) =>
        whatsappNumber === WHATSAPP_PHONE
          ? ({ lastInboundAt: lastInboundByCompany[companyId] ?? null } as never)
          : undefined,
    },
  })
}

const resolve = (resolver: ReturnType<typeof build>, company: Company) =>
  resolver.resolve({ companyId: company.companyId, driverId: company.firstDriverId })

describe('canal do lembrete contra o Postgres (spec 299 T2.5)', () => {
  testWithPostgres('grupo mais recente que o individual: grupo', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      await seedDriverGroup(database, company, GROUP)
      await recordGroupActivity(database, company, GROUP, at(2))

      const resolver = build(database, { [company.companyId]: at(1) })

      expect(await resolve(resolver, company)).toBe('group')
    })
  })

  testWithPostgres('individual mais recente que o grupo: direto', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      await seedDriverGroup(database, company, GROUP)
      await recordGroupActivity(database, company, GROUP, at(1))

      const resolver = build(database, { [company.companyId]: at(2) })

      expect(await resolve(resolver, company)).toBe('direct')
    })
  })

  testWithPostgres('nenhuma atividade: grupo', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      await seedDriverGroup(database, company, GROUP)

      expect(await resolve(build(database, {}), company)).toBe('group')
    })
  })

  testWithPostgres('o uso do app depois não muda o canal', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'dispatched')
      await seedDriverGroup(database, company, GROUP)
      await recordGroupActivity(database, company, GROUP, at(-3))
      const userId = await linkDriverMembership(database, company, company.firstDriverId)
      await reportStopDeparture({
        actorUserId: userId,
        companyId: company.companyId,
        driverId: company.firstDriverId,
        idempotencyKey: crypto.randomUUID(),
        location: null,
        now: new Date(),
        stopId: trip.stopId,
        tappedAt: new Date(),
        unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
      })

      const resolver = build(database, { [company.companyId]: at(-2) })

      expect(await resolve(resolver, company)).toBe('direct')
    })
  })

  testWithPostgres('atividade do mesmo grupo em outra empresa é ignorada', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const other = await seedCompany(database)
      await seedDriverGroup(database, company, GROUP)
      await recordGroupActivity(database, other, GROUP, at(5))

      const resolver = build(database, {
        [company.companyId]: at(1),
        [other.companyId]: at(9),
      })

      expect(await resolve(resolver, company)).toBe('direct')
    })
  })
})
