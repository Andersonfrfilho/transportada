/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T3, contra Postgres real: o escritório encaixa a coleta de canhoto na viagem de outro motorista, numa
 * parada no endereço da entrega de origem (RF4); a carga da viagem nova fica igual (CA03b); desencaixar, mover,
 * retirar a parada, cancelar ou concluir a viagem devolvem a coleta a `pending` (casos extremos), e a nota que sai de
 * uma parada com coleta não a apaga (a FK da coleta para a parada é `restrict`).
 *
 * Spec 321 T8: encaixar a coleta numa viagem nova conclui a ocorrência sozinha (`resolved` do `system`, causa
 * `scheduled`, frase `canhoto_scheduled`), na transação do encaixe; desencaixar, retirar a parada, cancelar a viagem e
 * re-encaixar não reabrem nem duplicam.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { tripOccurrenceResolutionEvents } from '../../src/database/occurrence-conversation.schema.js'

import { auditLogs } from '../../src/database/fiscal-operation.schema.js'
import { fleetVehicles } from '../../src/database/database.schema.js'
import {
  tripCanhotoPickups,
  tripDocumentOccurrences,
  tripDocuments,
  tripStops,
  trips,
  type TripStatus,
} from '../../src/database/trip.schema.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { createDrizzleCanhotoPickupSchedule } from '../../src/trips/infrastructure/canhoto-pickup-schedule.persistence.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { listAllResolutionEventsByOccurrence } from '../../src/trips/infrastructure/drizzle-occurrence-resolution.repository.js'
import {
  resolveOccurrenceResolutionState,
  resolveSystemResolutionCausePhraseKey,
} from '../../src/trips/domain/occurrence-resolution.policy.js'
import {
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 120_000
const DELIVERED_AT = new Date('2026-09-18T15:00:00.000Z')

type World = Readonly<{
  company: Company
  database: TestDatabase
  occurrenceId: string
  origin: SeededTrip
  pickupId: string
}>

async function seedPickupType(database: TestDatabase, company: Company): Promise<string> {
  const saved = await saveOccurrenceType(database.db, {
    active: true,
    allowsMultipleItems: false,
    blocksContractorNotice: true,
    companyId: company.companyId,
    countsCargoOnPickupTrip: false,
    createsCanhotoPickup: true,
    duplicateRequestPolicy: 'until_resolved',
    emailTemplateKey: null,
    moments: ['document', 'office'],
    name: 'Canhoto retido pelo cliente',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
  })
  return saved.id
}

/** A entrega de origem: viagem na rua, nota entregue, e a ocorrência com coleta registrada pelo motorista (T2). */
async function buildWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const origin = await seedTrip(database, company, 'on_delivery_route')
  await database.db
    .update(tripDocuments)
    .set({ deliveredAt: DELIVERED_AT, separationStatus: 'delivered' })
    .where(eq(tripDocuments.id, origin.documentId))
  const typeId = await seedPickupType(database, company)
  const occurrence = await registerDriverOccurrence({
    actorUserId: company.userId,
    companyId: company.companyId,
    documentId: origin.documentId,
    driverId: company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente ficou com o canhoto',
    occurrenceTypeId: typeId,
    productCode: '',
    repository: {
      findConfirmedUpload: async () => null,
      findOccurrenceType: (query) => findOccurrenceType(database.db, query),
      findOccurrenceTypeOverrides: async () => ({
        contractorOverrides: [],
        recipientOverrides: [],
      }),
      findReachableDocument: (query) => findDriverReachableDocument(database.db, query),
      listDocumentProducts: (query) => listDocumentProducts(database.db, query),
    },
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
  })
  const [pickup] = await database.db
    .select({ id: tripCanhotoPickups.id })
    .from(tripCanhotoPickups)
    .where(eq(tripCanhotoPickups.occurrenceId, occurrence.id))
  if (pickup === undefined) throw new Error('pickup not created')
  return { company, database, occurrenceId: occurrence.id, origin, pickupId: pickup.id }
}

/** A viagem de outro motorista, num caminhão com baú medido — para a ocupação ser calculada de verdade (CA03b). */
async function seedTargetTrip(world: World, status: TripStatus): Promise<SeededTrip> {
  const target = await seedTrip(world.database, world.company, status)
  const truckId = crypto.randomUUID()
  await world.database.db.insert(fleetVehicles).values({
    bodyType: '02',
    companyId: world.company.companyId,
    id: truckId,
    plate: `TRK${Math.floor(Math.random() * 9000 + 1000)}`,
    role: 'traction',
    state: 'SP',
    vehicleType: 'truck',
  })
  await world.database.db
    .update(trips)
    .set({ vehicleId: truckId })
    .where(eq(trips.id, target.tripId))
  return target
}

