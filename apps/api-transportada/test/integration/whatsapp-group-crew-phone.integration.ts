/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 S2: a tripulação do grupo contra Postgres de verdade — o motorista dono do grupo e quem está na viagem
 * ativa dele; o motorista de outro grupo não; viagem encerrada não vale; nono dígito só sem ambiguidade.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { fleetDrivers, tripDrivers, trips } from '../../src/database/database.schema.js'
import { isCrewPhone } from '../../src/whatsapp/infrastructure/whatsapp-group-sender.adapter.js'
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

const OWNER_PHONE = '16988887777'
const HELPER_PHONE = '16977776666'
const OTHER_DRIVER_PHONE = '16955554444'

describe('tripulação do grupo pelo telefone (spec 294 S2)', () => {
  testWithPostgres(
    'dono do grupo e ajudante da viagem ativa dele são tripulação; outro motorista não',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await setUp(database)
        const crew = (phone: string, driverId = world.ownerId) =>
          isCrewPhone(database.db, { companyId: world.companyId, driverId, phone })

        expect(await crew(`55${OWNER_PHONE}`)).toBe(true)
        expect(await crew('551688887777')).toBe(true)
        expect(await crew(`55${HELPER_PHONE}`)).toBe(true)
        expect(await crew(`55${OTHER_DRIVER_PHONE}`)).toBe(false)
        expect(await crew('5511900000000')).toBe(false)
        // No grupo do outro motorista, o dono deste grupo não é tripulação.
        expect(await crew(`55${OWNER_PHONE}`, world.otherDriverId)).toBe(false)
        // Outra empresa não enxerga a ficha.
        expect(
          await isCrewPhone(database.db, {
            companyId: world.foreignCompanyId,
            driverId: world.ownerId,
            phone: `55${OWNER_PHONE}`,
          }),
        ).toBe(false)
      })
    },
  )

  testWithPostgres(
    'com a viagem encerrada, o ajudante deixa de ser tripulação do grupo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await setUp(database)
        await database.db
          .update(trips)
          .set({ status: 'completed' })
          .where(eq(trips.id, world.tripId))
        expect(
          await isCrewPhone(database.db, {
            companyId: world.companyId,
            driverId: world.ownerId,
            phone: `55${HELPER_PHONE}`,
          }),
        ).toBe(false)
      })
    },
  )

  testWithPostgres(
    'a ficha com o número exato vence a forma sem o nono dígito de outra pessoa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await setUp(database)
        // Uma ficha antiga, fora da tripulação, com o número sem o nono dígito do dono do grupo.
        const stranger = await seedDriverAccount(database, world.companyId)
        await database.db
          .update(fleetDrivers)
          .set({ phone: '1688887777' })
          .where(eq(fleetDrivers.id, stranger.driverId))
        const crew = (phone: string) =>
          isCrewPhone(database.db, { companyId: world.companyId, driverId: world.ownerId, phone })
        expect(await crew(`55${OWNER_PHONE}`)).toBe(true)
        expect(await crew('551688887777')).toBe(false)
      })
    },
  )
})

async function setUp(database: TestDatabase) {
  const { foreignCompanyId } = await seedCargoTenants(database)
  const companyId = COMPANY_CONTEXT.companyId
  const owner = await seedDriverAccount(database, companyId)
  const helper = await seedDriverAccount(database, companyId)
  const other = await seedDriverAccount(database, companyId)
  const phones = [
    [owner.driverId, OWNER_PHONE],
    [helper.driverId, HELPER_PHONE],
    [other.driverId, OTHER_DRIVER_PHONE],
  ] as const
  await Promise.all(
    phones.map(([id, phone]) =>
      database.db.update(fleetDrivers).set({ phone }).where(eq(fleetDrivers.id, id)),
    ),
  )
  const seeded = await seedDriverTrip(database, {
    companyId,
    driver: owner,
    stops: [{ cityCode: '3543402', estimatedArrivalAt: null }],
  })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId: helper.driverId,
    driverName: 'Ajudante',
    driverTaxId: helper.taxId,
    position: 2n,
    role: 'helper',
    tripId: seeded.tripId,
  })
  return {
    companyId,
    foreignCompanyId,
    otherDriverId: other.driverId,
    ownerId: owner.driverId,
    tripId: seeded.tripId,
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_t294c',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 5, max: 4, queryTimeoutMs: 10_000 },
        url: connectionString,
      }),
    operation,
  })
}
