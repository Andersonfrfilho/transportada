/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 T3.1 (CA04, CA05, ADR-0074 §3/§4): o botão "Despachar" leva todas — `loadRemaining`
 * separa e carrega o que falta e despacha na mesma transação — e a nota com ocorrência de separação
 * de nota inteira, de tipo "a viagem segue sem a nota", é liberada no despacho sem `force`, com o
 * motivo registrado. Gate recusado não altera nota nenhuma.
 *
 * Contra Postgres de verdade, pelos mesmos caso de uso e repositório que a rota usa: a prova de
 * "nada mudou" é por leitura das linhas antes e depois, não por ausência de erro.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc, eq, inArray } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  deliveryClients,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  companyOccurrenceTypes,
  tripDispatchSnapshots,
  tripDocumentEvents,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripDocuments,
  tripOccurrenceCases,
  trips,
  tripStatusEvents,
  type TripOccurrenceCaseStatus,
  type TripStatus,
} from '../../src/database/trip.schema.js'
import { dispatchTrip } from '../../src/trips/application/dispatch-trip.use-case.js'
import { OCCURRENCE_CASE_TERMINAL_STATUSES } from '../../src/trips/domain/occurrence-case-state.policy.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { DrizzleTripDocumentRepository } from '../../src/trips/infrastructure/drizzle-trip-document.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const SCHEDULING_CLIENT_TAX_ID = '12345678000199'
const LEAVES_BEHIND_TYPE_NAME = 'Item faltante'

