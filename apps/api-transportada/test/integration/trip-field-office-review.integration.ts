/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T15: as correções da revisão de código e de segurança das rotas do escritório, contra o
 * Postgres de verdade. O molde (banco descartável, empresa, viagem, rotas) é o de
 * `trip-field-office.integration.ts`, pela fixture compartilhada.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { auditLogs } from '../../src/database/database.schema.js'
import {
  tripDeliveryProofs,
  tripFieldReports,
  tripStatusEvents,
  tripStopEvents,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import {
  JPEG_BYTES,
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
            // O relógio da chegada é o real: uma data fixa vence no dia seguinte.
            body: { arrivedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
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

describe('assinatura exigida no canal office (T15 A2, ADR-0067 §5 D8)', () => {
  testWithPostgres(
    'A2: com assinatura required, canhoto sem nome do recebedor responde 422 e não baixa a nota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await database.db
          .insert(companyDeliveryProofSettings)
          .values({ companyId: company.companyId, signature: 'required' })
        const [, , , , deliverRoute] = wireRoutes(database)

        await expect(
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'review-a2-name',
            pathParameters: { documentId: trip.documentId, id: trip.tripId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-18T09:00:00.000Z', receiverName: '   ' },
              file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
              idempotencyKey: 'review-a2-name',
            }),
          }),
        ).rejects.toMatchObject({ code: 'TRIP_DELIVERY_PROOF_RECEIVER_NAME_REQUIRED', status: 422 })

        await expect(
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'review-a2-photo',
            pathParameters: { documentId: trip.documentId, id: trip.tripId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-18T09:00:00.000Z', receiverName: 'Ana' },
              idempotencyKey: 'review-a2-photo',
            }),
          }),
        ).rejects.toMatchObject({ code: 'TRIP_DELIVERY_PROOF_PHOTO_REQUIRED', status: 422 })
      })
    },
  )

  testWithPostgres(
    'A2: o documento do recebedor entra selado e mascarado, no envelope do motorista (ADR-0057 §3)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await database.db.insert(companyDeliveryProofSettings).values({
          companyId: company.companyId,
          receiverDocument: 'optional',
          signature: 'required',
        })
        const [, , , , deliverRoute] = wireRoutes(database)

        const response = await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'review-a2-document',
          pathParameters: { documentId: trip.documentId, id: trip.tripId },
          request: multipartRequest({
            fields: {
              deliveredAt: '2026-09-18T09:00:00.000Z',
              receiverDocument: '11144477735',
              receiverName: 'Ana',
            },
            file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
            idempotencyKey: 'review-a2-document',
          }),
        })

        expect(response.status).toBe(201)
        const [proof] = await database.db
          .select({
            envelope: tripDeliveryProofs.receiverDocumentEnvelope,
            masked: tripDeliveryProofs.receiverDocumentMasked,
            receiverName: tripDeliveryProofs.receiverName,
          })
          .from(tripDeliveryProofs)
        expect(proof?.masked).toBe('***.444.777-**')
        expect(proof?.envelope).not.toBeNull()
        expect(proof?.receiverName).toBe('Ana')
      })
    },
  )
})

describe('field-proof do escritório (T15 M1, M2)', () => {
  testWithPostgres(
    'M1: canhoto do escritório sobre o do escritório substitui, e a auditoria guarda o objeto anterior',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const [, , , , deliverRoute, , proofRoute] = wireRoutes(database)
        await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'review-m1-deliver',
          pathParameters: { documentId: trip.documentId, id: trip.tripId },
          request: multipartRequest({
            fields: { deliveredAt: '2026-09-18T09:00:00.000Z', receiverName: 'Ana' },
            file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
            idempotencyKey: 'review-m1-deliver',
          }),
        })
        const [before] = await database.db
          .select({ objectId: tripDeliveryProofs.objectId })
          .from(tripDeliveryProofs)

        const response = await proofRoute!.execute({
          context: fakeContext(company),
          correlationId: 'review-m1-proof',
          pathParameters: { documentId: trip.documentId, id: trip.tripId },
          request: multipartRequest({
            fields: { receiverName: 'Ana Paula' },
            file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
            idempotencyKey: 'review-m1-proof',
          }),
        })

        expect(response.status).toBe(201)
        const proofs = await database.db
          .select({ objectId: tripDeliveryProofs.objectId })
          .from(tripDeliveryProofs)
        expect(proofs).toHaveLength(1)
        expect(proofs[0]?.objectId).not.toBe(before?.objectId)
        const [audit] = await database.db
          .select({ metadata: auditLogs.metadata })
          .from(auditLogs)
          .where(eq(auditLogs.action, 'trip_field_office.document_proof'))
        expect(audit?.metadata).toMatchObject({ replacedObjectId: before?.objectId })
      })
    },
  )
})

