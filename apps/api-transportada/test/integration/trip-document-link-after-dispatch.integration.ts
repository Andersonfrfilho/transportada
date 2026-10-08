/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257 T1.3: acrescentar notas a uma viagem **na rua**, contra Postgres de verdade. O lock, o
 * CHECK do canal, o trigger append-only e o `jsonb` que o Bun SQL devolve só se provam aqui.
 */
import { describe, expect, test } from 'bun:test'
import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray } from 'drizzle-orm'

import {
  auditLogs,
  tripDocumentEvents,
  tripDocumentLinkEvents,
  tripDocuments,
  tripStops,
  trips,
} from '../../src/database/database.schema.js'
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import {
  seedOnRoadTrip,
  useSharedRaceDatabase,
  type CrewTransferWorld,
} from '../fixtures/trip-crew-transfer.fixture.js'
import { readTripFreeze } from '../fixtures/trip-crew-transfer-read.fixture.js'
import { seedNfeDocument } from '../fixtures/trip-dispatch-race.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const TEST_TIMEOUT_MS = 60_000
const REASON = 'Van quebrou na estrada, a outra vai socorrer'

const raceDatabase = useSharedRaceDatabase(databaseUrl)

function currentDatabase(): DrizzleProvider {
  return raceDatabase().database
}

async function newWorld(): Promise<CrewTransferWorld> {
  return seedOnRoadTrip(currentDatabase())
}

async function seedLooseNotes(world: CrewTransferWorld, count: number): Promise<string[]> {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    ids.push(
      await seedNfeDocument(world.database, {
        companyId: world.trip.companyId,
        userId: world.trip.userId,
      }),
    )
  }
  return ids
}

function linkRequest(world: CrewTransferWorld, nfeDocumentIds: readonly string[]) {
  return {
    actorUserId: world.trip.userId,
    channel: 'backoffice' as const,
    companyId: world.trip.companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    ipAddress: '203.0.113.7',
    nfeDocumentIds,
    reason: REASON,
    tripId: world.trip.tripId,
  }
}

async function readStops(world: CrewTransferWorld) {
  return world.database.db
    .select()
    .from(tripStops)
    .where(eq(tripStops.tripId, world.trip.tripId))
    .orderBy(asc(tripStops.sequence))
}

