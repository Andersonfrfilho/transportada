/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T1.6: a transferência de tripulação de uma viagem **na rua**, contra Postgres de verdade.
 * Um contrato com repositório falso nunca exercita o `FOR NO KEY UPDATE`, o CHECK do evento, o
 * trigger append-only nem o `jsonb` que o Bun SQL devolve — é aqui que eles são provados.
 */
import { describe, expect, test } from 'bun:test'
import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { tripCrewEvents, trips } from '../../src/database/database.schema.js'
import { parseCrewSnapshot } from '../../src/trips/domain/trip-crew-transfer.policy.js'
import {
  seedOnRoadTrip,
  transferRequest,
  useSharedRaceDatabase,
  type CrewTransferWorld,
} from '../fixtures/trip-crew-transfer.fixture.js'
import {
  insertManifest,
  listTripIdsOnPhone,
  readCrewEvents,
  readCrewTransferAudit,
  readStoredCrew,
  readStoredJsonTypes,
  readTripFreeze,
  readTripUpdatedAt,
} from '../fixtures/trip-crew-transfer-read.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const TEST_TIMEOUT_MS = 60_000

const raceDatabase = useSharedRaceDatabase(databaseUrl)

function currentDatabase(): DrizzleProvider {
  return raceDatabase().database
}

async function newWorld(): Promise<CrewTransferWorld> {
  return seedOnRoadTrip(currentDatabase())
}

function toCents(amount: string): bigint {
  return BigInt(amount.replace('.', ''))
}

describe('o custo antes e depois, com diárias diferentes (spec 249 D7)', () => {
  testWithPostgres(
    'trocar para um motorista de diária maior soma a diferença, com o sinal certo',
    async () => {
      const world = await newWorld()

      const { transfer } = await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.bruno.id], helperIds: [world.carla.id] }),
      )

      // Antes: 2 × 100,00 (Ana) + 2 × 80,00 (Carla ajudante). Depois: 2 × 350,00 (Bruno) + 160,00.
      expect(transfer).toMatchObject({
        costAfter: '860.00',
        costBefore: '360.00',
        costDifference: '500.00',
        costHasGaps: false,
        mdfeDriverDivergence: false,
      })
      expect(toCents(transfer.costBefore) + toCents(transfer.costDifference)).toBe(
        toCents(transfer.costAfter),
      )
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'trocar de volta para diárias menores dá diferença negativa, e a conta continua fechando',
    async () => {
      const world = await newWorld()
      await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.bruno.id], helperIds: [world.carla.id] }),
      )

      // Antes: 860,00. Depois: 2 × 100,00 (Ana) + 2 × 60,00 (Diogo, pela diária da empresa).
      const { transfer } = await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.ana.id], helperIds: [world.diogo.id] }),
      )

      expect(transfer).toMatchObject({
        costAfter: '320.00',
        costBefore: '860.00',
        costDifference: '-540.00',
        costHasGaps: false,
      })
      expect(toCents(transfer.costBefore) + toCents(transfer.costDifference)).toBe(
        toCents(transfer.costAfter),
      )
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o ajudante que assume o volante entra como motorista na posição 1, pela diária de motorista',
    async () => {
      const world = await newWorld()

      const { transfer, trip } = await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.carla.id] }),
      )

      expect(await readStoredCrew(currentDatabase(), world.trip.tripId)).toEqual([
        { driverId: world.carla.id, position: 1, role: 'driver' },
      ])
      expect(trip.drivers.map((member) => [member.driverId, member.role, member.position])).toEqual(
        [[world.carla.id, 'driver', 1]],
      )
      // Antes: 360,00. Depois: Carla sem diária própria de motorista paga o padrão, 2 × 200,00.
      expect(transfer).toMatchObject({ costAfter: '400.00', costDifference: '40.00' })
    },
    TEST_TIMEOUT_MS,
  )
})