describe('a baixa de campo adianta a viagem para on_delivery_route (T15 M4, ADR-0058 §3)', () => {
  testWithPostgres(
    'M4: a primeira nota entregue pelo escritório leva in_transit a on_delivery_route, com a hora informada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedExtraDocument(database, company, trip, {
          separationStatus: 'loaded',
          stopId: trip.stopId,
        })
        const [, , , , deliverRoute] = wireRoutes(database)
        const deliveredAt = '2026-09-18T09:00:00.000Z'

        const response = await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'review-m4',
          pathParameters: { documentId: trip.documentId, id: trip.tripId },
          request: multipartRequest({ fields: { deliveredAt }, idempotencyKey: 'review-m4' }),
        })

        expect(response.status).toBe(201)
        const [tripRow] = await database.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, trip.tripId))
        expect(tripRow?.status).toBe('on_delivery_route')
        const events = await database.db
          .select({
            channel: tripStatusEvents.channel,
            fromStatus: tripStatusEvents.fromStatus,
            occurredAt: tripStatusEvents.occurredAt,
            onBehalfOfDriverId: tripStatusEvents.onBehalfOfDriverId,
            toStatus: tripStatusEvents.toStatus,
          })
          .from(tripStatusEvents)
          .where(eq(tripStatusEvents.tripId, trip.tripId))
        expect(events).toEqual([
          {
            channel: 'office',
            fromStatus: 'in_transit',
            occurredAt: new Date(deliveredAt),
            onBehalfOfDriverId: company.firstDriverId,
            toStatus: 'on_delivery_route',
          },
        ])
      })
    },
  )

  testWithPostgres(
    'M4: a nota que fecha a viagem grava só in_transit → completed, sem passo intermediário',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const [, , , , deliverRoute] = wireRoutes(database)

        await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'review-m4-complete',
          pathParameters: { documentId: trip.documentId, id: trip.tripId },
          request: multipartRequest({
            fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
            idempotencyKey: 'review-m4-complete',
          }),
        })

        const events = await database.db
          .select({ fromStatus: tripStatusEvents.fromStatus, toStatus: tripStatusEvents.toStatus })
          .from(tripStatusEvents)
          .where(eq(tripStatusEvents.tripId, trip.tripId))
        expect(events).toEqual([{ fromStatus: 'in_transit', toStatus: 'completed' }])
      })
    },
  )
})

describe('auditoria na mesma unidade de trabalho e operation office. (T15 M8, M11, seg B1, aceite 7)', () => {
  testWithPostgres(
    'aceite 7: a mesma Idempotency-Key em field-delivery não duplica evento, comprovante nem auditoria',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const [, , , , deliverRoute] = wireRoutes(database)
        const send = () =>
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'review-aceite-7',
            pathParameters: { documentId: trip.documentId, id: trip.tripId },
            request: multipartRequest({
              fields: {
                attachmentKey: 'canhoto-1',
                deliveredAt: '2026-09-18T09:00:00.000Z',
                receiverName: 'Ana',
              },
              file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
              idempotencyKey: 'review-aceite-7',
            }),
          })

        const first = (await (await send()).json()) as { data: { id: string } }
        const second = (await (await send()).json()) as { data: { id: string } }

        expect(second.data.id).toBe(first.data.id)
        expect(await database.db.select().from(tripDeliveryProofs)).toHaveLength(1)
        expect(
          await database.db
            .select()
            .from(tripStopEvents)
            .where(eq(tripStopEvents.tripDocumentId, trip.documentId)),
        ).toHaveLength(1)
        const audits = await database.db
          .select({ metadata: auditLogs.metadata })
          .from(auditLogs)
          .where(eq(auditLogs.entityId, trip.tripId))
        expect(audits).toHaveLength(1)
        expect(audits[0]?.metadata).toMatchObject({ documentId: trip.documentId })
      })
    },
  )

  testWithPostgres('M8: as operações do escritório gravam com o prefixo office.', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const [, , arriveRoute, occurrenceRoute, deliverRoute] = wireRoutes(database)
      await arriveRoute!.execute({
        context: fakeContext(company),
        correlationId: 'review-m8-arrive',
        pathParameters: { id: trip.tripId, stopId: trip.stopId },
        request: jsonRequest({
          body: { arrivedAt: '2026-09-18T08:00:00.000Z' },
          idempotencyKey: 'review-m8-arrive',
        }),
      })
      await occurrenceRoute!.execute({
        context: fakeContext(company),
        correlationId: 'review-m8-occurrence',
        pathParameters: { id: trip.tripId, stopId: trip.stopId },
        request: jsonRequest({ body: { kind: 'long_wait' }, idempotencyKey: 'review-m8-occ' }),
      })
      await deliverRoute!.execute({
        context: fakeContext(company),
        correlationId: 'review-m8-deliver',
        pathParameters: { documentId: trip.documentId, id: trip.tripId },
        request: multipartRequest({
          fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
          idempotencyKey: 'review-m8-deliver',
        }),
      })

      const operations = await database.db
        .select({ operation: tripFieldReports.operation })
        .from(tripFieldReports)
      expect(operations.map((row) => row.operation).toSorted()).toEqual([
        'office.document.deliver',
        'office.stop.arrive',
        'office.stop.occurrence',
      ])
      const audits = await database.db
        .select({ action: auditLogs.action, metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, trip.tripId))
      expect(
        audits.find((row) => row.action === 'trip_field_office.stop_arrive')?.metadata,
      ).toMatchObject({ stopId: trip.stopId })
    })
  })

  testWithPostgres(
    'B1: start-route repetido (changed: false) não grava auditoria nova',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const [, startRouteRoute] = wireRoutes(database)
        const start = () =>
          startRouteRoute!.execute({
            context: fakeContext(company),
            correlationId: 'review-b1',
            pathParameters: { id: trip.tripId },
            request: jsonRequest({}),
          })

        await start()
        const repeated = (await (await start()).json()) as { data: { changed: boolean } }

        expect(repeated.data.changed).toBe(false)
        expect(
          await database.db.select().from(auditLogs).where(eq(auditLogs.entityId, trip.tripId)),
        ).toHaveLength(1)
      })
    },
  )
})
