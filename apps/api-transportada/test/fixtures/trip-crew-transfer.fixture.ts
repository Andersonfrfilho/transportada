/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T1.6: uma viagem **na rua** contra Postgres de verdade — roteiro congelado, pedágio, ETA e
 * duas notas — e quatro pessoas para revezar nela, com diárias diferentes de propósito (é o que
 * faz a diferença de custo não ser zero). Pool de dez conexões, `prepare: false`
 * (`createDatabaseProvider`), como em produção.
 */
import { afterAll, beforeAll } from 'bun:test'
import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import {
  companyCrewSettings,
  fleetDrivers,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { trips } from '../../src/database/trip.schema.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import {
  seedRaceTrip,
  withRaceDatabase,
  type RaceDatabase,
  type RaceTrip,
} from './trip-dispatch-race.fixture.js'

export type CrewPerson = {
  readonly id: string
  readonly membershipId: string
  readonly name: string
}

export type CrewTransferWorld = {
  readonly ana: CrewPerson
  readonly bruno: CrewPerson
  readonly carla: CrewPerson
  readonly diogo: CrewPerson
  readonly database: DrizzleProvider
  readonly repository: DrizzleTripRepository
  readonly trip: RaceTrip
  /** O caso de uso real, com o repositório real. */
  readonly useCase: ReturnType<typeof createTripUseCase>
}

const FROZEN_ROUTE = { criterion: 'cheapest', legs: [], points: [], signature: 'crew-transfer-249' }
const FROZEN_TOLL = { total: '12.34' }
const TWO_DAYS_SECONDS = 172_800

/**
 * Ana dirige (100,00/dia) e Carla ajuda (80,00/dia); Bruno dirige (350,00/dia); Carla também dirige
 * (sem diária própria: vale o padrão de 200,00); Diogo só ajuda (sem diária própria: vale a da
 * empresa, 60,00). A viagem paga dois dias.
 *
 * Antes: Ana + Carla ajudante = 2×100 + 2×80 = 360,00.
 */
export async function seedOnRoadTrip(database: DrizzleProvider): Promise<CrewTransferWorld> {
  const trip = await seedRaceTrip(database, { documentCount: 2 })
  const repository = new DrizzleTripRepository(database.db)

  const [seededDriver] = await database.db
    .select({ id: fleetDrivers.id, name: fleetDrivers.name })
    .from(fleetDrivers)
    .where(eq(fleetDrivers.companyId, trip.companyId))
  if (seededDriver === undefined) throw new Error('EXPECTED_SEEDED_DRIVER')

  const ana = await attachMembership(database, trip, seededDriver)
  await database.db
    .update(fleetDrivers)
    .set({ dailyAllowanceAmount: '100.0000' })
    .where(eq(fleetDrivers.id, ana.id))
  const bruno = await insertDriver(database, trip, {
    dailyAllowanceAmount: '350.0000',
    name: 'Bruno Lima',
    taxId: '33333333333',
  })
  const carla = await insertDriver(database, trip, {
    canActAsHelper: true,
    helperDailyRate: '80.0000',
    name: 'Carla Dias',
    taxId: '44444444444',
  })
  const diogo = await insertDriver(database, trip, {
    canActAsHelper: true,
    canDrive: false,
    name: 'Diogo Ajudante',
    taxId: '55555555555',
  })
  await database.db
    .insert(companyCrewSettings)
    .values({ companyId: trip.companyId, helperDailyRate: '60.0000' })

  await repository.updateCrew({
    actorUserId: trip.userId,
    channel: 'backoffice',
    companyId: trip.companyId,
    crew: [
      line({ person: ana, position: 1, role: 'driver', taxId: '22222222222' }),
      line({ person: carla, position: 2, role: 'helper', taxId: '44444444444' }),
    ],
    tripId: trip.tripId,
    vehicleId: await readVehicleId(database, trip),
  })
  await database.db
    .update(trips)
    .set({
      dailyAllowanceDays: 2,
      estimatedArrivalFrozenAt: new Date('2026-10-07T10:00:00.000Z'),
      etaDepartureAt: new Date('2026-10-07T08:00:00.000Z'),
      plannedDistanceMeters: 420_000,
      plannedDurationSeconds: TWO_DAYS_SECONDS,
      plannedJourneyIncludesReturn: true,
      plannedJourneySeconds: TWO_DAYS_SECONDS,
      plannedReturnDistanceMeters: 80_000,
      plannedRoute: FROZEN_ROUTE,
      plannedRouteFrozenAt: new Date('2026-10-07T07:00:00.000Z'),
      plannedToll: FROZEN_TOLL,
      plannedTollFrozenAt: new Date('2026-10-07T07:00:00.000Z'),
      status: 'in_transit',
    })
    .where(eq(trips.id, trip.tripId))

  return {
    ana,
    bruno,
    carla,
    database,
    diogo,
    repository,
    trip,
    useCase: createTripUseCase({ locations: { async purgeByTrip() {} }, repository }),
  }
}

