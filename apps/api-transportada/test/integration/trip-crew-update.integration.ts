/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 216: o `UPDATE`/`DELETE`+`INSERT` de `updateCrew` roda numa transação com lock — o teste com
 * repositório fake nunca exercita a constraint composta `trips_company_vehicle_fk` nem o
 * compare-and-set do status sob `SELECT … FOR NO KEY UPDATE`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { trips, tripDrivers } from '../../src/database/trip.schema.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { resolveCrewStatus } from '../../src/trips/domain/trip-state.policy.js'
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const DISPOSABLE_DATABASE_TIMEOUT_MS = 60_000

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_crewupdate_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
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

async function seedCompanyFleet(database: TestDatabase['db']): Promise<{
  readonly companyId: string
  readonly firstDriverId: string
  readonly firstVehicleId: string
  readonly secondDriverId: string
  readonly secondVehicleId: string
  readonly userId: string
}> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const firstDriverId = crypto.randomUUID()
  const secondDriverId = crypto.randomUUID()
  const firstVehicleId = crypto.randomUUID()
  const secondVehicleId = crypto.randomUUID()

  await database.insert(companies).values({ id: companyId, status: 'active' })
  await database.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId,
  })
  await database.insert(fleetVehicles).values([
    {
      companyId,
      id: firstVehicleId,
      plate: 'ABC1D23',
      role: 'traction',
      state: 'SP',
      vehicleType: 'tractor_unit',
    },
    {
      companyId,
      id: secondVehicleId,
      plate: 'XYZ9E88',
      role: 'traction',
      state: 'SP',
      vehicleType: 'truck',
    },
  ])
  await database.insert(fleetDrivers).values([
    { companyId, id: firstDriverId, name: 'Primeiro Motorista', taxId: '11111111111' },
    { companyId, id: secondDriverId, name: 'Segundo Motorista', taxId: '22222222222' },
  ])

  return { companyId, firstDriverId, firstVehicleId, secondDriverId, secondVehicleId, userId }
}

/**
 * Spec 217 T103: a criação por HTTP ainda exige o par completo — abrir `POST /trips` para viagem sem
 * tripulação é a RF2, implementada na T202 e provada na T201. Até lá o estado inicial
 * `awaiting_crew` nasce daqui, como o `route_planned` do teste da 216 logo acima.
 */
async function createAwaitingCrewTrip(
  database: TestDatabase['db'],
  fleet: { readonly companyId: string; readonly userId: string },
): Promise<string> {
  const repository = new DrizzleTripRepository(database)
  const created = await repository.create({
    actorUserId: fleet.userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId: fleet.companyId,
    crew: [],
    vehicleId: null,
  })
  await database.update(trips).set({ status: 'awaiting_crew' }).where(eq(trips.id, created.id))
  return created.id
}

async function readCrewState(
  database: TestDatabase['db'],
  input: { readonly companyId: string; readonly tripId: string },
): Promise<{
  readonly driverIds: readonly string[]
  readonly status: string
  readonly vehicleId: string | null
}> {
  const [tripRow] = await database
    .select({ status: trips.status, vehicleId: trips.vehicleId })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
  if (tripRow === undefined) throw new Error('TRIP_NOT_FOUND')
  const driverRows = await database
    .select({ driverId: tripDrivers.driverId })
    .from(tripDrivers)
    .where(and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId)))
  return {
    driverIds: driverRows.map((row) => row.driverId),
    status: tripRow.status,
    vehicleId: tripRow.vehicleId,
  }
}

/**
 * Spec 217 D1: a coerência é a invariante que importa — o status gravado é exatamente
 * `resolveCrewStatus` do par que ficou no banco, nunca `draft` sem as duas coisas.
 */
function expectStatusDerivedFromStoredCrew(
  state: {
    readonly driverIds: readonly string[]
    readonly status: string
    readonly vehicleId: string | null
  },
  /**
   * Spec 217 D3-ter: com roteiro congelado sobrevivendo à troca, o par completo descreve
   * `route_planned`, não `draft` — `resolveCrewStatus` responde só a metade da pergunta.
   */
  options: { readonly routeSurvived?: boolean } = {},
): void {
  const byPair = resolveCrewStatus({
    hasDriver: state.driverIds.length > 0,
    hasVehicle: state.vehicleId !== null,
  })
  const expected = options.routeSurvived === true && byPair === 'draft' ? 'route_planned' : byPair
  expect(state.status).toBe(expected)
}