describe('despachar leva todas e deixa para trás o que a ocorrência tira (spec 185 T3.1)', () => {
  testWithPostgres(
    'CA04: loadRemaining separa e carrega a pendente e a separada e despacha, numa transação',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 3 })
        const [pendingId, separatedId, loadedId] = trip.tripDocumentIds as [string, string, string]
        await moveDocument(database, trip, separatedId, ['separate'])
        await moveDocument(database, trip, loadedId, ['separate', 'load'])
        const eventsBefore = await countDocumentEvents(database, trip.tripDocumentIds)

        const dispatched = await dispatchTrip({
          actorUserId: trip.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          loadRemaining: true,
          repository: new DrizzleTripRouteRepository(database.db),
          tripId: trip.tripId,
        })

        expect(dispatched.tripStatus).toBe('dispatched')
        expect(await readDocumentStates(database, trip.tripDocumentIds)).toEqual(
          new Map([
            [pendingId, { isReleased: false, separationStatus: 'loaded' }],
            [separatedId, { isReleased: false, separationStatus: 'loaded' }],
            [loadedId, { isReleased: false, separationStatus: 'loaded' }],
          ]),
        )

        const snapshot = await readSnapshot(database, trip.tripId)
        expect(snapshot).toMatchObject({ forceReason: null, forced: false })

        // Os eventos da nota contam a história inteira: a pendente passou por `separated`.
        expect(await readDocumentEvents(database, pendingId)).toEqual([
          { channel: 'backoffice', fromStatus: 'pending', toStatus: 'separated' },
          { channel: 'backoffice', fromStatus: 'separated', toStatus: 'loaded' },
        ])
        expect(await readDocumentEvents(database, separatedId)).toEqual([
          { channel: 'backoffice', fromStatus: 'pending', toStatus: 'separated' },
          { channel: 'backoffice', fromStatus: 'separated', toStatus: 'loaded' },
        ])
        expect((await countDocumentEvents(database, trip.tripDocumentIds)) - eventsBefore).toBe(3)

        const statusEvents = await readStatusEvents(database, trip.tripId)
        expect(statusEvents.at(-1)).toEqual({
          actorUserId: trip.userId,
          channel: 'backoffice',
          toStatus: 'dispatched',
        })
      })
    },
    30_000,
  )

  testWithPostgres(
    'CA04: parada sem agendamento recusa loadRemaining com 409 e não altera nota nenhuma',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, {
          documentCount: 2,
          recipientRequiresScheduling: true,
        })
        const [pendingId, separatedId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, separatedId, ['separate'])
        const statesBefore = await readDocumentStates(database, trip.tripDocumentIds)
        const eventsBefore = await countDocumentEvents(database, trip.tripDocumentIds)
        const tripStatusBefore = await readTripStatus(database, trip.tripId)

        const refused = await dispatchTrip({
          actorUserId: trip.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          loadRemaining: true,
          repository: new DrizzleTripRouteRepository(database.db),
          tripId: trip.tripId,
        }).catch((caught: unknown) => caught)

        expect(refused).toMatchObject({ code: 'TRIP_HAS_UNSCHEDULED_STOPS', status: 409 })
        expect(await readDocumentStates(database, trip.tripDocumentIds)).toEqual(statesBefore)
        expect(statesBefore.get(pendingId)?.separationStatus).toBe('pending')
        expect(await countDocumentEvents(database, trip.tripDocumentIds)).toBe(eventsBefore)
        expect(await readTripStatus(database, trip.tripId)).toBe(tripStatusBefore)
        expect(await readSnapshot(database, trip.tripId)).toBeUndefined()
      })
    },
    30_000,
  )

  testWithPostgres(
    'CA05: ocorrência de nota inteira de tipo "segue sem a nota" libera a nota no despacho, com motivo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [leftBehindId, loadedId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, loadedId, ['separate', 'load'])
        await seedSeparationOccurrence(database, trip, {
          leavesDocumentBehind: true,
          productCodes: [],
          tripDocumentId: leftBehindId,
        })

        const dispatched = await dispatchTrip({
          actorUserId: trip.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          repository: new DrizzleTripRouteRepository(database.db),
          tripId: trip.tripId,
        })

        expect(dispatched.tripStatus).toBe('dispatched')
        expect(await readDocumentStates(database, trip.tripDocumentIds)).toEqual(
          new Map([
            [leftBehindId, { isReleased: true, separationStatus: 'pending' }],
            [loadedId, { isReleased: false, separationStatus: 'loaded' }],
          ]),
        )

        const snapshot = await readSnapshot(database, trip.tripId)
        // `forced` não muda: a assinatura é a do cadastro do tipo (ADR-0074 §4), e a CHECK
        // `forced = (force_reason is not null)` não deixa o motivo morar em `force_reason`.
        expect(snapshot).toMatchObject({ forceReason: null, forced: false })
        expect((snapshot?.snapshot as { leftBehind?: unknown }).leftBehind).toEqual([
          { documentId: leftBehindId, reason: `Ocorrência: ${LEAVES_BEHIND_TYPE_NAME}` },
        ])
      })
    },
    30_000,
  )

  /**
   * Revisão da spec 185 (ADR-0074 §4, RF1): "ocorrência aberta" é a que não tem tratativa ou cuja
   * tratativa não chegou a um terminal (`OCCURRENCE_CASE_TERMINAL_STATUSES`). Tratativa encerrada
   * não tira mais a nota da conta: ela volta a ser carga a levar, e o despacho sem `force` recusa.
   */
  testWithPostgres(
    'revisão: tratativa terminal (cancelada, fechada, devolvida ao barracão) não deixa a nota para trás',
    async () => {
      await withDisposableDatabase(async (database) => {
        for (const status of OCCURRENCE_CASE_TERMINAL_STATUSES) {
          const trip = await seedPlannedTrip(database, { documentCount: 2 })
          const [closedCaseId, loadedId] = trip.tripDocumentIds as [string, string]
          await moveDocument(database, trip, loadedId, ['separate', 'load'])
          const occurrenceId = await seedSeparationOccurrence(database, trip, {
            leavesDocumentBehind: true,
            productCodes: [],
            tripDocumentId: closedCaseId,
          })
          await seedOccurrenceCase(database, trip, { occurrenceId, status })

          const routeRepository = new DrizzleTripRouteRepository(database.db)
          const preconditions = await routeRepository.readPreconditions(trip)
          expect({ status, leftBehind: preconditions?.leftBehind }).toEqual({
            leftBehind: [],
            status,
          })
          expect(preconditions?.toLoad.map((document) => document.tripDocumentId)).toEqual([
            closedCaseId,
          ])

          const refused = await dispatchTrip({
            actorUserId: trip.userId,
            channel: TRIP_FIELD_CHANNELS.backoffice,
            companyId: trip.companyId,
            repository: routeRepository,
            tripId: trip.tripId,
          }).catch((caught: unknown) => caught)
          expect(refused).toMatchObject({ code: 'TRIP_HAS_UNLOADED_DOCUMENTS', status: 409 })
          expect((await readDocumentStates(database, [closedCaseId])).get(closedCaseId)).toEqual({
            isReleased: false,
            separationStatus: 'pending',
          })
        }
      })
    },
    60_000,
  )

  testWithPostgres(
    'revisão: tratativa ainda aberta (recorded) mantém a nota deixada para trás',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [openCaseId, loadedId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, loadedId, ['separate', 'load'])
        const occurrenceId = await seedSeparationOccurrence(database, trip, {
          leavesDocumentBehind: true,
          productCodes: [],
          tripDocumentId: openCaseId,
        })
        await seedOccurrenceCase(database, trip, { occurrenceId, status: 'recorded' })

        const preconditions = await new DrizzleTripRouteRepository(database.db).readPreconditions(
          trip,
        )

        expect(preconditions?.leftBehind).toEqual([
          { occurrenceTypeName: LEAVES_BEHIND_TYPE_NAME, tripDocumentId: openCaseId },
        ])
        expect(preconditions?.toLoad).toEqual([])
      })
    },
    30_000,
  )

  testWithPostgres(
    'CA05: ocorrência parcial (com item) do mesmo tipo não libera — a nota continua bloqueando',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [partialId, loadedId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, loadedId, ['separate', 'load'])
        await seedSeparationOccurrence(database, trip, {
          leavesDocumentBehind: true,
          productCodes: ['SKU-1', 'SKU-2'],
          tripDocumentId: partialId,
        })

        const refused = await dispatchTrip({
          actorUserId: trip.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          repository: new DrizzleTripRouteRepository(database.db),
          tripId: trip.tripId,
        }).catch((caught: unknown) => caught)

        expect(refused).toMatchObject({ code: 'TRIP_HAS_UNLOADED_DOCUMENTS', status: 409 })
        expect((refused as { documentIds?: unknown }).documentIds).toEqual([partialId])
        expect((await readDocumentStates(database, [partialId])).get(partialId)).toEqual({
          isReleased: false,
          separationStatus: 'pending',
        })
        expect(await readSnapshot(database, trip.tripId)).toBeUndefined()
      })
    },
    30_000,
  )

  testWithPostgres(
    'tipo sem "segue sem a nota" não libera: a ocorrência de nota inteira só anota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 2 })
        const [annotatedId, loadedId] = trip.tripDocumentIds as [string, string]
        await moveDocument(database, trip, loadedId, ['separate', 'load'])
        await seedSeparationOccurrence(database, trip, {
          leavesDocumentBehind: false,
          productCodes: [],
          tripDocumentId: annotatedId,
        })

        const refused = await dispatchTrip({
          actorUserId: trip.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          repository: new DrizzleTripRouteRepository(database.db),
          tripId: trip.tripId,
        }).catch((caught: unknown) => caught)

        expect(refused).toMatchObject({ code: 'TRIP_HAS_UNLOADED_DOCUMENTS', status: 409 })
      })
    },
    30_000,
  )

  testWithPostgres(
    'só notas deixadas para trás: não despacha viagem vazia, e nada é liberado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 1 })
        const [leftBehindId] = trip.tripDocumentIds as [string]
        await seedSeparationOccurrence(database, trip, {
          leavesDocumentBehind: true,
          productCodes: [],
          tripDocumentId: leftBehindId,
        })
        const tripStatusBefore = await readTripStatus(database, trip.tripId)

        const refused = await dispatchTrip({
          actorUserId: trip.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: trip.companyId,
          loadRemaining: true,
          repository: new DrizzleTripRouteRepository(database.db),
          tripId: trip.tripId,
        }).catch((caught: unknown) => caught)

        expect(refused).toMatchObject({ code: 'TRIP_HAS_UNLOADED_DOCUMENTS', status: 409 })
        expect((await readDocumentStates(database, [leftBehindId])).get(leftBehindId)).toEqual({
          isReleased: false,
          separationStatus: 'pending',
        })
        expect(await readTripStatus(database, trip.tripId)).toBe(tripStatusBefore)
        expect(await readSnapshot(database, trip.tripId)).toBeUndefined()
      })
    },
    30_000,
  )

  /**
   * A ordem trava → reconferência → snapshot: antes, o snapshot era inserido **antes** do lock da
   * viagem, e o segundo despacho de uma corrida batia na unique `(company_id, trip_id)` do snapshot
   * — 23505, um 500 onde a regra é `unchanged`.
   */
  testWithPostgres(
    'dois despachos simultâneos: um despacha, o outro devolve dispatched sem erro, um snapshot só',
    async () => {
      await withDisposableDatabase(async (database) => {
        const trip = await seedPlannedTrip(database, { documentCount: 1 })
        const [documentId] = trip.tripDocumentIds as [string]
        await moveDocument(database, trip, documentId, ['separate', 'load'])
        const routeRepository = new DrizzleTripRouteRepository(database.db)
        const preconditions = await routeRepository.readPreconditions(trip)
        if (preconditions === null) throw new Error('EXPECTED_PRECONDITIONS')

        // As duas leem a precondição antes de qualquer uma escrever — a corrida do mundo real.
        const dispatchOnce = () =>
          dispatchTrip({
            actorUserId: trip.userId,
            channel: TRIP_FIELD_CHANNELS.backoffice,
            companyId: trip.companyId,
            repository: {
              dispatch: (writeInput) => routeRepository.dispatch(writeInput),
              readPreconditions: async () => preconditions,
            },
            tripId: trip.tripId,
          })

        const outcomes = await Promise.allSettled([dispatchOnce(), dispatchOnce()])

        expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'fulfilled'])
        expect(await readTripStatus(database, trip.tripId)).toBe('dispatched')
        const snapshots = await database.db
          .select({ id: tripDispatchSnapshots.id })
          .from(tripDispatchSnapshots)
          .where(eq(tripDispatchSnapshots.tripId, trip.tripId))
        expect(snapshots).toHaveLength(1)
        const dispatchEvents = (await readStatusEvents(database, trip.tripId)).filter(
          (event) => event.toStatus === 'dispatched',
        )
        expect(dispatchEvents).toHaveLength(1)
      })
    },
    30_000,
  )
})

