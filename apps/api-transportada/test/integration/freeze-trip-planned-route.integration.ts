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
import {
  companies,
  companyFuelPrices,
  fleetVehicles,
  trips,
} from '../../src/database/database.schema.js'
import { geocodedAddresses } from '../../src/database/geocoding.schema.js'
import { tripStops } from '../../src/database/trip.schema.js'
import type { VehicleType } from '../../src/shared/vehicle-type.constant.js'
import type { FuelProduct } from '../../src/shared/fuel.constant.js'
import type { WritePlannedRouteInput } from '../../src/trips/application/freeze-trip-planned-route.use-case.js'
import { DrizzleTripPlannedRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-planned-route.repository.js'
import { clearPlannedRoute } from '../../src/trips/infrastructure/trip-planned-route-clear.support.js'

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
  isNoToll: false,
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

        /**
         * N14 (segunda revisão da 153): `toMatchObject` deixava passar um campo a mais em
         * `vehicle` sem reprovar — `revision` é o único não-determinístico, tratado à parte, e o
         * resto vai por `toEqual`, que reprova qualquer chave inesperada.
         */
        const { revision, ...rest } = vehicle ?? {}
        expect(rest).toEqual({
          axles: { count: 3, source: 'declared' },
          hasAutomaticTollPayment: true,
          multiplier: { denominator: 1, numerator: 3 },
          /** spec 153 H1: sem `averageConsumption`/`fuelType` cadastrados, não há o que comparar. */
          fuelBaseline: { kilometersPerLiter: null, pricePerLiter: null },
        })
        /** T704 M3: a revisão da viagem viaja junto — é o compare-and-set da escrita final. */
        expect(typeof revision).toBe('string')
      })
    },
  )

  testWithPostgres(
    'spec 153 H1: lê o consumo e o preço efetivo do combustível pela mesma conta da consulta de eixos',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          axleCount: 2,
          /** `average_consumption` é `numeric(6,2)` — a coluna guarda duas casas, não quatro. */
          averageConsumption: '2.50',
          fuelType: 'diesel-s10',
          hasAutomaticTollPayment: false,
          vehicleType: 'toco',
        })
        await database.db
          .insert(companyFuelPrices)
          .values({ companyId, product: 'diesel-s10', pricePerUnit: '6.0000' })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)

        const vehicle = await repository.readVehicleContext({ companyId, tripId })

        expect(vehicle?.fuelBaseline).toEqual({
          kilometersPerLiter: '2.50',
          pricePerLiter: '6.0000',
        })
      })
    },
  )

  testWithPostgres(
    'lê consumo e preço efetivo do combustível do veículo — o que o critério cheapest compara',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          averageConsumption: '3.50',
          axleCount: 2,
          fuelType: 'diesel-s10',
          hasAutomaticTollPayment: false,
          vehicleType: 'toco',
        })
        await database.db
          .insert(companyFuelPrices)
          .values({ companyId, pricePerUnit: '6.2000', product: 'diesel-s10' })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)

        const vehicle = await repository.readVehicleContext({ companyId, tripId })

        /** `average_consumption` é `numeric(…, 2)`: o banco devolve a escala da coluna. */
        expect(vehicle?.fuelBaseline).toEqual({
          kilometersPerLiter: '3.50',
          pricePerLiter: '6.2000',
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

        await repository.writePlannedRoute({
          companyId,
          expectedRevision: await readTripRevision(repository, companyId, tripId),
          route: null,
          toll: null,
          tripId,
        })

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
          expectedRevision: await readTripRevision(repository, companyId, tripId),
          route: FULL_ROUTE,
          toll: FULL_TOLL,
          tripId,
        })

        const [row] = await database.db.select().from(trips).where(eq(trips.id, tripId))
        expect(row?.plannedRoute).toEqual({
          choiceReproduced: true,
          criterion: 'cheapest',
          depot: null,
          isNoToll: false,
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

  testWithPostgres(
    'T704 M3 / T802: escrita nascida de revisão obsoleta não sobrescreve a rota mais nova, e o outcome diz por quê',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          axleCount: 2,
          hasAutomaticTollPayment: false,
          vehicleType: 'toco',
        })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)
        const staleRevision = await readTripRevision(repository, companyId, tripId)

        /** T802: uma parada mudou no meio do caminho — o hash da junção passa a ser outro. */
        await database.db
          .insert(tripStops)
          .values({ addressKey: 'x', companyId, label: 'Parada', sequence: 1n, tripId })

        const outcome = await repository.writePlannedRoute({
          companyId,
          expectedRevision: staleRevision,
          route: FULL_ROUTE,
          toll: FULL_TOLL,
          tripId,
        })

        expect(outcome).toBe('stale_revision')
        const [row] = await database.db.select().from(trips).where(eq(trips.id, tripId))
        expect(row?.plannedRoute).toBeNull()
        expect(row?.plannedRouteFrozenAt).toBeNull()
      })
    },
  )

  testWithPostgres(
    'T901: geocodificação que preenche a coordenada durante o congelamento descarta a escrita, e não só mudança em trip_stops',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          axleCount: 2,
          hasAutomaticTollPayment: false,
          vehicleType: 'toco',
        })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)
        /** A parada existe desde o disparo — só a coordenada dela ainda não tinha chegado. */
        await database.db.insert(tripStops).values({
          addressKey: 'endereco-sem-coordenada',
          companyId,
          label: 'Parada',
          sequence: 1n,
          tripId,
        })
        const revisionBeforeGeocoding = await readTripRevision(repository, companyId, tripId)

        /**
         * O geocodificador preenche `geocoded_addresses` enquanto o congelamento ainda calculava a
         * rota — nenhuma linha de `trip_stops` mudou, então um contador que só ouvisse `trip_stops`
         * (a guarda original da T802) deixaria isso passar, e a viagem ficaria com rota nula mesmo
         * já havendo coordenada para todas as paradas.
         */
        await database.db.insert(geocodedAddresses).values({
          addressKey: 'endereco-sem-coordenada',
          latitude: '-21.1775000',
          longitude: '-47.8103000',
          precision: 'city',
          source: 'city',
        })

        const outcome = await repository.writePlannedRoute({
          companyId,
          expectedRevision: revisionBeforeGeocoding,
          route: FULL_ROUTE,
          toll: FULL_TOLL,
          tripId,
        })

        expect(outcome).toBe('stale_revision')
        const [row] = await database.db.select().from(trips).where(eq(trips.id, tripId))
        expect(row?.plannedRoute).toBeNull()
        expect(row?.plannedRouteFrozenAt).toBeNull()
      })
    },
  )

  testWithPostgres(
    'T802: escrita alheia em trips que não mexe em parada NÃO descarta o congelamento',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          axleCount: 2,
          hasAutomaticTollPayment: false,
          vehicleType: 'toco',
        })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)
        const revision = await readTripRevision(repository, companyId, tripId)

        /**
         * O relato de campo do motorista e o override de MDF-e escrevem direto em `trips` sem
         * tocar em parada nenhuma nem em `geocoded_addresses` — é exatamente essa escrita que
         * `updated_at` não distinguia de uma mudança de parada (T802 defeito a). `daily_allowance_
         * days` é uma coluna qualquer de `trips` fora do grupo da rota, só para simular "algo mais
         * mexeu na linha".
         */
        await database.db
          .update(trips)
          .set({ dailyAllowanceDays: 3, updatedAt: new Date() })
          .where(eq(trips.id, tripId))

        const outcome = await repository.writePlannedRoute({
          companyId,
          expectedRevision: revision,
          route: FULL_ROUTE,
          toll: FULL_TOLL,
          tripId,
        })

        expect(outcome).toBe('written')
        const [row] = await database.db.select().from(trips).where(eq(trips.id, tripId))
        expect(row?.plannedRoute).not.toBeNull()
        expect(row?.dailyAllowanceDays).toBe(3)
      })
    },
  )

  testWithPostgres(
    'T704 M3 / T802: congelamento atrasado não alcança viagem já despachada, e o outcome diz por quê',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          axleCount: 2,
          hasAutomaticTollPayment: false,
          vehicleType: 'toco',
        })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)
        await database.db.update(trips).set({ status: 'dispatched' }).where(eq(trips.id, tripId))
        const revision = await readTripRevision(repository, companyId, tripId)

        const outcome = await repository.writePlannedRoute({
          companyId,
          expectedRevision: revision,
          route: FULL_ROUTE,
          toll: FULL_TOLL,
          tripId,
        })

        expect(outcome).toBe('status_not_before_dispatch')
        const [row] = await database.db.select().from(trips).where(eq(trips.id, tripId))
        expect(row?.plannedRoute).toBeNull()
      })
    },
  )

  testWithPostgres(
    'T704 M1: a limpeza zera o grupo inteiro e o CHECK aceita — mas não toca em despachada',
    async () => {
      await withDisposableDatabase(async ({ database }) => {
        const { companyId, tripId } = await seedTripWithVehicle(database, {
          axleCount: 2,
          hasAutomaticTollPayment: false,
          vehicleType: 'toco',
        })
        const repository = new DrizzleTripPlannedRouteRepository(database.db)
        await repository.writePlannedRoute({
          companyId,
          expectedRevision: await readTripRevision(repository, companyId, tripId),
          route: FULL_ROUTE,
          toll: FULL_TOLL,
          tripId,
        })

        await clearPlannedRoute(database.db, { companyId, tripId })

        const [cleared] = await database.db.select().from(trips).where(eq(trips.id, tripId))
        expect(cleared).toMatchObject({
          plannedDistanceMeters: null,
          plannedDurationSeconds: null,
          plannedReturnDistanceMeters: null,
          plannedRoute: null,
          plannedRouteFrozenAt: null,
          plannedToll: null,
          plannedTollFrozenAt: null,
        })

        /** Despachada: o congelado é o roteiro que está na rua, e a limpeza não o alcança. */
        await repository.writePlannedRoute({
          companyId,
          expectedRevision: await readTripRevision(repository, companyId, tripId),
          route: FULL_ROUTE,
          toll: FULL_TOLL,
          tripId,
        })
        await database.db.update(trips).set({ status: 'dispatched' }).where(eq(trips.id, tripId))

        await clearPlannedRoute(database.db, { companyId, tripId })

        const [kept] = await database.db.select().from(trips).where(eq(trips.id, tripId))
        expect(kept?.plannedRoute).not.toBeNull()
      })
    },
  )
})

/**
 * T704 M3 / T802 / T901: a revisão é o hash da junção `trip_stops` × `geocoded_addresses` que
 * `readVehicleContext` já expõe — nenhuma coluna nem trigger por trás, então ler pelo próprio
 * caminho de produção é o único jeito de não divergir do que `writePlannedRoute` reconfere.
 */
async function readTripRevision(
  repository: DrizzleTripPlannedRouteRepository,
  companyId: string,
  tripId: string,
): Promise<string> {
  const vehicle = await repository.readVehicleContext({ companyId, tripId })
  if (vehicle === null) throw new Error('viagem semeada sumiu')
  return vehicle.revision
}

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
    readonly averageConsumption?: string
    readonly axleCount: number
    readonly fuelType?: FuelProduct
    readonly hasAutomaticTollPayment: boolean
    readonly vehicleType: VehicleType
  },
): Promise<{ readonly companyId: string; readonly tripId: string }> {
  const companyId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(fleetVehicles).values({
    ...(vehicle.averageConsumption === undefined
      ? {}
      : { averageConsumption: vehicle.averageConsumption }),
    axleCount: vehicle.axleCount,
    companyId,
    ...(vehicle.fuelType === undefined ? {} : { fuelType: vehicle.fuelType }),
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