describe('troca de motorista/veículo de uma viagem, contra Postgres', () => {
  /**
   * Spec 217 T307, a necessidade que abriu esta spec: **trocar o motorista de uma viagem já
   * roteirizada.** A rota e o pedágio saem da classe e dos eixos do caminhão, e quem dirige não entra
   * nessa conta (097 D1/D3/D4) — então o roteiro fica de pé, a viagem nem sai de `route_planned`, e
   * não há nada a replanejar.
   *
   * ⚠️ O que este teste prende contra regressão é o **par** de fatos: o motorista trocou E o pedágio
   * continua lá. Provar só o primeiro deixaria passar uma limpeza de rota disparada por engano na
   * troca de motorista, que é o defeito mais caro possível aqui — perder o pedágio congelado de uma
   * viagem pronta para separar.
   */
  testWithPostgres(
    'trocar só o motorista de uma viagem roteirizada deixa a rota e o pedágio de pé',
    async () => {
      await withDisposableDatabase(async (database) => {
        const fleet = await seedCompanyFleet(database.db)
        const repository = new DrizzleTripRepository(database.db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })

        const frozenRoute = { criterion: 'cheapest', legs: [], points: [], signature: 'abc' }
        const frozenToll = { total: '12.34' }
        await database.db
          .update(trips)
          .set({
            plannedDistanceMeters: 42_000,
            plannedDurationSeconds: 3_600,
            plannedRoute: frozenRoute,
            plannedRouteFrozenAt: new Date(),
            plannedToll: frozenToll,
            plannedTollFrozenAt: new Date(),
            status: 'route_planned',
          })
          .where(eq(trips.id, created.id))

        await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.secondDriverId,
              driverName: 'Segundo Motorista',
              driverTaxId: '22222222222',
              position: 1,
            },
          ],
          tripId: created.id,
          vehicleId: fleet.firstVehicleId,
        })

        const state = await readCrewState(database.db, {
          companyId: fleet.companyId,
          tripId: created.id,
        })
        expect(state.driverIds).toEqual([fleet.secondDriverId])
        expect(state.vehicleId).toBe(fleet.firstVehicleId)
        expect(state.status).toBe('route_planned')
        expectStatusDerivedFromStoredCrew(state, { routeSurvived: true })

        const [routeRow] = await database.db
          .select({
            plannedDistanceMeters: trips.plannedDistanceMeters,
            plannedRoute: trips.plannedRoute,
            plannedRouteFrozenAt: trips.plannedRouteFrozenAt,
            plannedToll: trips.plannedToll,
            plannedTollFrozenAt: trips.plannedTollFrozenAt,
          })
          .from(trips)
          .where(eq(trips.id, created.id))
        expect(routeRow?.plannedRoute).toEqual(frozenRoute)
        expect(routeRow?.plannedToll).toEqual(frozenToll)
        expect(routeRow?.plannedDistanceMeters).toBe(42_000)
        expect(routeRow?.plannedRouteFrozenAt).not.toBeNull()
        expect(routeRow?.plannedTollFrozenAt).not.toBeNull()
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  /** Spec 217 D2: da separação em diante a troca é recusada, e o nome da recusa diz o motivo. */
  testWithPostgres(
    'a separação iniciada recusa a troca',
    async () => {
      await withDisposableDatabase(async (database) => {
        const fleet = await seedCompanyFleet(database.db)
        const repository = new DrizzleTripRepository(database.db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        await database.db
          .update(trips)
          .set({ status: 'separating' })
          .where(eq(trips.id, created.id))

        await expect(
          repository.updateCrew({
            actorUserId: fleet.userId,
            channel: TRIP_FIELD_CHANNELS.backoffice,
            companyId: fleet.companyId,
            crew: [
              {
                driverId: fleet.secondDriverId,
                driverName: 'Segundo Motorista',
                driverTaxId: '22222222222',
                position: 1,
              },
            ],
            tripId: created.id,
            vehicleId: fleet.firstVehicleId,
          }),
        ).rejects.toThrow('TRIP_SEPARATION_STARTED')

        const state = await readCrewState(database.db, {
          companyId: fleet.companyId,
          tripId: created.id,
        })
        expect(state.driverIds).toEqual([fleet.firstDriverId])
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'troca a tripulação de uma viagem draft para outro motorista e veículo',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        expect(created.status).toBe('draft')

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.secondDriverId,
              driverName: 'Segundo Motorista',
              driverTaxId: '22222222222',
              position: 1,
            },
          ],
          tripId: created.id,
          vehicleId: fleet.secondVehicleId,
        })

        expect(updated?.status).toBe('draft')

        const [tripRow] = await db
          .select({ vehicleId: trips.vehicleId })
          .from(trips)
          .where(eq(trips.id, created.id))
        expect(tripRow?.vehicleId).toBe(fleet.secondVehicleId)

        const drivers = await db
          .select({ driverId: tripDrivers.driverId })
          .from(tripDrivers)
          .where(
            and(eq(tripDrivers.companyId, fleet.companyId), eq(tripDrivers.tripId, created.id)),
          )
        expect(drivers).toEqual([{ driverId: fleet.secondDriverId }])
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'recusa a troca depois que o roteiro já foi planejado',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        await db.update(trips).set({ status: 'route_planned' }).where(eq(trips.id, created.id))

        await expect(
          repository.updateCrew({
            actorUserId: fleet.userId,
            channel: TRIP_FIELD_CHANNELS.backoffice,
            companyId: fleet.companyId,
            crew: [
              {
                driverId: fleet.secondDriverId,
                driverName: 'Segundo Motorista',
                driverTaxId: '22222222222',
                position: 1,
              },
            ],
            tripId: created.id,
            vehicleId: fleet.secondVehicleId,
          }),
        ).rejects.toThrow(TripStateTransitionNotAllowedError)

        const [tripRow] = await db
          .select({ vehicleId: trips.vehicleId })
          .from(trips)
          .where(eq(trips.id, created.id))
        expect(tripRow?.vehicleId).toBe(fleet.firstVehicleId)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
  testWithPostgres(
    'define o par completo numa viagem awaiting_crew e grava draft no banco',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)
        const tripId = await createAwaitingCrewTrip(db, fleet)

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          tripId,
          vehicleId: fleet.firstVehicleId,
        })
        expect(updated?.status).toBe('draft')

        const state = await readCrewState(db, { companyId: fleet.companyId, tripId })
        expect(state.status).toBe('draft')
        expect(state.vehicleId).toBe(fleet.firstVehicleId)
        expect(state.driverIds).toEqual([fleet.firstDriverId])
        expectStatusDerivedFromStoredCrew(state)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'só o veículo não promove a viagem awaiting_crew, e o veículo fica gravado',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)
        const tripId = await createAwaitingCrewTrip(db, fleet)

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [],
          tripId,
          vehicleId: fleet.firstVehicleId,
        })
        expect(updated?.status).toBe('awaiting_crew')

        const state = await readCrewState(db, { companyId: fleet.companyId, tripId })
        expect(state.status).toBe('awaiting_crew')
        expect(state.vehicleId).toBe(fleet.firstVehicleId)
        expect(state.driverIds).toEqual([])
        expectStatusDerivedFromStoredCrew(state)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'só o motorista não promove a viagem awaiting_crew, e o veículo segue nulo',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)
        const tripId = await createAwaitingCrewTrip(db, fleet)

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          tripId,
          vehicleId: null,
        })
        expect(updated?.status).toBe('awaiting_crew')

        const state = await readCrewState(db, { companyId: fleet.companyId, tripId })
        expect(state.status).toBe('awaiting_crew')
        expect(state.vehicleId).toBeNull()
        expect(state.driverIds).toEqual([fleet.firstDriverId])
        expectStatusDerivedFromStoredCrew(state)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'desfazer a tripulação de uma viagem draft regride para awaiting_crew no banco',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        expect(created.status).toBe('draft')

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [],
          tripId: created.id,
          vehicleId: null,
        })
        expect(updated?.status).toBe('awaiting_crew')

        const state = await readCrewState(db, {
          companyId: fleet.companyId,
          tripId: created.id,
        })
        expect(state.status).toBe('awaiting_crew')
        expect(state.vehicleId).toBeNull()
        expect(state.driverIds).toEqual([])
        expectStatusDerivedFromStoredCrew(state)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
})