type SeededTrip = {
  readonly companyId: string
  readonly tripDocumentIds: readonly string[]
  readonly tripId: string
  readonly userId: string
}

async function seedPlannedTrip(
  database: TestDatabase,
  input: { readonly documentCount: number; readonly recipientRequiresScheduling?: boolean },
): Promise<SeededTrip> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()

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
    name: 'Motorista 185',
    taxId: '11111111111',
  })
  if (input.recipientRequiresScheduling === true) {
    await database.db.insert(deliveryClients).values({
      companyId,
      displayName: 'Cliente que agenda',
      requiresScheduling: true,
      taxId: SCHEDULING_CLIENT_TAX_ID,
    })
  }

  const tripRepository = new DrizzleTripRepository(database.db)
  const trip = await tripRepository.create({
    actorUserId: userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId,
    crew: [{ driverId, driverName: 'Motorista 185', driverTaxId: '11111111111', position: 1 }],
    vehicleId,
  })

  const tripDocumentIds: string[] = []
  for (let index = 1; index <= input.documentCount; index += 1) {
    const nfeDocumentId = await seedNfeDocument(database, {
      companyId,
      recipientTaxId: SCHEDULING_CLIENT_TAX_ID,
      suffix: String(index),
      userId,
    })
    const linked = await tripRepository.linkDocument({
      companyId,
      freightCalculationId: null,
      nfeDocumentId,
      tripId: trip.id,
    })
    tripDocumentIds.push(linked.id)
  }

  await planTripRoute({
    actorUserId: userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId,
    repository: new DrizzleTripRouteRepository(database.db),
    tripId: trip.id,
  })

  return { companyId, tripDocumentIds, tripId: trip.id, userId }
}

