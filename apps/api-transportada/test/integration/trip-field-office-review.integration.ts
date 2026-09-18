/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T15: as correções da revisão de código e de segurança das rotas do escritório, contra o
 * Postgres de verdade. O molde (banco descartável, empresa, viagem, rotas) é o de
 * `trip-field-office.integration.ts`, pela fixture compartilhada.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  tripStatusEvents,
  tripStopEvents,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import {
  fakeContext,
  jsonRequest,
  multipartRequest,
  seedCompany,
  seedDispatchSnapshot,
  seedExtraDocument,
  seedTrip,
  testWithPostgres,
  wireRoutes,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

describe('a parada do escritório fecha sem chegada registrada (T15 C1, M3)', () => {
  testWithPostgres(
    'C1: entregar todas as notas de uma parada sem chegada fecha a parada com arrived_at da entrega',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const [, , , , deliverRoute] = wireRoutes(database)
        const deliveredAt = '2026-09-18T09:00:00.000Z'

        const response = await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'review-c1',
          pathParameters: { documentId: trip.documentId, id: trip.tripId },
          request: multipartRequest({
            fields: { deliveredAt },
            idempotencyKey: 'review-c1-delivery',
          }),
        })

        expect(response.status).toBe(201)
        expect(await response.json()).toMatchObject({
          data: { stopCompleted: true, tripCompleted: true },
        })
        const [stop] = await database.db
          .select({ arrivedAt: tripStops.arrivedAt, completedAt: tripStops.completedAt })
          .from(tripStops)
          .where(eq(tripStops.id, trip.stopId))
        expect(stop?.arrivedAt?.toISOString()).toBe(deliveredAt)
        expect(stop?.completedAt?.toISOString()).toBe(deliveredAt)
      })
    },
  )

  testWithPostgres(
    'M3: a parada e a viagem fecham com o maior deliveredAt das notas, não com o da última informada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const secondDocumentId = await seedExtraDocument(database, company, trip, {
          separationStatus: 'loaded',
          stopId: trip.stopId,
        })
        const [, , , , deliverRoute] = wireRoutes(database)

        const deliver = async (documentId: string, deliveredAt: string, key: string) =>
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: key,
            pathParameters: { documentId, id: trip.tripId },
            request: multipartRequest({ fields: { deliveredAt }, idempotencyKey: key }),
          })

        expect((await deliver(secondDocumentId, '2026-09-18T10:00:00.000Z', 'm3-a')).status).toBe(
          201,
        )
        expect((await deliver(trip.documentId, '2026-09-18T09:30:00.000Z', 'm3-b')).status).toBe(
          201,
        )

        const [stop] = await database.db
          .select({ arrivedAt: tripStops.arrivedAt, completedAt: tripStops.completedAt })
          .from(tripStops)
          .where(eq(tripStops.id, trip.stopId))
        expect(stop?.completedAt?.toISOString()).toBe('2026-09-18T10:00:00.000Z')
        expect(stop?.arrivedAt?.toISOString()).toBe('2026-09-18T09:30:00.000Z')

        const [completion] = await database.db
          .select({ occurredAt: tripStatusEvents.occurredAt })
          .from(tripStatusEvents)
          .where(
            and(
              eq(tripStatusEvents.tripId, trip.tripId),
              eq(tripStatusEvents.toStatus, 'completed'),
            ),
          )
        expect(completion?.occurredAt.toISOString()).toBe('2026-09-18T10:00:00.000Z')
      })
    },
  )
})

