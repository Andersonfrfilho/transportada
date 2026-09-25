/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 T4.3 (CA09, RNF de idempotência, ADR-0068 §2): o despacho — automático ou pelo botão
 * "leva todas" — sai **uma vez** quando duas escritas concorrentes fecham a carga, sem 500, sem
 * 23505 do snapshot e sem evento `→ dispatched` duplicado.
 *
 * Contra Postgres de verdade, pool de dez conexões (`createDatabaseProvider`), chamadas disparadas
 * em paralelo pelos casos de uso reais. Sorte não é prova: as corridas "forçadas" seguram a trava
 * disputada numa transação bloqueadora e só a soltam depois que `pg_stat_activity` mostra as duas
 * escritas **paradas no lock** — a intercalação sai do Postgres, não do relógio. As "livres" rodam
 * sem nenhuma costura, para cobrir as intercalações que o escalonador escolher.
 */
import { describe, expect, test } from 'bun:test'
import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { tripDocuments, trips } from '../../src/database/trip.schema.js'
import {
  dispatchTrip,
  type DispatchTripPort,
} from '../../src/trips/application/dispatch-trip.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { DrizzleTripDocumentRepository } from '../../src/trips/infrastructure/drizzle-trip-document.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import {
  moveRaceDocument,
  readRaceOutcome,
  seedRaceTrip,
  waitForLockWaiters,
  withRaceDatabase,
  type RaceDatabase,
  type RaceTrip,
} from '../fixtures/trip-dispatch-race.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const ITERATIONS = 10
const RACE_TIMEOUT_MS = 180_000
const DISPATCHED_ONCE = {
  dispatchEventCount: 1,
  snapshotCount: 1,
  tripStatus: 'dispatched',
} as const

type RaceTransaction = Parameters<Parameters<DrizzleProvider['db']['transaction']>[0]>[0]