/** O pedido que o painel manda: motoristas e ajudantes por id, mais o motivo. */
export function transferRequest(
  world: CrewTransferWorld,
  input: { readonly driverIds: readonly string[]; readonly helperIds?: readonly string[] },
) {
  return {
    context: { companyId: world.trip.companyId, userId: world.trip.userId },
    correlationId: `correlation-${crypto.randomUUID()}`,
    driverIds: input.driverIds,
    helperIds: input.helperIds ?? [],
    ipAddress: '203.0.113.7',
    reason: 'Motorista passou mal na estrada',
    tripId: world.trip.tripId,
  }
}

function line(input: {
  readonly person: CrewPerson
  readonly position: number
  readonly role: 'driver' | 'helper'
  readonly taxId: string
}) {
  return {
    driverId: input.person.id,
    driverName: input.person.name,
    driverTaxId: input.taxId,
    position: input.position,
    role: input.role,
  }
}

async function readVehicleId(database: DrizzleProvider, trip: RaceTrip): Promise<string> {
  const [row] = await database.db
    .select({ vehicleId: trips.vehicleId })
    .from(trips)
    .where(eq(trips.id, trip.tripId))
  if (row?.vehicleId === null || row === undefined) throw new Error('EXPECTED_TRIP_VEHICLE')
  return row.vehicleId
}

/** A ficha ganha vínculo com um usuário da empresa: é por ele que o app do motorista a encontra. */
async function attachMembership(
  database: DrizzleProvider,
  trip: RaceTrip,
  driver: { readonly id: string; readonly name: string },
): Promise<CrewPerson> {
  const membershipId = await insertMembership(database, trip.companyId)
  await database.db.update(fleetDrivers).set({ membershipId }).where(eq(fleetDrivers.id, driver.id))
  return { id: driver.id, membershipId, name: driver.name }
}

async function insertMembership(database: DrizzleProvider, companyId: string): Promise<string> {
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  return membershipId
}

async function insertDriver(
  database: DrizzleProvider,
  trip: RaceTrip,
  input: Partial<typeof fleetDrivers.$inferInsert> & {
    readonly name: string
    readonly taxId: string
  },
): Promise<CrewPerson> {
  const id = crypto.randomUUID()
  const membershipId = await insertMembership(database, trip.companyId)
  await database.db
    .insert(fleetDrivers)
    .values({ ...input, companyId: trip.companyId, id, membershipId })
  return { id, membershipId, name: input.name }
}

const SETUP_TIMEOUT_MS = 120_000

/**
 * Um banco migrado para o arquivo inteiro (a migração é o que custa); cada teste semeia a própria
 * empresa. Registra `beforeAll`/`afterAll` e devolve o acessor — sem URL, os testes se pulam sozinhos.
 */
export function useSharedRaceDatabase(databaseUrl: string | undefined): () => RaceDatabase {
  let opened: RaceDatabase | undefined
  let finish: (() => void) | undefined
  let session: Promise<void> | undefined

  beforeAll(async () => {
    if (databaseUrl === undefined) return
    const ready = Promise.withResolvers<void>()
    const done = Promise.withResolvers<void>()
    finish = done.resolve
    session = withRaceDatabase(databaseUrl, async (race) => {
      opened = race
      ready.resolve()
      await done.promise
    })
    session.catch(ready.reject)
    await ready.promise
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    finish?.()
    await session
  }, SETUP_TIMEOUT_MS)

  return () => {
    if (opened === undefined) throw new Error('DATABASE_NOT_READY')
    return opened
  }
}
