/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T15: as correções da revisão de código e de segurança das rotas do escritório, contra o
 * Postgres de verdade. O molde (banco descartável, empresa, viagem, rotas) é o de
 * `trip-field-office.integration.ts`, pela fixture compartilhada.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { tripStatusEvents, tripStops } from '../../src/database/trip.schema.js'
import {
  fakeContext,
  multipartRequest,
  seedCompany,
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