describe('o que a transferência não toca (spec 249 D2/RF3)', () => {
  testWithPostgres(
    'rota congelada, pedágio, ETA, veículo, status, paradas e notas ficam iguais, byte a byte',
    async () => {
      const world = await newWorld()
      const before = await readTripFreeze(currentDatabase(), world.trip.tripId)
      const updatedAtBefore = await readTripUpdatedAt(currentDatabase(), world.trip.tripId)

      await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.bruno.id], helperIds: [world.diogo.id] }),
      )

      const after = await readTripFreeze(currentDatabase(), world.trip.tripId)
      expect(JSON.stringify(after, replaceBigInt)).toBe(JSON.stringify(before, replaceBigInt))
      expect(after.trip.status).toBe('in_transit')
      expect(after.trip.plannedRoute).not.toBeNull()
      expect(after.trip.plannedToll).not.toBeNull()
      expect(after.trip.etaDepartureAt).not.toBeNull()
      expect(after.trip.vehicleId).toBe(before.trip.vehicleId)
      expect(after.stops.length).toBeGreaterThan(0)
      expect(after.documents.length).toBeGreaterThan(0)
      // O único campo que se mexe é `updated_at`.
      expect(
        (await readTripUpdatedAt(currentDatabase(), world.trip.tripId)).getTime(),
      ).toBeGreaterThan(updatedAtBefore.getTime())
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a viagem que o repositório devolve é a mesma que a leitura do detalhe devolveria',
    async () => {
      const world = await newWorld()

      const { trip } = await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.bruno.id] }),
      )

      expect(trip).toEqual(
        await world.useCase.get({
          context: transferRequest(world, { driverIds: [] }).context,
          tripId: world.trip.tripId,
        }),
      )
      expect(trip.status).toBe('in_transit')
    },
    TEST_TIMEOUT_MS,
  )
})

describe('a divergência do MDF-e (spec 249 D8)', () => {
  const driverSwap = (world: CrewTransferWorld) =>
    transferRequest(world, { driverIds: [world.bruno.id], helperIds: [world.carla.id] })
  const helperSwap = (world: CrewTransferWorld) =>
    transferRequest(world, { driverIds: [world.ana.id], helperIds: [world.diogo.id] })

  testWithPostgres(
    'MDF-e autorizado e motorista trocado: diverge',
    async () => {
      const world = await newWorld()
      await insertManifest(currentDatabase(), world, 'authorized')

      const { transfer } = await world.useCase.transferCrew(driverSwap(world))

      expect(transfer.mdfeDriverDivergence).toBe(true)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'MDF-e autorizado e só o ajudante trocado: nunca diverge',
    async () => {
      const world = await newWorld()
      await insertManifest(currentDatabase(), world, 'authorized')

      const { transfer } = await world.useCase.transferCrew(helperSwap(world))

      expect(transfer.mdfeDriverDivergence).toBe(false)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'sem MDF-e, ou com MDF-e ainda rascunho, e motorista trocado: não diverge',
    async () => {
      const withoutManifest = await newWorld()
      const withDraft = await newWorld()
      await insertManifest(currentDatabase(), withDraft, 'draft')

      const first = await withoutManifest.useCase.transferCrew(driverSwap(withoutManifest))
      const second = await withDraft.useCase.transferCrew(driverSwap(withDraft))

      expect(first.transfer.mdfeDriverDivergence).toBe(false)
      expect(second.transfer.mdfeDriverDivergence).toBe(false)
    },
    TEST_TIMEOUT_MS,
  )
})

describe('quem vê a viagem no celular (spec 249 D9/RF6)', () => {
  testWithPostgres(
    'o motorista novo lê a viagem em andamento e o antigo deixa de vê-la',
    async () => {
      const world = await newWorld()
      const companyId = world.trip.companyId
      const phone = (membershipId: string) =>
        listTripIdsOnPhone(currentDatabase(), { companyId, membershipId })
      expect(await phone(world.ana.membershipId)).toEqual([world.trip.tripId])
      expect(await phone(world.bruno.membershipId)).toEqual([])

      await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.bruno.id], helperIds: [world.carla.id] }),
      )

      expect(await phone(world.ana.membershipId)).toEqual([])
      expect(await phone(world.bruno.membershipId)).toEqual([world.trip.tripId])
      expect(await phone(world.carla.membershipId)).toEqual([world.trip.tripId])
    },
    TEST_TIMEOUT_MS,
  )
})