describe('a nota solta entra na viagem que já saiu (spec 257)', () => {
  testWithPostgres(
    'entra carregada, com evento de documento, e a viagem não muda de status',
    async () => {
      const world = await newWorld()
      const [noteId] = await seedLooseNotes(world, 1)
      if (noteId === undefined) throw new Error('EXPECTED_NOTE')

      const result = await world.repository.linkDocumentsAfterDispatch(linkRequest(world, [noteId]))

      expect(result?.tripStatus).toBe('in_transit')
      expect(result?.linked).toHaveLength(1)
      expect(result?.skipped).toEqual([])
      const [link] = await world.database.db
        .select()
        .from(tripDocuments)
        .where(
          and(eq(tripDocuments.tripId, world.trip.tripId), eq(tripDocuments.nfeDocumentId, noteId)),
        )
      expect(link?.separationStatus).toBe('loaded')
      expect(link?.separatedAt).toBeInstanceOf(Date)
      expect(link?.loadedAt).toBeInstanceOf(Date)
      expect(link?.stopId).not.toBeNull()

      const events = await world.database.db
        .select()
        .from(tripDocumentEvents)
        .where(eq(tripDocumentEvents.tripDocumentId, link?.id ?? ''))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        channel: 'backoffice',
        fromStatus: null,
        toStatus: 'loaded',
      })
      expect(events[0]?.note).toBe(REASON)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'parada aberta no mesmo endereço é reaproveitada; roteiro, pedágio e ETA ficam como estavam',
    async () => {
      const world = await newWorld()
      const before = await readTripFreeze(world.database, world.trip.tripId)
      const stopsBefore = await readStops(world)
      const [noteId] = await seedLooseNotes(world, 1)
      if (noteId === undefined) throw new Error('EXPECTED_NOTE')

      const result = await world.repository.linkDocumentsAfterDispatch(linkRequest(world, [noteId]))

      const stopsAfter = await readStops(world)
      expect(result?.createdStopIds).toEqual([])
      expect(stopsAfter).toHaveLength(stopsBefore.length)
      const after = await readTripFreeze(world.database, world.trip.tripId)
      expect(after.trip).toEqual(before.trip)
      expect(after.statusEventCount).toBe(before.statusEventCount)
      expect(after.documents.length).toBe(before.documents.length + 1)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'parada que o motorista já fechou não recebe a nota: nasce uma parada nova ao fim, sem ETA',
    async () => {
      const world = await newWorld()
      const stopsBefore = await readStops(world)
      expect(stopsBefore.length).toBeGreaterThan(0)
      await world.database.db
        .update(tripStops)
        .set({ arrivedAt: new Date('2026-10-07T09:00:00.000Z') })
        .where(eq(tripStops.tripId, world.trip.tripId))
      const [noteId] = await seedLooseNotes(world, 1)
      if (noteId === undefined) throw new Error('EXPECTED_NOTE')

      const result = await world.repository.linkDocumentsAfterDispatch(linkRequest(world, [noteId]))

      expect(result?.createdStopIds).toHaveLength(1)
      const stopsAfter = await readStops(world)
      expect(stopsAfter).toHaveLength(stopsBefore.length + 1)
      const created = stopsAfter.find((stop) => stop.id === result?.createdStopIds[0])
      expect(Number(created?.sequence)).toBe(
        Math.max(...stopsBefore.map((stop) => Number(stop.sequence))) + 1,
      )
      expect(created?.arrivedAt).toBeNull()
      expect(result?.linked[0]?.stopId).toBe(created?.id)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'nota já ligada a viagem viva é pulada com already_linked, e o resto do lote entra',
    async () => {
      const world = await newWorld()
      const [freshId] = await seedLooseNotes(world, 1)
      const [alreadyLinked] = await world.database.db
        .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
        .from(tripDocuments)
        .where(eq(tripDocuments.tripId, world.trip.tripId))
        .limit(1)
      const alreadyLinkedId = alreadyLinked?.nfeDocumentId
      if (freshId === undefined || alreadyLinkedId === undefined || alreadyLinkedId === null) {
        throw new Error('EXPECTED_NOTES')
      }

      const result = await world.repository.linkDocumentsAfterDispatch(
        linkRequest(world, [alreadyLinkedId, freshId]),
      )

      expect(result?.skipped).toEqual([
        { nfeDocumentId: alreadyLinkedId, reason: 'already_linked' },
      ])
      expect(result?.linked.map((document) => document.nfeDocumentId)).toEqual([freshId])
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'viagem que saiu da janela sob o lock recusa o lote inteiro com 409 e não grava nada',
    async () => {
      const world = await newWorld()
      const noteIds = await seedLooseNotes(world, 2)
      await world.database.db
        .update(trips)
        .set({ status: 'completed' })
        .where(eq(trips.id, world.trip.tripId))

      const attempt = world.repository.linkDocumentsAfterDispatch(linkRequest(world, noteIds))

      await expect(attempt).rejects.toBeInstanceOf(TripStateTransitionNotAllowedError)
      const linked = await world.database.db
        .select({ id: tripDocuments.id })
        .from(tripDocuments)
        .where(inArray(tripDocuments.nfeDocumentId, noteIds))
      expect(linked).toEqual([])
      const events = await world.database.db
        .select({ id: tripDocumentLinkEvents.id })
        .from(tripDocumentLinkEvents)
        .where(eq(tripDocumentLinkEvents.tripId, world.trip.tripId))
      expect(events).toEqual([])
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'grava o evento de histórico (quem, motivo, notas) e a auditoria com ids opacos',
    async () => {
      const world = await newWorld()
      const noteIds = await seedLooseNotes(world, 2)

      const result = await world.repository.linkDocumentsAfterDispatch(linkRequest(world, noteIds))

      const [event] = await world.database.db
        .select()
        .from(tripDocumentLinkEvents)
        .where(eq(tripDocumentLinkEvents.tripId, world.trip.tripId))
      expect(event?.id).toBe(result?.eventId ?? '')
      expect(event).toMatchObject({
        actorUserId: world.trip.userId,
        channel: 'backoffice',
        reason: REASON,
      })
      expect([...(event?.nfeDocumentIds as string[])].sort()).toEqual([...noteIds].sort())
      expect(Array.isArray(event?.createdStopIds)).toBe(true)

      const [audit] = await world.database.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityId, world.trip.tripId),
            eq(auditLogs.action, 'office.trip.documents-added'),
          ),
        )
      expect(audit?.permission).toBe('trip.report-on-behalf')
      expect(JSON.stringify(audit?.metadata)).not.toContain(REASON)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o histórico é append-only: UPDATE e DELETE são recusados pelo trigger',
    async () => {
      const world = await newWorld()
      const [noteId] = await seedLooseNotes(world, 1)
      if (noteId === undefined) throw new Error('EXPECTED_NOTE')
      await world.repository.linkDocumentsAfterDispatch(linkRequest(world, [noteId]))

      const tamper = async () =>
        world.database.db
          .update(tripDocumentLinkEvents)
          .set({ reason: 'adulterado' })
          .where(eq(tripDocumentLinkEvents.tripId, world.trip.tripId))
      const erase = async () =>
        world.database.db
          .delete(tripDocumentLinkEvents)
          .where(eq(tripDocumentLinkEvents.tripId, world.trip.tripId))
      await expect(tamper()).rejects.toThrow()
      await expect(erase()).rejects.toThrow()
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a sinalização fiscal: nota sem CT-e autorizado é contada; sem manifesto não há divergência',
    async () => {
      const world = await newWorld()
      const noteIds = await seedLooseNotes(world, 2)

      const result = await world.repository.linkDocumentsAfterDispatch(linkRequest(world, noteIds))

      expect(result?.documentsWithoutCte).toBe(2)
      expect(result?.mdfeDocumentDivergence).toBe(false)
    },
    TEST_TIMEOUT_MS,
  )
})
