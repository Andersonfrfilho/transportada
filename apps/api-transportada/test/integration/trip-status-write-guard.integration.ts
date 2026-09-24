/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T13 (defeito 29 de PERGUNTAS-ABERTAS.md, ADR-0068 "Consequências"): `dispatch`,
 * `markRoutePlanned`, `markCancelled` e `close` liam a `from_status` fora da transação e escreviam
 * sem conferir que ela ainda valia — uma corrida podia gravar em `trip_status_events` uma transição
 * que a política já tinha proibido.
 *
 * Cada teste abaixo monta uma corrida de verdade contra Postgres: uma transação "bloqueadora"
 * segura o `SELECT … FOR NO KEY UPDATE` da viagem e, só depois que o escritor real já está
 * bloqueado esperando o mesmo lock, muda o status para um que torna a escrita do escritor inválida
 * — e então libera. O escritor nunca é enganado por um mock: ele lê o status real, já mudado, na
 * mesma transação em que grava. Não há `pg_sleep` nem espera de relógio: a exclusão vem do lock de
 * linha do próprio Postgres.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { SQL } from 'bun'
import { asc, eq } from 'drizzle-orm'

import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { trips, tripStatusEvents, type TripStatus } from '../../src/database/trip.schema.js'
import { dispatchTrip } from '../../src/trips/application/dispatch-trip.use-case.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describe('guarda de origem nos escritores de trips.status (spec 158 T13, defeito 29)', () => {
  testWithPostgres(
    'close perde a corrida para uma viagem cancelada por outra transação, e devolve conflito',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedTrip(database, { status: 'in_transit' })
        const repository = new DrizzleTripRepository(database.db)

        const race = await raceAgainstBlocker(database, {
          blockerNextStatus: 'cancelled',
          tripId: seed.tripId,
          loser: () =>
            repository.close({
              actorUserId: seed.userId,
              channel: TRIP_FIELD_CHANNELS.backoffice,
              closeReason: null,
              companyId: seed.companyId,
              correlationId: crypto.randomUUID(),
              ipAddress: '127.0.0.1',
              onBehalfOfDriverId: null,
              tripId: seed.tripId,
            }),
        })

        expect(race.loserError).toBeInstanceOf(TripStateTransitionNotAllowedError)
        expect((race.loserError as TripStateTransitionNotAllowedError).reason).toBe(
          'TRIP_CANCELLED',
        )

        const finalTrip = await readTripStatus(database, seed.tripId)
        expect(finalTrip).toBe('cancelled')

        // O bloqueador é a transação concorrente que venceu a corrida, não um escritor de
        // produção — ele só finge "alguém mudou o status enquanto isso", sem passar por
        // `recordTripStatusChange`. O que a guarda promete é que o PERDEDOR não grava evento
        // nenhum para uma transição que a política já tinha proibido.
        const events = await readStatusEvents(database, seed.tripId)
        expect(events).toEqual([])
      })
    },
  )

  testWithPostgres(
    'markCancelled perde a corrida para uma viagem encerrada por outra transação, e devolve conflito',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedTrip(database, { status: 'in_transit' })
        const repository = new DrizzleTripRouteRepository(database.db)

        const race = await raceAgainstBlocker(database, {
          blockerNextStatus: 'completed',
          tripId: seed.tripId,
          loser: () =>
            repository.markCancelled({
              actorUserId: seed.userId,
              channel: TRIP_FIELD_CHANNELS.backoffice,
              companyId: seed.companyId,
              onBehalfOfDriverId: null,
              tripId: seed.tripId,
            }),
        })

        expect(race.loserError).toBeInstanceOf(TripStateTransitionNotAllowedError)
        expect((race.loserError as TripStateTransitionNotAllowedError).reason).toBe(
          'TRIP_COMPLETED',
        )

        const finalTrip = await readTripStatus(database, seed.tripId)
        expect(finalTrip).toBe('completed')

        const events = await readStatusEvents(database, seed.tripId)
        expect(events).toEqual([])
      })
    },
  )

  testWithPostgres(
    'dispatch perde a corrida para uma viagem cancelada por outra transação, e devolve conflito',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedTrip(database, { status: 'route_planned' })
        const repository = new DrizzleTripRouteRepository(database.db)

        const race = await raceAgainstBlocker(database, {
          blockerNextStatus: 'cancelled',
          tripId: seed.tripId,
          loser: () =>
            dispatchTrip({
              actorUserId: seed.userId,
              channel: TRIP_FIELD_CHANNELS.backoffice,
              companyId: seed.companyId,
              // A leitura de precondições acontece antes da corrida começar (fora da
              // transação, como o defeito 29 descreve); `hasRoute: true` chega intacto ao
              // escritor, que reconfere o status por conta própria depois do lock. `dispatch`
              // é encaminhado para a instância real — só a leitura anterior à corrida é falsa.
              repository: {
                dispatch: (writeInput) => repository.dispatch(writeInput),
                async readPreconditions() {
                  return {
                    hasRoute: true,
                    isCargoClosed: true,
                    leftBehind: [],
                    toLoad: [],
                    tripStatus: 'route_planned',
                    unloadedDocumentIds: [],
                    unscheduledStopIds: [],
                  }
                },
              },
              tripId: seed.tripId,
            }),
        })

        expect(race.loserError).toBeInstanceOf(TripStateTransitionNotAllowedError)
        expect((race.loserError as TripStateTransitionNotAllowedError).reason).toBe(
          'TRIP_CANCELLED',
        )

        const finalTrip = await readTripStatus(database, seed.tripId)
        expect(finalTrip).toBe('cancelled')

        const events = await readStatusEvents(database, seed.tripId)
        expect(events).toEqual([])
      })
    },
  )

  testWithPostgres(
    'markRoutePlanned perde a corrida para uma viagem cancelada por outra transação, e devolve conflito',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedTrip(database, { status: 'draft' })
        const repository = new DrizzleTripRouteRepository(database.db)

        const race = await raceAgainstBlocker(database, {
          blockerNextStatus: 'cancelled',
          tripId: seed.tripId,
          loser: () =>
            planTripRoute({
              actorUserId: seed.userId,
              channel: TRIP_FIELD_CHANNELS.backoffice,
              companyId: seed.companyId,
              repository: {
                markRoutePlanned: (writeInput) => repository.markRoutePlanned(writeInput),
                async readRouteState() {
                  return { hasRoute: true, tripStatus: 'draft' }
                },
              },
              tripId: seed.tripId,
            }),
        })

        expect(race.loserError).toBeInstanceOf(TripStateTransitionNotAllowedError)
        expect((race.loserError as TripStateTransitionNotAllowedError).reason).toBe(
          'TRIP_CANCELLED',
        )

        const finalTrip = await readTripStatus(database, seed.tripId)
        expect(finalTrip).toBe('cancelled')

        const events = await readStatusEvents(database, seed.tripId)
        expect(events).toEqual([])
      })
    },
  )
})