async function moveDocument(
  database: TestDatabase,
  trip: SeededTrip,
  documentId: string,
  actions: readonly ('load' | 'separate')[],
): Promise<void> {
  const repository = new DrizzleTripDocumentRepository(database.db)
  for (const action of actions) {
    await transitionTripDocument({
      action,
      actorUserId: trip.userId,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: trip.companyId,
      documentId,
      repository,
      tripId: trip.tripId,
    })
  }
}

async function seedSeparationOccurrence(
  database: TestDatabase,
  trip: SeededTrip,
  input: {
    readonly leavesDocumentBehind: boolean
    readonly productCodes: readonly string[]
    readonly tripDocumentId: string
  },
): Promise<string> {
  const occurrenceTypeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    companyId: trip.companyId,
    id: occurrenceTypeId,
    leavesDocumentBehind: input.leavesDocumentBehind,
    name: LEAVES_BEHIND_TYPE_NAME,
    stage: 'separation',
  })

  const occurrenceId = crypto.randomUUID()
  await database.db.insert(tripDocumentOccurrences).values({
    actorUserId: trip.userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId: trip.companyId,
    id: occurrenceId,
    occurrenceTypeId,
    productCode: input.productCodes[0] ?? '',
    stage: 'separation',
    tripDocumentId: input.tripDocumentId,
  })
  if (input.productCodes.length === 0) return occurrenceId

  await database.db.insert(tripDocumentOccurrenceProducts).values(
    input.productCodes.map((productCode, position) => ({
      companyId: trip.companyId,
      occurrenceId,
      position,
      productCode,
    })),
  )
  return occurrenceId
}

