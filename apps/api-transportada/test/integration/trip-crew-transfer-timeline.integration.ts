/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 RF4: a transferência de tripulação na linha do tempo da viagem, lida do banco — o retrato
 * em `jsonb` volta como lista, o autor volta com nome, e o cursor atravessa a fonte nova sem repetir
 * nem pular item.
 */
import { describe, expect, test } from 'bun:test'

import { identityUserProfiles } from '../../src/database/database.schema.js'
import type { TripTimelineItem } from '../../src/trips/application/trip-timeline.types.js'
import {
  listTripTimeline,
  parseTripTimelineCursor,
} from '../../src/trips/infrastructure/trip-timeline.query.js'
import {
  seedOnRoadTrip,
  transferRequest,
  useSharedRaceDatabase,
  type CrewTransferWorld,
} from '../fixtures/trip-crew-transfer.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const TEST_TIMEOUT_MS = 60_000
const ACTOR_NAME = 'Maria Operadora'

const raceDatabase = useSharedRaceDatabase(databaseUrl)

async function newWorldWithNamedActor(): Promise<CrewTransferWorld> {
  const world = await seedOnRoadTrip(raceDatabase().database)
  await raceDatabase()
    .database.db.insert(identityUserProfiles)
    .values({
      contactAddress: 'maria@example.com',
      contactChannel: 'email',
      name: ACTOR_NAME,
      userId: world.trip.userId,
      username: `maria.${world.trip.userId.slice(0, 8)}`,
    })
  return world
}

async function readTimelinePage(
  world: CrewTransferWorld,
  input: { readonly cursor: string | null; readonly limit: number },
) {
  return listTripTimeline(raceDatabase().database.db, {
    companyId: world.trip.companyId,
    cursor: input.cursor === null ? null : parseTripTimelineCursor(input.cursor),
    limit: input.limit,
    tripId: world.trip.tripId,
  })
}

async function readAllPageByPage(world: CrewTransferWorld, limit: number) {
  const items: TripTimelineItem[] = []
  let cursor: string | null = null
  do {
    const page: Awaited<ReturnType<typeof readTimelinePage>> = await readTimelinePage(world, {
      cursor,
      limit,
    })
    items.push(...page.items)
    cursor = page.nextCursor
  } while (cursor !== null)
  return items
}

describe('a transferência na linha do tempo da viagem (spec 249 RF4)', () => {
  testWithPostgres(
    'aparece com autor, motivo, quem saiu, quem entrou, diferença de custo e aviso de MDF-e',
    async () => {
      const world = await newWorldWithNamedActor()
      const request = transferRequest(world, {
        driverIds: [world.bruno.id],
        helperIds: [world.carla.id],
      })
      const { transfer } = await world.useCase.transferCrew(request)

      const { items } = await readTimelinePage(world, { cursor: null, limit: 100 })

      const item = items.find((candidate) => candidate.kind === 'crew_transfer')
      expect(item).toMatchObject({
        actorName: ACTOR_NAME,
        channel: 'backoffice',
        id: transfer.id,
        location: null,
        locationState: null,
      })
      expect(item?.crewTransfer).toEqual({
        costDifference: '500.00',
        mdfeDriverDivergence: false,
        nextCrew: [
          { driverId: world.bruno.id, name: 'Bruno Lima', position: 1, role: 'driver' },
          { driverId: world.carla.id, name: 'Carla Dias', position: 2, role: 'helper' },
        ],
        previousCrew: [
          { driverId: world.ana.id, name: 'Motorista 185 T4.3', position: 1, role: 'driver' },
          { driverId: world.carla.id, name: 'Carla Dias', position: 2, role: 'helper' },
        ],
        reason: request.reason,
      })
      expect(Date.parse(item?.occurredAt ?? '')).not.toBeNaN()
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'só o item de transferência carrega crewTransfer — em outro kind nem null aparece',
    async () => {
      const world = await newWorldWithNamedActor()
      await world.useCase.transferCrew(transferRequest(world, { driverIds: [world.bruno.id] }))

      const { items } = await readTimelinePage(world, { cursor: null, limit: 100 })

      expect(items.some((item) => item.kind === 'trip.created')).toBe(true)
      for (const item of items) {
        expect(Object.hasOwn(item, 'crewTransfer')).toBe(item.kind === 'crew_transfer')
      }
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a transferência de outra viagem nunca entra',
    async () => {
      const world = await newWorldWithNamedActor()
      const stranger = await newWorldWithNamedActor()
      await stranger.useCase.transferCrew(
        transferRequest(stranger, { driverIds: [stranger.bruno.id] }),
      )

      const { items } = await readTimelinePage(world, { cursor: null, limit: 100 })

      expect(items.filter((item) => item.kind === 'crew_transfer')).toEqual([])
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o cursor atravessa a fonte nova: de um em um, a mesma lista, sem repetir nem pular',
    async () => {
      const world = await newWorldWithNamedActor()
      await world.useCase.transferCrew(transferRequest(world, { driverIds: [world.bruno.id] }))
      await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.carla.id], helperIds: [world.diogo.id] }),
      )
      await world.useCase.transferCrew(transferRequest(world, { driverIds: [world.ana.id] }))

      const whole = await readTimelinePage(world, { cursor: null, limit: 100 })
      const oneByOne = await readAllPageByPage(world, 1)
      const twoByTwo = await readAllPageByPage(world, 2)

      const wholeIds = whole.items.map((item) => item.id)
      expect(new Set(wholeIds).size).toBe(wholeIds.length)
      expect(oneByOne.map((item) => item.id)).toEqual(wholeIds)
      expect(twoByTwo.map((item) => item.id)).toEqual(wholeIds)
      expect(whole.items.filter((item) => item.kind === 'crew_transfer')).toHaveLength(3)
      // Do mais recente para o mais antigo: a última transferência (volta da Ana) vem primeiro.
      expect(whole.items[0]?.kind).toBe('crew_transfer')
      expect(whole.items[0]?.crewTransfer?.nextCrew.map((member) => member.driverId)).toEqual([
        world.ana.id,
      ])
    },
    TEST_TIMEOUT_MS,
  )
})
