/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T201: prova contra Postgres de verdade que `DrizzleTripPlannedRouteRepository` — não só
 * a regra pura testada com fakes em `freeze-trip-planned-route.contract.ts` — lê o veículo real e
 * grava a rota inteira numa escrita só, satisfazendo os CHECKs de `trips_planned_route_check` e
 * `trips_planned_route_metrics_check` (T101) tanto no estado todo-`null` (D5) quanto no populado.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetVehicles, trips } from '../../src/database/database.schema.js'
import type { VehicleType } from '../../src/shared/vehicle-type.constant.js'
import type { WritePlannedRouteInput } from '../../src/trips/application/freeze-trip-planned-route.use-case.js'
import { DrizzleTripPlannedRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-planned-route.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type DisposableDatabase = { readonly connectionString: string; readonly database: TestDatabase }

const FULL_ROUTE: WritePlannedRouteInput['route'] = {
  choiceReproduced: true,
  criterion: 'cheapest',
  depot: null,
  distanceMeters: 89_400,
  durationSeconds: 4_200,
  legs: [{ distanceMetres: 89_400, durationSeconds: 4_200 }],
  points: [
    { latitude: '-21.17750', longitude: '-47.81030' },
    { latitude: '-21.99670', longitude: '-47.42560' },
  ],
  returnDistanceMeters: 0,
  signature: 'abc123deadbeef',
}

const FULL_TOLL: WritePlannedRouteInput['toll'] = {
  axles: { count: 3, source: 'declared' },
  booths: [],
  boothsFallenBackToManual: 0,
  boothsWithoutCharge: 0,
  chargePerAxle: '10.9333',
  multiplier: { denominator: 1, numerator: 3 },
  paymentMode: 'manual',
  total: '32.8000',
}

describe('freeze trip planned route repository integration', () => {
  testWithPostgres(
    'lê o veículo real (eixo declarado e multiplicador) pela junção trips/fleet_vehicles',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          axleCount: 3,
          hasAutomaticTollPayment: true,
          vehicleType: 'truck',
        })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)

        const vehicle = await repository.readVehicleContext({ companyId, tripId })

        expect(vehicle).toEqual({
          axles: { count: 3, source: 'declared' },
          hasAutomaticTollPayment: true,
          multiplier: { denominator: 1, numerator: 3 },
        })
      })
    },
  )

  testWithPostgres(
    'D5: grava rota e pedágio null juntos, e o CHECK todo-nulo de T101 aceita a escrita',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          axleCount: 2,
          hasAutomaticTollPayment: false,
          vehicleType: 'toco',
        })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)

        await repository.writePlannedRoute({ companyId, route: null, toll: null, tripId })

        const [row] = await database.db.select().from(trips).where(eq(trips.id, tripId))
        expect(row).toMatchObject({
          plannedDistanceMeters: null,
          plannedDurationSeconds: null,
          plannedReturnDistanceMeters: null,
          plannedRoute: null,
          plannedRouteFrozenAt: null,
          plannedToll: null,
          plannedTollFrozenAt: null,
        })
      })
    },
  )

  testWithPostgres(
    'grava a rota inteira numa escrita só — mesmo carimbo para rota e pedágio (D4)',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          axleCount: 3,
          hasAutomaticTollPayment: false,
          vehicleType: 'truck',
        })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)

        await repository.writePlannedRoute({
          companyId,
          route: FULL_ROUTE,
          toll: FULL_TOLL,
          tripId,
        })

        const [row] = await database.db.select().from(trips).where(eq(trips.id, tripId))
        expect(row?.plannedRoute).toEqual({
          choiceReproduced: true,
          criterion: 'cheapest',
          depot: null,
          legs: FULL_ROUTE?.legs,
          points: FULL_ROUTE?.points,
          signature: 'abc123deadbeef',
        })
        expect(row?.plannedDistanceMeters).toBe(89_400)
        expect(row?.plannedDurationSeconds).toBe(4_200)
        expect(row?.plannedReturnDistanceMeters).toBe(0)
        expect(row?.plannedToll).toEqual(FULL_TOLL)
        expect(row?.plannedRouteFrozenAt).not.toBeNull()
        expect(row?.plannedTollFrozenAt).not.toBeNull()
        /** Mesma instrução SQL, mesmo `now()` — a prova de que não são duas escritas (D4). */
        expect(row?.plannedRouteFrozenAt?.getTime()).toBe(row?.plannedTollFrozenAt?.getTime())
      })
    },
  )

  testWithPostgres(
    'D4 (regressão): o banco rejeita uma escrita parcial de rota, mesmo passando por fora do repositório',
    async () => {
      await withDisposableDatabase(async ({ connectionString, database }) => {
        const { tripId } = await seedTripWithVehicle(database, {
          axleCount: 3,
          hasAutomaticTollPayment: false,
          vehicleType: 'truck',
        })
        const raw = new SQL(connectionString, { max: 1 })

        try {
          await expectQueryToFail(
            raw`update trips set planned_route = '{}'::jsonb where id = ${tripId}`,
            '23514',
            'trips_planned_route_check',
          )
        } finally {
          await raw.close({ timeout: 0 })
        }
      })
    },
  )
})

async function expectQueryToFail(
  query: PromiseLike<unknown>,
  expectedSqlState: '23514',
  expectedConstraint: string,
): Promise<void> {
  try {
    await query
  } catch (error) {
    const postgresError = error as { readonly constraint?: unknown; readonly errno?: unknown }
    expect(postgresError.errno).toBe(expectedSqlState)
    expect(postgresError.constraint).toBe(expectedConstraint)
    return
  }
  throw new Error(`Expected PostgreSQL SQLSTATE ${expectedSqlState}`)
}

async function seedTripWithVehicle(
  database: TestDatabase,
  vehicle: {
    readonly axleCount: number
    readonly hasAutomaticTollPayment: boolean
    readonly vehicleType: VehicleType
  },
): Promise<{ readonly companyId: string; readonly tripId: string }> {
  const companyId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(fleetVehicles).values({
    axleCount: vehicle.axleCount,
    companyId,
    hasAutomaticTollPayment: vehicle.hasAutomaticTollPayment,
    id: vehicleId,
    plate: 'ABC1D23',
    role: 'traction',
    state: 'SP',
    vehicleType: vehicle.vehicleType,
  })
  const [trip] = await database.db
    .insert(trips)
    .values({ companyId, vehicleId })
    .returning({ id: trips.id })
  if (trip === undefined) throw new Error('A viagem semeada deveria ter voltado com id')

  return { companyId, tripId: trip.id }
}

async function withDisposableDatabase(
  operation: (disposable: DisposableDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t201_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  const connectionString = disposableUrl.toString()
  let database: TestDatabase | undefined
  try {
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString })
    database = createDrizzleProvider({ connection: connectionString })
    await operation({ connectionString, database })
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