function writer(world: World) {
  return createDrizzleCanhotoPickupSchedule(world.database.db)
}

const actor = (world: World) => ({
  actorUserId: world.company.userId,
  companyId: world.company.companyId,
  correlationId: 'integration-canhoto-pickup-schedule',
})

async function readPickup(world: World) {
  const [row] = await world.database.db
    .select()
    .from(tripCanhotoPickups)
    .where(eq(tripCanhotoPickups.id, world.pickupId))
  return row
}

async function readStops(world: World, tripId: string) {
  return world.database.db
    .select()
    .from(tripStops)
    .where(and(eq(tripStops.companyId, world.company.companyId), eq(tripStops.tripId, tripId)))
    .orderBy(tripStops.sequence)
}

async function originStop(world: World) {
  const [stop] = await world.database.db
    .select()
    .from(tripStops)
    .where(eq(tripStops.id, world.origin.stopId))
  if (stop === undefined) throw new Error('origin stop missing')
  return stop
}

async function errorOf(promise: Promise<unknown>): Promise<{ code?: unknown; status?: unknown }> {
  try {
    await promise
  } catch (error) {
    return error as { code?: unknown; status?: unknown }
  }
  throw new Error('expected an error')
}

describe('o encaixe da coleta de canhoto (spec 321 T3)', () => {
  testWithPostgres(
    'encaixa numa parada nova no endereço da entrega, sem mudar a carga da viagem (RF4, CA03b)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const target = await seedTargetTrip(world, 'route_planned')
        const repository = new DrizzleTripRepository(database.db)
        const before = await repository.findById({
          companyId: world.company.companyId,
          tripId: target.tripId,
        })
        expect(before?.occupancy).not.toBeNull()
        const documentsBefore = await database.db
          .select()
          .from(tripDocuments)
          .where(eq(tripDocuments.tripId, target.tripId))

        const result = await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: target.tripId,
        })

        const origin = await originStop(world)
        const stops = await readStops(world, target.tripId)
        expect(stops).toHaveLength(2)
        const pickupStop = stops[1]
        expect(pickupStop).toMatchObject({ addressKey: origin.addressKey, label: origin.label })
        expect(pickupStop?.sequence).toBe(2n)
        expect(result.tripsToRefreeze).toEqual([target.tripId])
        expect(result.pickup).toMatchObject({
          id: world.pickupId,
          originStopLabel: origin.label,
          originTripId: world.origin.tripId,
          pickupStopId: pickupStop?.id,
          pickupTripId: target.tripId,
          status: 'scheduled',
        })
        expect(await readPickup(world)).toMatchObject({
          pickupStopId: pickupStop?.id,
          pickupTripId: target.tripId,
          status: 'scheduled',
        })

        /** CA03b: peso, volume e ocupação da viagem nova iguais; a coleta não vira linha de nota (D3/D4). */
        const after = await repository.findById({
          companyId: world.company.companyId,
          tripId: target.tripId,
        })
        expect(after?.cargoWeight).toEqual(before?.cargoWeight ?? null)
        expect(after?.occupancy).toEqual(before?.occupancy ?? null)
        expect(
          await database.db
            .select()
            .from(tripDocuments)
            .where(eq(tripDocuments.tripId, target.tripId)),
        ).toEqual(documentsBefore)

        const audit = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityId, world.pickupId))
        expect(audit.map((row) => row.action)).toEqual(['canhoto_pickup.scheduled'])
        expect(audit[0]?.permission).toBe('trip.report-on-behalf')

        /** De novo na mesma viagem: nada muda. */
        const again = await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: target.tripId,
        })
        expect(again.tripsToRefreeze).toEqual([])
        expect(await readStops(world, target.tripId)).toHaveLength(2)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'reaproveita a parada aberta da viagem no mesmo endereço; a parada fica com a nota quando a coleta sai',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const target = await seedTargetTrip(world, 'on_delivery_route')
        const origin = await originStop(world)
        await database.db
          .update(tripStops)
          .set({ addressKey: origin.addressKey })
          .where(eq(tripStops.id, target.stopId))

        const scheduled = await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: target.tripId,
        })
        expect(scheduled.pickup.pickupStopId).toBe(target.stopId)
        expect(scheduled.tripsToRefreeze).toEqual([])
        expect(await readStops(world, target.tripId)).toHaveLength(1)

        const unscheduled = await writer(world).unschedule({
          ...actor(world),
          pickupId: world.pickupId,
        })
        expect(unscheduled.pickup).toMatchObject({
          pickupStopId: null,
          pickupTripId: null,
          status: 'pending',
        })
        /** A parada tem nota viva: fica. */
        expect(await readStops(world, target.tripId)).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'desencaixar e mover apagam a parada que era só da coleta; a nota que sai de uma parada com coleta não a apaga',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const first = await seedTargetTrip(world, 'draft')
        const second = await seedTargetTrip(world, 'draft')

        await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: first.tripId,
        })
        expect(await readStops(world, first.tripId)).toHaveLength(2)

        const moved = await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: second.tripId,
        })
        expect(moved.pickup.pickupTripId).toBe(second.tripId)
        expect([...moved.tripsToRefreeze].sort()).toEqual([first.tripId, second.tripId].sort())
        expect(await readStops(world, first.tripId)).toHaveLength(1)
        expect(await readStops(world, second.tripId)).toHaveLength(2)

        /** A coleta ocupa a parada: soltar a última nota dela não apaga a parada (FK restrict). */
        const origin = await originStop(world)
        await database.db
          .update(tripStops)
          .set({ addressKey: `${origin.addressKey}-other` })
          .where(eq(tripStops.id, second.stopId))
        const pickupStopId = (await readPickup(world))?.pickupStopId ?? ''
        await database.db
          .update(tripDocuments)
          .set({ stopId: pickupStopId })
          .where(eq(tripDocuments.id, second.documentId))
        await database.db.delete(tripStops).where(eq(tripStops.id, second.stopId))
        const released = await new DrizzleTripRepository(database.db).releaseDocument({
          actor: { channel: 'backoffice', userId: world.company.userId },
          companyId: world.company.companyId,
          documentId: second.documentId,
          tripId: second.tripId,
        })
        expect(released).not.toBeNull()
        expect((await readStops(world, second.tripId)).map((stop) => stop.id)).toEqual([
          pickupStopId,
        ])

        const unscheduled = await writer(world).unschedule({
          ...actor(world),
          pickupId: world.pickupId,
        })
        expect(unscheduled.tripsToRefreeze).toEqual([second.tripId])
        expect(await readStops(world, second.tripId)).toHaveLength(0)
        const audit = await database.db
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(eq(auditLogs.entityId, world.pickupId))
        expect(audit.map((row) => row.action).sort()).toEqual([
          'canhoto_pickup.scheduled',
          'canhoto_pickup.scheduled',
          'canhoto_pickup.unscheduled',
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'retirar a parada do rascunho leva a coleta junto, de volta a pending',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const target = await seedTargetTrip(world, 'draft')
        const scheduled = await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: target.tripId,
        })

        const result = await new DrizzleTripRepository(database.db).retireStop({
          actor: { channel: 'backoffice', userId: world.company.userId },
          companyId: world.company.companyId,
          stopId: scheduled.pickup.pickupStopId ?? '',
          tripId: target.tripId,
        })
        expect(result).toEqual({ hasDeliveredDocument: false, released: [] })
        expect((await readPickup(world))?.status).toBe('pending')
        expect((await readStops(world, target.tripId)).map((stop) => stop.id)).toEqual([
          target.stopId,
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a viagem cancelada ou concluída devolve a coleta a pending, e a parada fica no histórico',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const cancelled = await seedTargetTrip(world, 'route_planned')
        await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: cancelled.tripId,
        })
        await new DrizzleTripRouteRepository(database.db).markCancelled({
          actorUserId: world.company.userId,
          channel: 'backoffice',
          companyId: world.company.companyId,
          onBehalfOfDriverId: null,
          tripId: cancelled.tripId,
        })
        expect(await readPickup(world)).toMatchObject({
          pickupStopId: null,
          pickupTripId: null,
          status: 'pending',
        })
        expect(await readStops(world, cancelled.tripId)).toHaveLength(2)

        const completed = await seedTargetTrip(world, 'on_delivery_route')
        await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: completed.tripId,
        })
        const closed = await new DrizzleTripRepository(database.db).close({
          actorUserId: world.company.userId,
          channel: 'backoffice',
          closeReason: 'canhoto não veio',
          companyId: world.company.companyId,
          correlationId: 'integration-close',
          ipAddress: '127.0.0.1',
          onBehalfOfDriverId: null,
          tripId: completed.tripId,
        })
        expect(closed?.status).toBe('completed')
        expect(await readPickup(world)).toMatchObject({
          pickupStopId: null,
          pickupTripId: null,
          status: 'pending',
        })
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'recusa a viagem de origem, viagem finalizada, coleta fechada e coleta de outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        const schedule = (tripId: string) =>
          writer(world).schedule({ ...actor(world), pickupId: world.pickupId, tripId })

        expect(await errorOf(schedule(world.origin.tripId))).toMatchObject({
          code: 'CANHOTO_PICKUP_ORIGIN_TRIP',
          status: 422,
        })
        const done = await seedTargetTrip(world, 'completed')
        expect(await errorOf(schedule(done.tripId))).toMatchObject({
          code: 'CANHOTO_PICKUP_TRIP_CLOSED',
          status: 409,
        })
        expect(await errorOf(schedule(crypto.randomUUID()))).toMatchObject({
          code: 'TRIP_NOT_FOUND',
          status: 404,
        })
        expect(
          await errorOf(writer(world).unschedule({ ...actor(world), pickupId: world.pickupId })),
        ).toMatchObject({ code: 'CANHOTO_PICKUP_NOT_SCHEDULED', status: 409 })

        /** Outra empresa: a coleta não existe para ela, e a viagem dela não serve de alvo. */
        const stranger = await seedCompany(database)
        const strangerTrip = await seedTrip(database, stranger, 'draft')
        expect(
          await errorOf(
            writer(world).schedule({
              actorUserId: stranger.userId,
              companyId: stranger.companyId,
              correlationId: 'x',
              pickupId: world.pickupId,
              tripId: strangerTrip.tripId,
            }),
          ),
        ).toMatchObject({ code: 'CANHOTO_PICKUP_NOT_FOUND', status: 404 })
        expect(await errorOf(schedule(strangerTrip.tripId))).toMatchObject({
          code: 'TRIP_NOT_FOUND',
          status: 404,
        })
        expect(
          await writer(world).list({
            companyId: stranger.companyId,
            limit: 100,
            statuses: [],
          }),
        ).toEqual([])

        const open = await seedTargetTrip(world, 'draft')
        await database.db
          .update(tripCanhotoPickups)
          .set({ collectedAt: new Date(), status: 'collected' })
          .where(eq(tripCanhotoPickups.id, world.pickupId))
        expect(await errorOf(schedule(open.tripId))).toMatchObject({
          code: 'CANHOTO_PICKUP_CLOSED',
          status: 409,
        })
        const listed = await writer(world).list({
          companyId: world.company.companyId,
          limit: 100,
          statuses: ['pending', 'scheduled'],
        })
        expect(listed).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )
})