type SeededTrip = {
  readonly companyId: string
  readonly tripId: string
  readonly userId: string
}

async function seedTrip(
  database: TestDatabase,
  input: { readonly status: TripStatus },
): Promise<SeededTrip> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const tripId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId,
  })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'ABC1D23',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    name: 'Motorista da corrida',
    taxId: '11111111111',
  })
  await database.db.insert(trips).values({
    companyId,
    id: tripId,
    status: input.status,
    vehicleId,
  })

  return { companyId, tripId, userId }
}

async function readTripStatus(database: TestDatabase, tripId: string): Promise<TripStatus> {
  const [row] = await database.db
    .select({ status: trips.status })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1)
  if (row === undefined) throw new Error('EXPECTED_TRIP')
  return row.status
}

async function readStatusEvents(
  database: TestDatabase,
  tripId: string,
): Promise<readonly { readonly fromStatus: TripStatus | null; readonly toStatus: TripStatus }[]> {
  return database.db
    .select({ fromStatus: tripStatusEvents.fromStatus, toStatus: tripStatusEvents.toStatus })
    .from(tripStatusEvents)
    .where(eq(tripStatusEvents.tripId, tripId))
    .orderBy(asc(tripStatusEvents.occurredAt), asc(tripStatusEvents.id))
}

type RaceResult = {
  readonly loserError: unknown
}

/**
 * Segura o lock da linha da viagem numa transação própria, deixa o escritor real bater nele e
 * ficar bloqueado, muda o status para `blockerNextStatus` e só então libera — o escritor real
 * acorda, relê o status (já mudado) na própria transação e decide sozinho, pela mesma política de
 * estado, se aquilo ainda é permitido.
 */
async function raceAgainstBlocker(
  database: TestDatabase,
  input: {
    readonly blockerNextStatus: TripStatus
    readonly loser: () => Promise<unknown>
    readonly tripId: string
  },
): Promise<RaceResult> {
  let resolveLockAcquired: () => void
  const lockAcquired = new Promise<void>((resolve) => {
    resolveLockAcquired = resolve
  })
  let releaseBlocker: () => void
  const blockerReleased = new Promise<void>((resolve) => {
    releaseBlocker = resolve
  })

  const blockerPromise = database.db.transaction(async (transaction) => {
    await transaction
      .select({ status: trips.status })
      .from(trips)
      .where(eq(trips.id, input.tripId))
      .for('no key update')
      .limit(1)
    resolveLockAcquired()
    await blockerReleased
    await transaction
      .update(trips)
      .set({ status: input.blockerNextStatus, updatedAt: new Date() })
      .where(eq(trips.id, input.tripId))
  })

  await lockAcquired

  // O escritor real dispara agora: o `SELECT … FOR NO KEY UPDATE` dele bate no lock que a
  // transação bloqueadora já segura, e ele fica parado ali até `releaseBlocker()`.
  const loserPromise = input.loser().then(
    () => ({ error: null }),
    (error: unknown) => ({ error }),
  )

  releaseBlocker!()
  await blockerPromise

  const loserOutcome = await loserPromise
  return { loserError: loserOutcome.error }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t158t13_${crypto.randomUUID().replaceAll('-', '')}`
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