describe('despacho concorrente sai uma vez (spec 185 T4.3, CA09)', () => {
  testWithPostgres(
    'duas cargas simultâneas das duas últimas notas, forçadas a disputar a trava da viagem',
    async () => {
      await runIterations(async (race) => {
        const trip = await seedTripWithTwoSeparated(race)
        const outcomes = await raceLoadsOnTripLock(race, trip)

        expect(describeOutcomes(outcomes)).toEqual(['fulfilled', 'fulfilled'])
        // As duas leram a carga fechada e entraram no despacho; a perdedora recebe o `unchanged`.
        expect(fulfilledValues(outcomes).map((result) => result.autoDispatch)).toEqual([
          { outcome: 'dispatched' },
          { outcome: 'dispatched' },
        ])
        expect(await readRaceOutcome(race.database, trip)).toEqual({
          ...DISPATCHED_ONCE,
          documentStatuses: ['loaded', 'loaded', 'loaded'],
        })
      })
    },
    RACE_TIMEOUT_MS,
  )

  testWithPostgres(
    'duas cargas simultâneas das duas últimas notas, sem intercalação forçada',
    async () => {
      await runIterations(async (race) => {
        const trip = await seedTripWithTwoSeparated(race)
        const routeRepository = new DrizzleTripRouteRepository(race.database.db)
        const outcomes = await Promise.allSettled(
          trip.tripDocumentIds
            .slice(1)
            .map((documentId) => loadDocument(race, { documentId, routeRepository, trip })),
        )

        expect(describeOutcomes(outcomes)).toEqual(['fulfilled', 'fulfilled'])
        const dispatched = fulfilledValues(outcomes).filter(
          (result) => result.autoDispatch?.outcome === 'dispatched',
        )
        expect(dispatched.length).toBeGreaterThanOrEqual(1)
        expect(await readRaceOutcome(race.database, trip)).toEqual({
          ...DISPATCHED_ONCE,
          documentStatuses: ['loaded', 'loaded', 'loaded'],
        })
      })
    },
    RACE_TIMEOUT_MS,
  )

  testWithPostgres(
    'dois "leva todas" simultâneos, forçados a disputar a trava da nota separada',
    async () => {
      await runIterations(async (race) => {
        const trip = await seedTripWithOneSeparated(race)
        const routeRepository = new DrizzleTripRouteRepository(race.database.db)
        const separatedId = trip.tripDocumentIds[1] as string

        const blocker = await holdLock(race.database, (transaction) =>
          transaction
            .select({ id: tripDocuments.id })
            .from(tripDocuments)
            .where(eq(tripDocuments.id, separatedId))
            .for('no key update'),
        )
        const dispatches = Promise.allSettled([
          dispatchLoadingRemaining(trip, routeRepository),
          dispatchLoadingRemaining(trip, routeRepository),
        ])
        await blocker.releaseAfter(() => waitForLockWaiters(race.monitor, 2))
        const outcomes = await dispatches

        expect(describeOutcomes(outcomes)).toEqual(['fulfilled', 'fulfilled'])
        expect(fulfilledValues(outcomes)).toEqual([
          { tripStatus: 'dispatched' },
          { tripStatus: 'dispatched' },
        ])
        expect(await readRaceOutcome(race.database, trip)).toEqual({
          ...DISPATCHED_ONCE,
          documentStatuses: ['loaded', 'loaded'],
        })
      })
    },
    RACE_TIMEOUT_MS,
  )

  /**
   * O duplo clique de verdade: as duas leituras de precondição acontecem antes de qualquer escrita
   * (as duas veem a nota `separated`), mas a transação da segunda só começa depois que a primeira
   * comitou — ela encontra a viagem já `dispatched` ao reler o status para carregar a nota.
   */
  testWithPostgres(
    'dois "leva todas" simultâneos com precondição velha: o segundo entra depois do primeiro comitar',
    async () => {
      await runIterations(async (race) => {
        const trip = await seedTripWithOneSeparated(race)
        const routeRepository = new DrizzleTripRouteRepository(race.database.db)
        const readings = createArrivalGate(2)
        const winnerCommitted = Promise.withResolvers<void>()
        const port = (isWinner: boolean): DispatchTripPort => ({
          dispatch: async (input) => {
            if (!isWinner) {
              await winnerCommitted.promise
              return routeRepository.dispatch(input)
            }
            try {
              return await routeRepository.dispatch(input)
            } finally {
              winnerCommitted.resolve()
            }
          },
          readPreconditions: async (query) => {
            const preconditions = await routeRepository.readPreconditions(query)
            await readings.arrive()
            return preconditions
          },
        })

        const dispatches = Promise.allSettled([
          dispatchLoadingRemaining(trip, port(true)),
          dispatchLoadingRemaining(trip, port(false)),
        ])
        await readings.allArrived
        readings.open()
        const outcomes = await dispatches

        expect(describeOutcomes(outcomes)).toEqual(['fulfilled', 'fulfilled'])
        expect(fulfilledValues(outcomes)).toEqual([
          { tripStatus: 'dispatched' },
          { tripStatus: 'dispatched' },
        ])
        expect(await readRaceOutcome(race.database, trip)).toEqual({
          ...DISPATCHED_ONCE,
          documentStatuses: ['loaded', 'loaded'],
        })
      })
    },
    RACE_TIMEOUT_MS,
  )

  testWithPostgres(
    'dois "leva todas" simultâneos, sem intercalação forçada',
    async () => {
      await runIterations(async (race) => {
        const trip = await seedTripWithOneSeparated(race)
        const routeRepository = new DrizzleTripRouteRepository(race.database.db)
        const outcomes = await Promise.allSettled([
          dispatchLoadingRemaining(trip, routeRepository),
          dispatchLoadingRemaining(trip, routeRepository),
        ])

        expect(describeOutcomes(outcomes)).toEqual(['fulfilled', 'fulfilled'])
        expect(fulfilledValues(outcomes)).toEqual([
          { tripStatus: 'dispatched' },
          { tripStatus: 'dispatched' },
        ])
        expect(await readRaceOutcome(race.database, trip)).toEqual({
          ...DISPATCHED_ONCE,
          documentStatuses: ['loaded', 'loaded'],
        })
      })
    },
    RACE_TIMEOUT_MS,
  )
})

async function runIterations(iteration: (race: RaceDatabase) => Promise<void>): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withRaceDatabase(databaseUrl, async (race) => {
    // Em série de propósito: cada iteração é uma corrida isolada, numa viagem nova.
    for (let index = 0; index < ITERATIONS; index += 1) {
      await iteration(race)
    }
  })
}

/** Três notas: a primeira `loaded`, as duas últimas `separated` — cada carga fecha metade do resto. */
async function seedTripWithTwoSeparated(race: RaceDatabase): Promise<RaceTrip> {
  const trip = await seedRaceTrip(race.database, { documentCount: 3 })
  const [loadedId, ...separatedIds] = trip.tripDocumentIds as [string, string, string]
  await moveRaceDocument(race.database, {
    actions: ['separate', 'load'],
    documentId: loadedId,
    trip,
  })
  for (const documentId of separatedIds) {
    await moveRaceDocument(race.database, { actions: ['separate'], documentId, trip })
  }
  return trip
}