describe('a hora informada pelo escritório (T15 A1, M9, aceite 8)', () => {
  testWithPostgres(
    'A1: arrive com arrivedAt grava a chegada na hora informada, sem deslocar as outras paradas',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await database.db
          .update(trips)
          .set({ status: 'dispatched' })
          .where(eq(trips.id, trip.tripId))
        const plannedLater = new Date('2026-09-18T15:00:00.000Z')
        await database.db
          .update(tripStops)
          .set({ estimatedArrivalAt: new Date('2026-09-18T06:00:00.000Z') })
          .where(eq(tripStops.id, trip.stopId))
        const [laterStop] = await database.db
          .insert(tripStops)
          .values({
            addressKey: `3550308|01002000|${trip.tripId}`,
            companyId: company.companyId,
            estimatedArrivalAt: plannedLater,
            id: crypto.randomUUID(),
            label: 'Centro, 200',
            sequence: 2n,
            tripId: trip.tripId,
          })
          .returning({ id: tripStops.id })
        const [, , arriveRoute] = wireRoutes(database)
        const arrivedAt = '2026-09-18T08:30:00.000Z'

        const response = await arriveRoute!.execute({
          context: fakeContext(company),
          correlationId: 'review-a1',
          pathParameters: { id: trip.tripId, stopId: trip.stopId },
          request: jsonRequest({ body: { arrivedAt }, idempotencyKey: 'review-a1-arrive' }),
        })

        expect(response.status).toBe(201)
        const stops = await database.db
          .select({
            arrivedAt: tripStops.arrivedAt,
            estimatedArrivalAt: tripStops.estimatedArrivalAt,
            id: tripStops.id,
          })
          .from(tripStops)
          .where(eq(tripStops.tripId, trip.tripId))
        const arrived = stops.find((stop) => stop.id === trip.stopId)
        const later = stops.find((stop) => stop.id === laterStop?.id)
        expect(arrived?.arrivedAt?.toISOString()).toBe(arrivedAt)
        expect(later?.estimatedArrivalAt?.toISOString()).toBe(plannedLater.toISOString())

        const [event] = await database.db
          .select({ occurredAt: tripStopEvents.createdAt, recordedAt: tripStopEvents.recordedAt })
          .from(tripStopEvents)
          .where(eq(tripStopEvents.stopId, trip.stopId))
        expect(event?.occurredAt.toISOString()).toBe(arrivedAt)
        expect(event?.recordedAt.getTime()).toBeGreaterThan(new Date(arrivedAt).getTime())

        const [transit] = await database.db
          .select({ occurredAt: tripStatusEvents.occurredAt })
          .from(tripStatusEvents)
          .where(
            and(
              eq(tripStatusEvents.tripId, trip.tripId),
              eq(tripStatusEvents.toStatus, 'in_transit'),
            ),
          )
        expect(transit?.occurredAt.toISOString()).toBe(arrivedAt)
      })
    },
  )

  testWithPostgres('A1: arrivedAt no futuro responde 400 ARRIVED_AT_IN_FUTURE', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const [, , arriveRoute] = wireRoutes(database)

      await expect(
        arriveRoute!.execute({
          context: fakeContext(company),
          correlationId: 'review-a1-future',
          pathParameters: { id: trip.tripId, stopId: trip.stopId },
          request: jsonRequest({
            body: { arrivedAt: '2026-09-19T08:30:00.000Z' },
            idempotencyKey: 'review-a1-future',
          }),
        }),
      ).rejects.toMatchObject({ code: 'ARRIVED_AT_IN_FUTURE', status: 400 })
    })
  })

  testWithPostgres(
    'aceite 8: deliveredAt no futuro responde 400 DELIVERED_AT_IN_FUTURE, sem baixar a nota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedDispatchSnapshot(database, company, trip, new Date('2026-09-17T08:00:00.000Z'))
        const [, , , , deliverRoute] = wireRoutes(database)

        await expect(
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'review-aceite-8-future',
            pathParameters: { documentId: trip.documentId, id: trip.tripId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-18T14:00:00.000Z' },
              idempotencyKey: 'review-aceite-8-future',
            }),
          }),
        ).rejects.toMatchObject({ code: 'DELIVERED_AT_IN_FUTURE', status: 400 })
      })
    },
  )

  testWithPostgres(
    'M9: sem trip_dispatch_snapshots, deliveredAt antes da criação da viagem é recusado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const [, , , , deliverRoute] = wireRoutes(database)

        await expect(
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'review-m9',
            pathParameters: { documentId: trip.documentId, id: trip.tripId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-16T09:00:00.000Z' },
              idempotencyKey: 'review-m9',
            }),
          }),
        ).rejects.toMatchObject({ code: 'DELIVERED_AT_BEFORE_DISPATCH', status: 400 })
      })
    },
  )

  testWithPostgres(
    'returnedAt antes do despacho responde 400 RETURNED_AT_BEFORE_DISPATCH',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedDispatchSnapshot(database, company, trip, new Date('2026-09-17T08:00:00.000Z'))
        const [, , , , , returnRoute] = wireRoutes(database)

        await expect(
          returnRoute!.execute({
            context: fakeContext(company),
            correlationId: 'review-returned-at',
            pathParameters: { documentId: trip.documentId, id: trip.tripId },
            request: jsonRequest({
              body: { reason: 'recipient_absent', returnedAt: '2026-09-17T07:00:00.000Z' },
              idempotencyKey: 'review-returned-at',
            }),
          }),
        ).rejects.toMatchObject({ code: 'RETURNED_AT_BEFORE_DISPATCH', status: 400 })
      })
    },
  )
})

describe('nota já fechada no canal office (T15 M6)', () => {
  testWithPostgres(
    'M6: entregar nota devolvida responde 409 DOCUMENT_ALREADY_SETTLED antes da janela e da transição',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedDispatchSnapshot(database, company, trip, new Date('2026-09-17T08:00:00.000Z'))
        const returnedDocumentId = await seedExtraDocument(database, company, trip, {
          returnReason: 'recipient_absent',
          separationStatus: 'returned',
          stopId: trip.stopId,
        })
        const [, , , , deliverRoute] = wireRoutes(database)

        await expect(
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'review-m6-deliver',
            pathParameters: { documentId: returnedDocumentId, id: trip.tripId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-16T09:00:00.000Z' },
              idempotencyKey: 'review-m6-deliver',
            }),
          }),
        ).rejects.toMatchObject({ code: 'DOCUMENT_ALREADY_SETTLED', status: 409 })
      })
    },
  )

  testWithPostgres(
    'M6: devolver nota entregue responde 409 DOCUMENT_ALREADY_SETTLED, mesmo com hora fora da janela',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const [, , , , deliverRoute, returnRoute] = wireRoutes(database)
        await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'review-m6-first',
          pathParameters: { documentId: trip.documentId, id: trip.tripId },
          request: multipartRequest({
            fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
            idempotencyKey: 'review-m6-first',
          }),
        })

        await expect(
          returnRoute!.execute({
            context: fakeContext(company),
            correlationId: 'review-m6-return',
            pathParameters: { documentId: trip.documentId, id: trip.tripId },
            request: jsonRequest({
              body: { reason: 'recipient_absent', returnedAt: '2026-09-16T07:00:00.000Z' },
              idempotencyKey: 'review-m6-return',
            }),
          }),
        ).rejects.toMatchObject({ code: 'DOCUMENT_ALREADY_SETTLED', status: 409 })
      })
    },
  )
})