describe('o histórico e a auditoria (spec 249 D6)', () => {
  testWithPostgres(
    'grava quem saiu, quem entrou, o motivo, o autor, o canal e os custos; o jsonb é lista de verdade',
    async () => {
      const world = await newWorld()
      const request = transferRequest(world, {
        driverIds: [world.bruno.id],
        helperIds: [world.carla.id],
      })

      const { transfer } = await world.useCase.transferCrew(request)

      const [event, ...others] = await readCrewEvents(currentDatabase(), world.trip.tripId)
      expect(others).toEqual([])
      expect(event?.id).toBe(transfer.id)
      expect(event).toMatchObject({
        actorUserId: world.trip.userId,
        channel: 'backoffice',
        companyId: world.trip.companyId,
        costAfter: '860.00',
        costBefore: '360.00',
        costDifference: '500.00',
        costHasGaps: false,
        mdfeDriverDivergence: false,
        reason: request.reason,
      })
      expect(await readStoredJsonTypes(currentDatabase(), transfer.id)).toEqual({
        next: 'array',
        previous: 'array',
      })
      expect(parseCrewSnapshot(event?.previousCrew)).toEqual([
        { driverId: world.ana.id, name: 'Motorista 185 T4.3', position: 1, role: 'driver' },
        { driverId: world.carla.id, name: 'Carla Dias', position: 2, role: 'helper' },
      ])
      expect(parseCrewSnapshot(event?.nextCrew)).toEqual([
        { driverId: world.bruno.id, name: 'Bruno Lima', position: 1, role: 'driver' },
        { driverId: world.carla.id, name: 'Carla Dias', position: 2, role: 'helper' },
      ])
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'é append-only: nem atualizar nem apagar uma transferência já gravada',
    async () => {
      const world = await newWorld()
      const { transfer } = await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.bruno.id] }),
      )

      const update = rejectionOf(
        currentDatabase()
          .db.update(tripCrewEvents)
          .set({ reason: 'reescrito' })
          .where(eq(tripCrewEvents.id, transfer.id)),
      )
      const remove = rejectionOf(
        currentDatabase().db.delete(tripCrewEvents).where(eq(tripCrewEvents.id, transfer.id)),
      )

      expect(await update).toContain('append-only')
      expect(await remove).toContain('append-only')
      expect(await readCrewEvents(currentDatabase(), world.trip.tripId)).toHaveLength(1)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a auditoria mira a viagem, leva só ids opacos e nunca o motivo nem os nomes',
    async () => {
      const world = await newWorld()
      const request = transferRequest(world, { driverIds: [world.bruno.id] })
      const { transfer } = await world.useCase.transferCrew(request)

      const audit = (await readCrewTransferAudit(currentDatabase(), world.trip.tripId)).filter(
        (row) => row.action === 'office.trip.crew-transfer',
      )

      expect(audit).toHaveLength(1)
      expect(audit[0]).toMatchObject({
        actorUserId: world.trip.userId,
        companyId: world.trip.companyId,
        correlationId: request.correlationId,
        entityId: world.trip.tripId,
        entityType: 'trip',
        permission: 'trip.report-on-behalf',
        targetId: world.trip.tripId,
        targetType: 'trip',
      })
      expect(audit[0]?.metadata).toEqual({
        crewEventId: transfer.id,
        ipAddress: '203.0.113.7',
        mdfeDriverDivergence: false,
        nextDriverIds: [world.bruno.id],
        previousDriverIds: [world.ana.id, world.carla.id],
      })
      const serialized = JSON.stringify(audit[0]?.metadata)
      expect(serialized).not.toContain(request.reason)
      expect(serialized).not.toContain('Bruno')
    },
    TEST_TIMEOUT_MS,
  )
})

