/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T1.6: duas transferências da mesma viagem ao mesmo tempo. Sorte não é prova — as corridas
 * seguram a trava da viagem numa transação bloqueadora e só a soltam quando `pg_stat_activity` mostra
 * as escritas **paradas no lock**; a intercalação vem do Postgres, não do relógio.
 */
import { describe, expect, test } from 'bun:test'
import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { trips } from '../../src/database/database.schema.js'
import { parseCrewSnapshot } from '../../src/trips/domain/trip-crew-transfer.policy.js'
import { waitForLockWaiters } from '../fixtures/trip-dispatch-race.fixture.js'
import {
  seedOnRoadTrip,
  transferRequest,
  useSharedRaceDatabase,
  type CrewTransferWorld,
} from '../fixtures/trip-crew-transfer.fixture.js'
import { readCrewEvents, readStoredCrew } from '../fixtures/trip-crew-transfer-read.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const RACE_TIMEOUT_MS = 90_000
const SETTLE_GRACE_MS = 300

const raceDatabase = useSharedRaceDatabase(databaseUrl)

function opened() {
  return raceDatabase()
}

type HeldTransaction = Parameters<Parameters<DrizzleProvider['db']['transaction']>[0]>[0]

/** Segura `SELECT trips … FOR NO KEY UPDATE` até `release()` — a trava que a transferência disputa. */
async function holdTripLock(
  database: DrizzleProvider,
  tripId: string,
  beforeCommit?: (transaction: HeldTransaction) => Promise<void>,
) {
  const locked = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  const transaction = database.db.transaction(async (tx) => {
    await tx.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)).for('no key update')
    locked.resolve()
    await released.promise
    await beforeCommit?.(tx)
  })
  await locked.promise
  return {
    async release(): Promise<void> {
      released.resolve()
      await transaction
    },
  }
}

async function raceTransfers(
  world: CrewTransferWorld,
  requests: readonly ReturnType<typeof transferRequest>[],
) {
  const { database, monitor } = opened()
  const blocker = await holdTripLock(database, world.trip.tripId)
  const settled = Promise.allSettled(requests.map((request) => world.useCase.transferCrew(request)))
  await waitForLockWaiters(monitor, requests.length)
  await blocker.release()
  return settled
}

describe('duas transferências da mesma viagem ao mesmo tempo (spec 249 RF2)', () => {
  testWithPostgres(
    'pedidos idênticos: um vence e o outro recebe TRIP_CREW_UNCHANGED, com um só evento',
    async () => {
      const world = await seedOnRoadTrip(opened().database)
      const request = () => transferRequest(world, { driverIds: [world.bruno.id] })

      const outcomes = await raceTransfers(world, [request(), request()])

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected'])
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        code: 'TRIP_CREW_UNCHANGED',
        status: 409,
      })
      expect(await readCrewEvents(opened().database, world.trip.tripId)).toHaveLength(1)
      expect(await readStoredCrew(opened().database, world.trip.tripId)).toEqual([
        { driverId: world.bruno.id, position: 1, role: 'driver' },
      ])
    },
    RACE_TIMEOUT_MS,
  )

  testWithPostgres(
    'pedidos diferentes: os dois valem, em série, e o histórico encadeia sem perder nenhum',
    async () => {
      const world = await seedOnRoadTrip(opened().database)

      const outcomes = await raceTransfers(world, [
        transferRequest(world, { driverIds: [world.bruno.id], helperIds: [world.carla.id] }),
        transferRequest(world, { driverIds: [world.carla.id], helperIds: [world.diogo.id] }),
      ])

      expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled'])
      const events = await readCrewEvents(opened().database, world.trip.tripId)
      expect(events).toHaveLength(2)
      const [first, second] = events
      // O segundo parte de onde o primeiro chegou: nenhuma foto de "antes" ficou velha.
      expect(parseCrewSnapshot(second?.previousCrew)).toEqual(parseCrewSnapshot(first?.nextCrew))
      expect(second?.costBefore).toBe(first?.costAfter)
      expect(parseCrewSnapshot(first?.previousCrew).map((member) => member.driverId)).toEqual([
        world.ana.id,
        world.carla.id,
      ])
      // A tripulação gravada é exatamente a do último evento, nunca uma mistura das duas.
      expect(
        (await readStoredCrew(opened().database, world.trip.tripId)).map(
          (member) => member.driverId,
        ),
      ).toEqual(parseCrewSnapshot(second?.nextCrew).map((member) => member.driverId))
      for (const event of events) {
        expect(
          BigInt(event.costBefore.replace('.', '')) + BigInt(event.costDifference.replace('.', '')),
        ).toBe(BigInt(event.costAfter.replace('.', '')))
      }
    },
    RACE_TIMEOUT_MS,
  )

  testWithPostgres(
    'enquanto outra escrita segura a viagem, a transferência espera — não passa por cima',
    async () => {
      const world = await seedOnRoadTrip(opened().database)
      const blocker = await holdTripLock(opened().database, world.trip.tripId)

      const transfer = world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.bruno.id] }),
      )
      let settled = false
      transfer.finally(() => {
        settled = true
      })
      await waitForLockWaiters(opened().monitor, 1)
      await Bun.sleep(SETTLE_GRACE_MS)

      expect(settled).toBe(false)
      expect(await readCrewEvents(opened().database, world.trip.tripId)).toEqual([])

      await blocker.release()
      await transfer
      expect(await readCrewEvents(opened().database, world.trip.tripId)).toHaveLength(1)
    },
    RACE_TIMEOUT_MS,
  )

  testWithPostgres(
    'a viagem fecha enquanto a transferência espera o lock: a janela é reconferida e nada é gravado',
    async () => {
      const world = await seedOnRoadTrip(opened().database)
      /** O cancelamento precisa acontecer **dentro** da transação que segura a trava: de fora ele esperaria. */
      const blocker = await holdTripLock(opened().database, world.trip.tripId, async (held) => {
        await held.update(trips).set({ status: 'cancelled' }).where(eq(trips.id, world.trip.tripId))
      })

      const transfer = world.useCase
        .transferCrew(transferRequest(world, { driverIds: [world.bruno.id] }))
        .catch((caught: unknown) => caught)
      await waitForLockWaiters(opened().monitor, 1)
      await blocker.release()

      expect(await transfer).toMatchObject({
        code: 'STATE_TRANSITION_NOT_ALLOWED',
        reason: 'TRIP_CANCELLED',
      })
      expect(await readCrewEvents(opened().database, world.trip.tripId)).toEqual([])
      expect(await readStoredCrew(opened().database, world.trip.tripId)).toHaveLength(2)
    },
    RACE_TIMEOUT_MS,
  )
})