/** Duas notas: a primeira `loaded`, a segunda `separated` — o "leva todas" carrega a segunda. */
async function seedTripWithOneSeparated(race: RaceDatabase): Promise<RaceTrip> {
  const trip = await seedRaceTrip(race.database, { documentCount: 2 })
  const [loadedId, separatedId] = trip.tripDocumentIds as [string, string]
  await moveRaceDocument(race.database, {
    actions: ['separate', 'load'],
    documentId: loadedId,
    trip,
  })
  await moveRaceDocument(race.database, { actions: ['separate'], documentId: separatedId, trip })
  return trip
}

/**
 * As duas cargas comitam, e só então cada gatilho lê a precondição — as duas veem a carga fechada.
 * Com a viagem travada por fora, as duas transações de despacho param no `FOR NO KEY UPDATE`; a
 * trava só é solta quando o Postgres mostra as duas esperando.
 */
async function raceLoadsOnTripLock(
  race: RaceDatabase,
  trip: RaceTrip,
): Promise<PromiseSettledResult<Awaited<ReturnType<typeof transitionTripDocument>>>[]> {
  const routeRepository = new DrizzleTripRouteRepository(race.database.db)
  const triggers = createArrivalGate(2)
  const gatedRepository: DispatchTripPort = {
    dispatch: (input) => routeRepository.dispatch(input),
    readPreconditions: async (query) => {
      await triggers.arrive()
      return routeRepository.readPreconditions(query)
    },
  }

  const loads = Promise.allSettled(
    trip.tripDocumentIds
      .slice(1)
      .map((documentId) =>
        loadDocument(race, { documentId, routeRepository: gatedRepository, trip }),
      ),
  )
  const firstToSettle = await Promise.race([
    triggers.allArrived.then(() => 'triggers' as const),
    loads.then(() => 'loads' as const),
  ])
  if (firstToSettle === 'loads') throw new Error('LOADS_SETTLED_BEFORE_BOTH_TRIGGERS')

  const blocker = await holdLock(race.database, (transaction) =>
    transaction
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.id, trip.tripId))
      .for('no key update'),
  )
  triggers.open()
  await blocker.releaseAfter(() => waitForLockWaiters(race.monitor, 2))
  return loads
}

function loadDocument(
  race: RaceDatabase,
  input: {
    readonly documentId: string
    readonly routeRepository: DispatchTripPort
    readonly trip: RaceTrip
  },
): ReturnType<typeof transitionTripDocument> {
  return transitionTripDocument({
    action: 'load',
    actorUserId: input.trip.userId,
    autoDispatch: { logger: { error: () => {} }, repository: input.routeRepository },
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId: input.trip.companyId,
    documentId: input.documentId,
    repository: new DrizzleTripDocumentRepository(race.database.db),
    tripId: input.trip.tripId,
  })
}

function dispatchLoadingRemaining(
  trip: RaceTrip,
  repository: DispatchTripPort,
): ReturnType<typeof dispatchTrip> {
  return dispatchTrip({
    actorUserId: trip.userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId: trip.companyId,
    loadRemaining: true,
    repository,
    tripId: trip.tripId,
  })
}

/** Barreira: `allArrived` quando `count` chamadas chegaram; todas seguem só depois de `open()`. */
function createArrivalGate(count: number): {
  readonly allArrived: Promise<void>
  arrive(): Promise<void>
  open(): void
} {
  const arrived = Promise.withResolvers<void>()
  const opened = Promise.withResolvers<void>()
  let arrivals = 0
  return {
    allArrived: arrived.promise,
    arrive() {
      arrivals += 1
      if (arrivals >= count) arrived.resolve()
      return opened.promise
    },
    open() {
      opened.resolve()
    },
  }
}

/**
 * Transação bloqueadora: toma a trava e a segura até `releaseAfter` — que solta sempre, mesmo se a
 * espera falhar, para nenhuma iteração ficar presa.
 */
async function holdLock(
  database: DrizzleProvider,
  lock: (transaction: RaceTransaction) => Promise<unknown>,
): Promise<{ releaseAfter(waiting: () => Promise<void>): Promise<void> }> {
  const acquired = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  const done = database.db.transaction(async (transaction) => {
    await lock(transaction)
    acquired.resolve()
    await released.promise
  })
  await Promise.race([acquired.promise, done])

  return {
    async releaseAfter(waiting) {
      try {
        await waiting()
      } finally {
        released.resolve()
        await done
      }
    },
  }
}

function describeOutcomes(outcomes: readonly PromiseSettledResult<unknown>[]): readonly string[] {
  return outcomes.map((outcome) =>
    outcome.status === 'fulfilled' ? 'fulfilled' : `rejected: ${String(outcome.reason)}`,
  )
}

function fulfilledValues<TValue>(outcomes: readonly PromiseSettledResult<TValue>[]): TValue[] {
  return outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []))
}