/** A tratativa da ocorrência (spec 164), já no status pedido — com o que as CHECKs exigem dele. */
async function seedOccurrenceCase(
  database: TestDatabase,
  trip: SeededTrip,
  input: { readonly occurrenceId: string; readonly status: TripOccurrenceCaseStatus },
): Promise<void> {
  const isDecided = input.status === 'decided' || input.status === 'closed'
  const isResolved = (OCCURRENCE_CASE_TERMINAL_STATUSES as readonly string[]).includes(input.status)
  const now = new Date()
  await database.db.insert(tripOccurrenceCases).values({
    companyId: trip.companyId,
    occurrenceId: input.occurrenceId,
    redeliveryPolicy: 'allowed',
    status: input.status,
    ...(isDecided
      ? {
          decidedAt: now,
          decidedByUserId: trip.userId,
          decisionKind: 'other',
          decisionNote: 'Decidido no teste.',
        }
      : {}),
    ...(isResolved ? { resolvedAt: now } : {}),
  })
}

async function readDocumentStates(
  database: TestDatabase,
  tripDocumentIds: readonly string[],
): Promise<Map<string, { readonly isReleased: boolean; readonly separationStatus: string }>> {
  const rows = await database.db
    .select({
      id: tripDocuments.id,
      releasedAt: tripDocuments.releasedAt,
      separationStatus: tripDocuments.separationStatus,
    })
    .from(tripDocuments)
    .where(inArray(tripDocuments.id, [...tripDocumentIds]))

  return new Map(
    tripDocumentIds.map((id) => {
      const row = rows.find((candidate) => candidate.id === id)
      if (row === undefined) throw new Error('EXPECTED_TRIP_DOCUMENT')
      return [id, { isReleased: row.releasedAt !== null, separationStatus: row.separationStatus }]
    }),
  )
}