describe('o que a transferência recusa (spec 249 D1/D5)', () => {
  testWithPostgres(
    'tripulação igual à atual: TRIP_CREW_UNCHANGED e nada gravado',
    async () => {
      const world = await newWorld()
      const before = await readTripFreeze(currentDatabase(), world.trip.tripId)
      const updatedAtBefore = await readTripUpdatedAt(currentDatabase(), world.trip.tripId)

      const error = await world.useCase
        .transferCrew(
          transferRequest(world, { driverIds: [world.ana.id], helperIds: [world.carla.id] }),
        )
        .catch((caught: unknown) => caught)

      expect(error).toMatchObject({ code: 'TRIP_CREW_UNCHANGED', status: 409 })
      expect(await readCrewEvents(currentDatabase(), world.trip.tripId)).toEqual([])
      expect(
        JSON.stringify(await readTripFreeze(currentDatabase(), world.trip.tripId), replaceBigInt),
      ).toBe(JSON.stringify(before, replaceBigInt))
      expect(await readTripUpdatedAt(currentDatabase(), world.trip.tripId)).toEqual(updatedAtBefore)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'as mesmas pessoas em outra ordem são uma transferência',
    async () => {
      const world = await newWorld()

      const { transfer } = await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.ana.id, world.bruno.id] }),
      )
      const reordered = await world.useCase.transferCrew(
        transferRequest(world, { driverIds: [world.bruno.id, world.ana.id] }),
      )

      expect(transfer.id).not.toBe(reordered.transfer.id)
      expect(await readStoredCrew(currentDatabase(), world.trip.tripId)).toEqual([
        { driverId: world.bruno.id, position: 1, role: 'driver' },
        { driverId: world.ana.id, position: 2, role: 'driver' },
      ])
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o repositório reconfere a janela sob lock, sem depender do caso de uso',
    async () => {
      const world = await newWorld()
      const request = transferRequest(world, { driverIds: [world.bruno.id] })
      await currentDatabase()
        .db.update(trips)
        .set({ status: 'cancelled' })
        .where(eq(trips.id, world.trip.tripId))

      const error = await world.repository
        .transferCrew({
          actorUserId: world.trip.userId,
          channel: 'backoffice',
          companyId: world.trip.companyId,
          correlationId: request.correlationId,
          crew: [
            {
              driverId: world.bruno.id,
              driverName: 'Bruno Lima',
              driverTaxId: '33333333333',
              position: 1,
              role: 'driver',
            },
          ],
          ipAddress: request.ipAddress,
          reason: request.reason,
          tripId: world.trip.tripId,
        })
        .catch((caught: unknown) => caught)

      expect(error).toMatchObject({
        code: 'STATE_TRANSITION_NOT_ALLOWED',
        reason: 'TRIP_CANCELLED',
      })
      expect(await readCrewEvents(currentDatabase(), world.trip.tripId)).toEqual([])
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'viagem de outra empresa responde como inexistente',
    async () => {
      const world = await newWorld()
      const stranger = await newWorld()

      const error = await world.useCase
        .transferCrew({
          ...transferRequest(world, { driverIds: [world.bruno.id] }),
          context: { companyId: stranger.trip.companyId, userId: stranger.trip.userId },
        })
        .catch((caught: unknown) => caught)

      expect(error).toMatchObject({ code: 'TRIP_NOT_FOUND', status: 404 })
      expect(await readStoredCrew(currentDatabase(), world.trip.tripId)).toHaveLength(2)
    },
    TEST_TIMEOUT_MS,
  )
})

/** O texto da recusa do banco, com a causa: o drizzle embrulha o erro do driver. */
async function rejectionOf(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined
    return `${String(error)} ${String(cause)}`
  }
  throw new Error('EXPECTED_REJECTION')
}

/** `bigint` não atravessa `JSON.stringify`; a fotografia compara texto. */
function replaceBigInt(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value
}