async function readResolutionEvents(world: World) {
  return world.database.db
    .select({
      actorKind: tripOccurrenceResolutionEvents.actorKind,
      canhotoPickupCause: tripOccurrenceResolutionEvents.canhotoPickupCause,
      canhotoPickupId: tripOccurrenceResolutionEvents.canhotoPickupId,
      kind: tripOccurrenceResolutionEvents.kind,
    })
    .from(tripOccurrenceResolutionEvents)
    .where(eq(tripOccurrenceResolutionEvents.documentOccurrenceId, world.occurrenceId))
    .orderBy(tripOccurrenceResolutionEvents.sequence)
}

async function readResolutionState(world: World) {
  const events = await listAllResolutionEventsByOccurrence(world.database.db, {
    companyId: world.company.companyId,
    occurrenceIds: [world.occurrenceId],
    occurrenceKind: 'document',
  })
  return resolveOccurrenceResolutionState({
    cancelledAt: undefined,
    events: events.get(world.occurrenceId) ?? [],
  })
}

describe('o encaixe conclui a ocorrência do canhoto retido (spec 321 T8)', () => {
  testWithPostgres(
    'encaixar em outra viagem resolve pelo sistema (canhoto_scheduled); desencaixar, retirar, cancelar e re-encaixar não reabrem nem duplicam',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        expect(await readResolutionEvents(world)).toEqual([])

        const first = await seedTargetTrip(world, 'draft')
        const scheduled = await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: first.tripId,
        })
        const resolvedOnce = [
          {
            actorKind: 'system' as const,
            canhotoPickupCause: 'scheduled',
            canhotoPickupId: world.pickupId,
            kind: 'resolved' as const,
          },
        ]
        expect(await readResolutionEvents(world)).toEqual(resolvedOnce)
        const state = await readResolutionState(world)
        expect(state.state).toBe('resolved')
        expect(state.lastResolution).toMatchObject({
          canhotoPickupScheduled: true,
          causedByCanhotoPickup: true,
        })
        expect(
          resolveSystemResolutionCausePhraseKey(
            state.lastResolution ?? { caseEventStatus: undefined },
          ),
        ).toBe('canhoto_scheduled')
        /** A coleta segue aberta (o canhoto ainda não chegou): só a ocorrência conclui. */
        expect((await readPickup(world))?.status).toBe('scheduled')

        /** Encaixar de novo na mesma viagem não muda nada. */
        await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: first.tripId,
        })
        expect(await readResolutionEvents(world)).toEqual(resolvedOnce)

        /** Retirar a parada do rascunho devolve a coleta a pending e não reabre. */
        await new DrizzleTripRepository(database.db).retireStop({
          actor: { channel: 'backoffice', userId: world.company.userId },
          companyId: world.company.companyId,
          stopId: scheduled.pickup.pickupStopId ?? '',
          tripId: first.tripId,
        })
        expect((await readPickup(world))?.status).toBe('pending')
        expect(await readResolutionEvents(world)).toEqual(resolvedOnce)

        /** Re-encaixar (o mesmo motorista ou outro, noutra viagem) não grava outro resolved. */
        const second = await seedTargetTrip(world, 'route_planned')
        await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: second.tripId,
        })
        expect(await readResolutionEvents(world)).toEqual(resolvedOnce)

        /** Mover para uma terceira viagem e depois desencaixar: nada reabre. */
        const third = await seedTargetTrip(world, 'on_delivery_route')
        await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: third.tripId,
        })
        await writer(world).unschedule({ ...actor(world), pickupId: world.pickupId })
        expect((await readPickup(world))?.status).toBe('pending')
        expect(await readResolutionEvents(world)).toEqual(resolvedOnce)

        /** A viagem da coleta cancelada devolve a coleta a pending e também não reabre. */
        await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: second.tripId,
        })
        await new DrizzleTripRouteRepository(database.db).markCancelled({
          actorUserId: world.company.userId,
          channel: 'backoffice',
          companyId: world.company.companyId,
          onBehalfOfDriverId: null,
          tripId: second.tripId,
        })
        expect((await readPickup(world))?.status).toBe('pending')
        expect(await readResolutionEvents(world)).toEqual(resolvedOnce)
        expect((await readResolutionState(world)).state).toBe('resolved')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a ocorrência cancelada ou já resolvida pelo escritório não ganha resolved do sistema no encaixe',
    async () => {
      await withDisposableDatabase(async (database) => {
        const cancelledWorld = await buildWorld(database)
        await database.db
          .update(tripDocumentOccurrences)
          .set({
            cancellationReason: 'registrada por engano',
            cancelledAt: new Date(),
            cancelledByUserId: cancelledWorld.company.userId,
          })
          .where(eq(tripDocumentOccurrences.id, cancelledWorld.occurrenceId))
        const target = await seedTargetTrip(cancelledWorld, 'draft')
        await writer(cancelledWorld).schedule({
          ...actor(cancelledWorld),
          pickupId: cancelledWorld.pickupId,
          tripId: target.tripId,
        })
        expect(await readResolutionEvents(cancelledWorld)).toEqual([])
      })

      await withDisposableDatabase(async (database) => {
        const world = await buildWorld(database)
        await database.db.insert(tripOccurrenceResolutionEvents).values({
          actorKind: 'internal',
          actorUserId: world.company.userId,
          companyId: world.company.companyId,
          documentOccurrenceId: world.occurrenceId,
          kind: 'resolved',
          note: 'resolvida pelo escritório',
        })
        const target = await seedTargetTrip(world, 'draft')
        await writer(world).schedule({
          ...actor(world),
          pickupId: world.pickupId,
          tripId: target.tripId,
        })
        expect(await readResolutionEvents(world)).toEqual([
          {
            actorKind: 'internal',
            canhotoPickupCause: null,
            canhotoPickupId: null,
            kind: 'resolved',
          },
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )
})
