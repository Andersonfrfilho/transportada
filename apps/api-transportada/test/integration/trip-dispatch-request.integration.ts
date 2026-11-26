/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O pedido de despacho do bot ao escritório contra Postgres de verdade: um pedido aberto por viagem, o responsável
 * achado pelo telefone nas duas grafias do nono dígito, o reaviso e o vencimento reivindicados uma vez só, e quem
 * planejou a viagem com telefone verificado.
 */
import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  DrizzleTripDispatchRequestRepository,
  findDriverFirstName,
  findTripPlannerWithPhone,
} from '../../src/whatsapp/infrastructure/drizzle-trip-dispatch-request.repository.js'
import { seedCargoTenants } from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import {
  seedDriverAccount,
  seedDriverTrip,
} from '../fixtures/driver-holiday-warning-seed.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>

const GROUP = '120363@g.us'
const PHONE = '5516988887777'
const NOW = new Date('2026-11-23T13:00:00.000Z')
const EVENT = { event: 'depart', sentAt: '2026-11-23T12:59:00.000Z', stopId: 'S1' } as const

describe('pedido de despacho do bot (banco)', () => {
  testWithPostgres(
    'um pedido aberto por viagem; o vencido não segura o próximo; o responsável vem pelo telefone',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await setUp(database)
        const repository = new DrizzleTripDispatchRequestRepository(database.db)
        const insert = (expiresAt: Date) =>
          repository.insert({
            companyId: world.companyId,
            driverId: world.driverId,
            event: EVENT,
            expiresAt,
            groupJid: GROUP,
            responderPhone: PHONE,
            responderUserId: world.plannerId,
            tripId: world.tripId,
          })
        const future = new Date(Date.now() + 600_000)

        expect(await insert(future)).toBe(true)
        expect(await insert(future)).toBe(false)

        const open = await repository.findOpenByTrip({
          companyId: world.companyId,
          tripId: world.tripId,
        })
        expect(open).toMatchObject({ groupJid: GROUP, pendingEvents: [EVENT] })
        // As duas grafias do nono dígito são o mesmo número.
        for (const phone of [PHONE, '551688887777']) {
          expect(
            await repository.findOpenByResponder({ companyId: world.companyId, phone }),
          ).toMatchObject({ id: open?.id })
        }
        expect(
          await repository.findOpenByResponder({
            companyId: world.companyId,
            phone: '5511900000000',
          }),
        ).toBeNull()

        const later = { ...EVENT, event: 'arrive', sentAt: '2026-11-23T13:00:30.000Z' } as const
        await repository.appendEvent({
          companyId: world.companyId,
          event: later,
          id: open?.id ?? '',
        })
        expect(
          (await repository.findOpenByTrip({ companyId: world.companyId, tripId: world.tripId }))
            ?.pendingEvents,
        ).toEqual([EVENT, later])

        // Aprovado e despacho que falha: só essa transição vira `failed`; o resto não muda depois de resolvido.
        const id = open?.id ?? ''
        const resolve = (status: 'approved' | 'declined' | 'failed') =>
          repository.resolve({ companyId: world.companyId, id, now: NOW, status })
        expect(await resolve('approved')).toBe(true)
        expect(await resolve('declined')).toBe(false)
        expect(await resolve('failed')).toBe(true)
        expect(await resolve('failed')).toBe(false)

        // Pedido vencido que o vigia ainda não fechou não impede abrir outro.
        await database.db.execute(sql`
          insert into trip_dispatch_requests
            (company_id, trip_id, driver_id, group_jid, responder_user_id, responder_phone, pending_events, expires_at)
          values (${world.companyId}, ${world.tripId}, ${world.driverId}, ${GROUP}, ${world.plannerId},
            ${PHONE}, '[]'::jsonb, now() - interval '1 minute')`)
        expect(await insert(future)).toBe(true)
      })
    },
  )

  testWithPostgres(
    'reaviso aos 5 minutos e vencimento aos 10, cada um reivindicado uma vez',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await setUp(database)
        const repository = new DrizzleTripDispatchRequestRepository(database.db)
        await repository.insert({
          companyId: world.companyId,
          driverId: world.driverId,
          event: EVENT,
          expiresAt: new Date(NOW.getTime() + 600_000),
          groupJid: GROUP,
          responderPhone: PHONE,
          responderUserId: world.plannerId,
          tripId: world.tripId,
        })
        await database.db.execute(
          sql`update trip_dispatch_requests set created_at = ${NOW.toISOString()}::timestamptz`,
        )
        const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

        expect(await repository.claimReminders({ afterMs: 300_000, now: at(4) })).toEqual([])
        expect(await repository.claimReminders({ afterMs: 300_000, now: at(5) })).toHaveLength(1)
        expect(await repository.claimReminders({ afterMs: 300_000, now: at(6) })).toEqual([])

        expect(await repository.claimExpired(at(9))).toEqual([])
        expect(await repository.claimExpired(at(10))).toHaveLength(1)
        expect(await repository.claimExpired(at(11))).toEqual([])
        expect(
          await repository.findOpenByResponder({ companyId: world.companyId, phone: PHONE }),
        ).toBeNull()
      })
    },
  )

  testWithPostgres(
    'quem planejou a viagem com telefone verificado, e o primeiro nome do motorista',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await setUp(database)
        expect(
          await findTripPlannerWithPhone(database.db, {
            companyId: world.companyId,
            tripId: world.tripId,
          }),
        ).toEqual({ phone: PHONE, userId: world.plannerId })

        await database.db.execute(
          sql`update user_whatsapp_phones set verified_at = null where user_id = ${world.plannerId}`,
        )
        expect(
          await findTripPlannerWithPhone(database.db, {
            companyId: world.companyId,
            tripId: world.tripId,
          }),
        ).toBeNull()

        expect(
          (
            await findDriverFirstName(database.db, {
              companyId: world.companyId,
              driverId: world.driverId,
            })
          ).length,
        ).toBeGreaterThan(0)
      })
    },
  )
})

async function setUp(database: TestDatabase) {
  await seedCargoTenants(database)
  const companyId = COMPANY_CONTEXT.companyId
  const driver = await seedDriverAccount(database, companyId)
  const seeded = await seedDriverTrip(database, {
    companyId,
    driver,
    status: 'route_planned',
    stops: [{ cityCode: '3543402', estimatedArrivalAt: null }],
  })
  const plannerId = crypto.randomUUID()
  await database.db.execute(sql`insert into identity_users (id) values (${plannerId})`)
  await database.db.execute(
    sql`insert into user_whatsapp_phones (user_id, phone, verified_at) values (${plannerId}, ${PHONE}, now())`,
  )
  await database.db.execute(
    sql`insert into trip_status_events (company_id, trip_id, from_status, to_status, actor_user_id, channel, event_kind)
        values (${companyId}, ${seeded.tripId}, 'draft', 'route_planned', ${plannerId}, 'backoffice', 'transition')`,
  )
  return { companyId, driverId: driver.driverId, plannerId, tripId: seeded.tripId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_t_dispatch',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 5, max: 4, queryTimeoutMs: 10_000 },
        url: connectionString,
      }),
    operation,
  })
}