/** Ordem do eixo da nota: as duas escritas do despacho têm o mesmo `now()` da transação. */
const DOCUMENT_STATUS_RANK: Readonly<Record<string, number>> = {
  pending: 0,
  separated: 1,
  loaded: 2,
}

async function readDocumentEvents(
  database: TestDatabase,
  tripDocumentId: string,
): Promise<readonly { channel: string; fromStatus: string | null; toStatus: string }[]> {
  const rows = await database.db
    .select({
      channel: tripDocumentEvents.channel,
      fromStatus: tripDocumentEvents.fromStatus,
      toStatus: tripDocumentEvents.toStatus,
    })
    .from(tripDocumentEvents)
    .where(eq(tripDocumentEvents.tripDocumentId, tripDocumentId))
  return rows.toSorted(
    (left, right) =>
      (DOCUMENT_STATUS_RANK[left.toStatus] ?? 9) - (DOCUMENT_STATUS_RANK[right.toStatus] ?? 9),
  )
}

async function countDocumentEvents(
  database: TestDatabase,
  tripDocumentIds: readonly string[],
): Promise<number> {
  const rows = await database.db
    .select({ id: tripDocumentEvents.id })
    .from(tripDocumentEvents)
    .where(inArray(tripDocumentEvents.tripDocumentId, [...tripDocumentIds]))
  return rows.length
}

async function readSnapshot(
  database: TestDatabase,
  tripId: string,
): Promise<typeof tripDispatchSnapshots.$inferSelect | undefined> {
  const [row] = await database.db
    .select()
    .from(tripDispatchSnapshots)
    .where(eq(tripDispatchSnapshots.tripId, tripId))
  return row
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
): Promise<readonly { actorUserId: string; channel: string; toStatus: TripStatus }[]> {
  return database.db
    .select({
      actorUserId: tripStatusEvents.actorUserId,
      channel: tripStatusEvents.channel,
      toStatus: tripStatusEvents.toStatus,
    })
    .from(tripStatusEvents)
    .where(eq(tripStatusEvents.tripId, tripId))
    .orderBy(asc(tripStatusEvents.occurredAt), asc(tripStatusEvents.id))
}

async function seedNfeDocument(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly recipientTaxId: string
    readonly suffix: string
    readonly userId: string
  },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = input.suffix.repeat(64)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/185-${input.suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-185-${input.suffix}`,
    id: importId,
    idempotencyKey: `spec-185-${input.suffix}`,
    requestFingerprint: `fingerprint-185-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.suffix}${'1'.repeat(43)}`,
    authorizationProtocol: `protocol-185-${input.suffix}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-24T12:00:00.000Z'),
    model: '55',
    number: input.suffix,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '10000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '10000.0000',
    xmlObjectId,
    xmlSha256: sha,
  })

  const participantId = crypto.randomUUID()
  await database.db.insert(nfeParticipants).values({
    companyId: input.companyId,
    documentId,
    id: participantId,
    role: 'recipient',
    taxId: input.recipientTaxId,
  })
  await database.db.insert(nfeAddresses).values({
    city: 'Ribeirao Preto',
    cityCode: '3543402',
    companyId: input.companyId,
    number: '100',
    participantId,
    postalCode: '14010100',
    state: 'SP',
    street: 'Rua da Carga Fechada',
  })

  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_s185t31_${crypto.randomUUID().replaceAll('-', '')}`
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
