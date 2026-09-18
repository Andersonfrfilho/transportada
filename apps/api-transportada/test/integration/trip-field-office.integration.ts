/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5, ADR-0067, contra o Postgres de verdade: as rotas do escritório resolvem o alvo pela
 * empresa do contexto, chamam os mesmos casos de uso do motorista e gravam `audit_logs`. O molde de
 * `withDisposableDatabase`/`seedCompany`/`seedTrip` é o de `trip-field-authorship.integration.ts`
 * (T4), com uma segunda tripulação para o aceite 13 (motorista escolhido).
 */
import { describe, expect } from 'bun:test'
import { and, eq, isNull } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { auditLogs, storedObjects } from '../../src/database/database.schema.js'
import {
  trips,
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripFieldReports,
  tripDocuments,
  tripStatusEvents,
  tripStopEvents,
  tripStops,
} from '../../src/database/trip.schema.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { resolveTripHasRoute } from '../../src/trips/domain/trip-allowed-actions.policy.js'
import { listTripOccurrences } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { readTripActionSnapshot } from '../../src/trips/infrastructure/trip-action-snapshot.query.js'
import {
  FAKE_ENVELOPE,
  fakeContext,
  jsonRequest,
  linkDriverMembership,
  multipartRequest,
  seedCompany,
  seedDeliveryOccurrenceType,
  seedDispatchSnapshot,
  seedExtraDocument,
  seedStopArrival,
  seedTrip,
  testWithPostgres,
  wireOccurrenceRoute,
  wireRoutes,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

describe('as rotas do escritório contra o Postgres (spec 156 T5, ADR-0067)', () => {
  testWithPostgres(
    'aceite 2: start-route em in_transit leva a on_delivery_route, com audit_logs do motorista de position 1',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const routes = wireRoutes(database)
        const [, startRouteRoute] = routes

        const response = await startRouteRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-1',
          pathParameters: { id: trip.tripId },
          request: jsonRequest({}),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          data: { changed: true, status: 'on_delivery_route' },
        })

        const [tripRow] = await database.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, trip.tripId))
        expect(tripRow?.status).toBe('on_delivery_route')

        const [audit] = await database.db
          .select({
            action: auditLogs.action,
            actorUserId: auditLogs.actorUserId,
            entityId: auditLogs.entityId,
            permission: auditLogs.permission,
            targetId: auditLogs.targetId,
          })
          .from(auditLogs)
          .where(eq(auditLogs.entityId, trip.tripId))
        expect(audit).toEqual({
          action: 'trip_field_office.start_route',
          actorUserId: company.userId,
          entityId: trip.tripId,
          permission: 'trip.report-on-behalf',
          targetId: company.firstDriverId,
        })

        /**
         * Spec 158 T3, ADR-0068 §2/§3: o escritório em nome do motorista grava `channel: 'office'`
         * com o `on_behalf_of_driver_id` do motorista de position 1 — nunca `backoffice`.
         */
        const [statusEvent] = await database.db
          .select()
          .from(tripStatusEvents)
          .where(eq(tripStatusEvents.tripId, trip.tripId))
        expect(statusEvent).toMatchObject({
          actorUserId: company.userId,
          channel: 'office',
          fromStatus: 'in_transit',
          onBehalfOfDriverId: company.firstDriverId,
          toStatus: 'on_delivery_route',
        })
      })
    },
  )

  testWithPostgres(
    'aceite 13: o driverId escolhido (position 2) é respeitado na chegada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const routes = wireRoutes(database)
        const [, , arriveRoute] = routes

        const response = await arriveRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-2',
          pathParameters: { id: trip.tripId, stopId: trip.stopId },
          request: jsonRequest({
            body: { driverId: company.secondDriverId },
            idempotencyKey: 'office-arrive-driver-2',
          }),
        })

        expect(response.status).toBe(201)

        const [audit] = await database.db
          .select({ targetId: auditLogs.targetId })
          .from(auditLogs)
          .where(
            and(eq(auditLogs.entityId, trip.tripId), eq(auditLogs.actorUserId, company.userId)),
          )
        expect(audit?.targetId).toBe(company.secondDriverId)
      })
    },
  )

  testWithPostgres(
    'aceite 13: driverId fora da tripulação responde 422 DRIVER_NOT_ON_TRIP, sem gravar audit',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const routes = wireRoutes(database)
        const [, , , occurrenceRoute] = routes
        const outsider = crypto.randomUUID()

        await expect(
          occurrenceRoute!.execute({
            context: fakeContext(company),
            correlationId: 'integration-correlation-3',
            pathParameters: { id: trip.tripId, stopId: trip.stopId },
            request: jsonRequest({
              body: { driverId: outsider, kind: 'long_wait' },
              idempotencyKey: 'office-occurrence-outsider',
            }),
          }),
        ).rejects.toMatchObject({ code: 'DRIVER_NOT_ON_TRIP', status: 422 })

        const auditRows = await database.db
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.entityId, trip.tripId))
        expect(auditRows).toEqual([])
      })
    },
  )

  testWithPostgres('aceite 3: viagem de outra empresa responde 404, nunca 403', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const otherCompany = await seedCompany(database)
      const trip = await seedTrip(database, otherCompany, 'in_transit')
      const routes = wireRoutes(database)
      const [confirmLoadRoute] = routes

      await expect(
        confirmLoadRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-4',
          pathParameters: { id: trip.tripId },
          request: jsonRequest({}),
        }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND', status: 404 })
    })
  })
})

describe('field-delivery, field-return e field-proof contra o Postgres (spec 156 T6, ADR-0067)', () => {
  testWithPostgres(
    'grava entrega + comprovante na mesma transação, com delivered_at = deliveredAt informado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedDispatchSnapshot(database, company, trip, new Date('2026-09-17T08:00:00.000Z'))
        await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
        const [, , , , deliverRoute] = wireRoutes(database)
        const deliveredAt = '2026-09-18T09:00:00.000Z'

        const response = await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-delivery-1',
          pathParameters: { id: trip.tripId, documentId: trip.documentId },
          request: multipartRequest({
            fields: { deliveredAt, receiverName: 'João da Silva' },
            file: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
            idempotencyKey: 'office-field-delivery-1',
          }),
        })

        expect(response.status).toBe(201)
        const body = (await response.json()) as {
          data: { alreadySettled: boolean; proofId: string | null }
        }
        expect(body.data.alreadySettled).toBe(false)
        expect(body.data.proofId).not.toBeNull()

        const [documentRow] = await database.db
          .select({
            deliveredAt: tripDocuments.deliveredAt,
            status: tripDocuments.separationStatus,
          })
          .from(tripDocuments)
          .where(eq(tripDocuments.id, trip.documentId))
        expect(documentRow?.status).toBe('delivered')
        expect(documentRow?.deliveredAt?.toISOString()).toBe(deliveredAt)

        const [proofRow] = await database.db
          .select({
            channel: tripDeliveryProofs.channel,
            receiverName: tripDeliveryProofs.receiverName,
          })
          .from(tripDeliveryProofs)
          .where(eq(tripDeliveryProofs.id, body.data.proofId ?? ''))
        expect(proofRow).toEqual({ channel: 'office', receiverName: 'João da Silva' })
      })
    },
  )

  testWithPostgres(
    'aceite 9: empresa exige foto e ela não veio — 422 TRIP_DELIVERY_PROOF_PHOTO_REQUIRED',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await database.db.insert(companyDeliveryProofSettings).values({
          companyId: company.companyId,
          photo: 'required',
        })
        const [, , , , deliverRoute] = wireRoutes(database)

        await expect(
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'integration-correlation-delivery-photo-required',
            pathParameters: { id: trip.tripId, documentId: trip.documentId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
              idempotencyKey: 'office-field-delivery-photo-required',
            }),
          }),
        ).rejects.toMatchObject({ code: 'TRIP_DELIVERY_PROOF_PHOTO_REQUIRED', status: 422 })

        const [documentRow] = await database.db
          .select({ status: tripDocuments.separationStatus })
          .from(tripDocuments)
          .where(eq(tripDocuments.id, trip.documentId))
        expect(documentRow?.status).toBe('loaded')
      })
    },
  )

  testWithPostgres(
    'aceite 8: deliveredAt antes do despacho responde 400 DELIVERED_AT_BEFORE_DISPATCH',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedDispatchSnapshot(database, company, trip, new Date('2026-09-17T08:00:00.000Z'))
        const [, , , , deliverRoute] = wireRoutes(database)

        await expect(
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'integration-correlation-delivery-before-dispatch',
            pathParameters: { id: trip.tripId, documentId: trip.documentId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-17T07:00:00.000Z' },
              idempotencyKey: 'office-field-delivery-before-dispatch',
            }),
          }),
        ).rejects.toMatchObject({ code: 'DELIVERED_AT_BEFORE_DISPATCH', status: 400 })
      })
    },
  )

  testWithPostgres(
    'aceite 12: baixa repetida no canal office responde 409 DOCUMENT_ALREADY_SETTLED, sem evento novo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
        const [, , , , deliverRoute] = wireRoutes(database)

        await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-already-settled-1',
          pathParameters: { id: trip.tripId, documentId: trip.documentId },
          request: multipartRequest({
            fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
            idempotencyKey: 'office-field-delivery-settled-1',
          }),
        })

        await expect(
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'integration-correlation-already-settled-2',
            pathParameters: { id: trip.tripId, documentId: trip.documentId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-18T10:00:00.000Z' },
              idempotencyKey: 'office-field-delivery-settled-2',
            }),
          }),
        ).rejects.toMatchObject({ code: 'DOCUMENT_ALREADY_SETTLED', status: 409 })
      })
    },
  )

  /**
   * Spec 159 T11 (ALTO 3): o escritório dá baixa com o canhoto, e a fila offline do motorista
   * reenvia o `deliver` depois. O no-op não pode gravar um `delivered` novo sem foto — ele viraria o
   * "último" evento da nota, esconderia o canhoto e deixaria a nota pendente (e penalizável).
   */
  testWithPostgres(
    'baixa do escritório com foto + deliver repetido do motorista: sem evento novo, sem pendência',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
        await database.db
          .insert(companyDeliveryProofSettings)
          .values({ companyId: company.companyId, photo: 'required' })
        const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
        const [, , , , deliverRoute] = wireRoutes(database)
        const deliveryProofs = new DrizzleDeliveryProofRepository(database.db)

        const officeResponse = await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-office-then-driver',
          pathParameters: { id: trip.tripId, documentId: trip.documentId },
          request: multipartRequest({
            fields: { deliveredAt: '2026-09-18T09:00:00.000Z', receiverName: 'Ana' },
            file: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
            idempotencyKey: 'office-delivery-before-driver-replay',
          }),
        })
        expect(officeResponse.status).toBe(201)
        const officeBody = (await officeResponse.json()) as { data: { id: string } }

        const replay = await reportDocumentDelivery({
          actorUserId: driverUserId,
          companyId: company.companyId,
          documentId: trip.documentId,
          driverId: company.firstDriverId,
          idempotencyKey: 'fila-offline-do-motorista',
          location: null,
          now: new Date('2026-09-18T11:00:00.000Z'),
          resolveProofSettings: (settings) => deliveryProofs.resolveProofFieldSettings(settings),
          unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db),
        })

        expect(replay).toMatchObject({
          alreadySettled: true,
          id: officeBody.data.id,
          proofPending: false,
        })
        const deliveredEvents = await database.db
          .select({ id: tripStopEvents.id })
          .from(tripStopEvents)
          .where(
            and(
              eq(tripStopEvents.companyId, company.companyId),
              eq(tripStopEvents.kind, 'delivered'),
            ),
          )
        expect(deliveredEvents).toHaveLength(1)

        const score = await new DrizzleDriverScoreRepository(database.db).readPenalties({
          companyId: company.companyId,
          driverId: company.firstDriverId,
          now: new Date('2026-09-20T12:00:00.000Z'),
        })
        expect(score).toEqual({ penalties: [], score: null })
      })
    },
  )

  /**
   * Spec 159 T11 (ALTO 2): a entrega é do motorista, e a foto dele chegou tarde e sem posição. O
   * canhoto que o escritório sobe depois por `field-proof` substitui o arquivo, mas não lava a
   * pontualidade — e sem foto anterior ele grava `not_required`, nunca `away`.
   */
  testWithPostgres(
    'entrega do motorista + field-proof do escritório: a pontualidade do motorista fica',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
        await database.db
          .insert(companyDeliveryProofSettings)
          .values({ companyId: company.companyId, photo: 'required' })
        const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
        const [, , , , , , proofRoute] = wireRoutes(database)
        const deliveryProofs = new DrizzleDeliveryProofRepository(database.db)
        const driver = {
          actorUserId: driverUserId,
          companyId: company.companyId,
          documentId: trip.documentId,
          driverId: company.firstDriverId,
        }

        await reportDocumentDelivery({
          ...driver,
          idempotencyKey: 'motorista-entrega-antes-do-canhoto',
          location: null,
          now: new Date(),
          unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db),
        })
        const threeHoursLater = new Date(Date.now() + 3 * 60 * 60 * 1000)
        const driverPhoto = await attachDeliveryProof({
          ...driver,
          newObjectId: () => crypto.randomUUID(),
          newProofId: () => crypto.randomUUID(),
          now: threeHoursLater,
          repository: deliveryProofs,
          sealDocument: async () => FAKE_ENVELOPE,
          storage: { store: async () => ({ sha256: 'e'.repeat(64) }) },
          upload: {
            attachmentKey: 'foto-do-motorista',
            bytes: new Uint8Array([1, 2, 3]),
            capturedAt: threeHoursLater,
            kind: 'photo',
            mimeType: 'image/jpeg',
            position: undefined,
            receiverDocument: '',
            receiverName: '',
          },
        })
        expect(driverPhoto.punctuality).toBe('late_and_away')

        const response = await proofRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-office-proof-over-driver',
          pathParameters: { id: trip.tripId, documentId: trip.documentId },
          request: multipartRequest({
            fields: { receiverName: 'Ana Paula' },
            file: { bytes: new Uint8Array([7, 7, 7]), mimeType: 'image/jpeg' },
            idempotencyKey: 'office-field-proof-over-driver',
          }),
        })
        expect(response.status).toBe(201)

        const proofRows = await database.db
          .select({
            channel: tripDeliveryProofs.channel,
            punctuality: tripDeliveryProofs.punctuality,
          })
          .from(tripDeliveryProofs)
          .where(eq(tripDeliveryProofs.companyId, company.companyId))
        expect(proofRows).toEqual([{ channel: 'office', punctuality: 'late_and_away' }])
      })
    },
  )

  testWithPostgres(
    'field-proof do escritório sobre entrega do motorista sem foto grava not_required',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
        await database.db
          .insert(companyDeliveryProofSettings)
          .values({ companyId: company.companyId, photo: 'required' })
        const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
        const [, , , , , , proofRoute] = wireRoutes(database)

        await reportDocumentDelivery({
          actorUserId: driverUserId,
          companyId: company.companyId,
          documentId: trip.documentId,
          driverId: company.firstDriverId,
          idempotencyKey: 'motorista-entrega-sem-foto',
          location: null,
          now: new Date(),
          unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db),
        })
        const response = await proofRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-office-proof-no-driver-photo',
          pathParameters: { id: trip.tripId, documentId: trip.documentId },
          request: multipartRequest({
            fields: { receiverName: 'Ana Paula' },
            file: { bytes: new Uint8Array([7, 7, 7]), mimeType: 'image/jpeg' },
            idempotencyKey: 'office-field-proof-no-driver-photo',
          }),
        })
        expect(response.status).toBe(201)

        const [proofRow] = await database.db
          .select({ punctuality: tripDeliveryProofs.punctuality })
          .from(tripDeliveryProofs)
          .where(eq(tripDeliveryProofs.companyId, company.companyId))
        expect(proofRow?.punctuality).toBe('not_required')
      })
    },
  )

  testWithPostgres(
    'field-proof anexa ao evento delivered sem mudar delivered_at nem criar evento',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
        const [, , , , deliverRoute, , proofRoute] = wireRoutes(database)

        await deliverRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-proof-1',
          pathParameters: { id: trip.tripId, documentId: trip.documentId },
          request: multipartRequest({
            fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
            idempotencyKey: 'office-field-delivery-for-proof',
          }),
        })
        const [beforeDocument] = await database.db
          .select({ deliveredAt: tripDocuments.deliveredAt })
          .from(tripDocuments)
          .where(eq(tripDocuments.id, trip.documentId))

        const response = await proofRoute!.execute({
          context: fakeContext(company),
          correlationId: 'integration-correlation-proof-2',
          pathParameters: { id: trip.tripId, documentId: trip.documentId },
          request: multipartRequest({
            fields: { receiverName: 'Ana Paula' },
            file: { bytes: new Uint8Array([9, 9, 9]), mimeType: 'image/jpeg' },
            idempotencyKey: 'office-field-proof-1',
          }),
        })

        expect(response.status).toBe(201)
        const [afterDocument] = await database.db
          .select({ deliveredAt: tripDocuments.deliveredAt })
          .from(tripDocuments)
          .where(eq(tripDocuments.id, trip.documentId))
        expect(afterDocument?.deliveredAt?.toISOString()).toBe(
          beforeDocument?.deliveredAt?.toISOString(),
        )

        const proofRows = await database.db
          .select({ id: tripDeliveryProofs.id })
          .from(tripDeliveryProofs)
          .where(eq(tripDeliveryProofs.companyId, company.companyId))
        expect(proofRows).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'field-delivery de viagem de outra empresa responde 404, nunca 403',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const otherCompany = await seedCompany(database)
        const trip = await seedTrip(database, otherCompany, 'in_transit')
        const [, , , , deliverRoute] = wireRoutes(database)

        await expect(
          deliverRoute!.execute({
            context: fakeContext(company),
            correlationId: 'integration-correlation-delivery-404',
            pathParameters: { id: trip.tripId, documentId: trip.documentId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
              idempotencyKey: 'office-field-delivery-404',
            }),
          }),
        ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND', status: 404 })
      })
    },
  )
})

/**
 * Spec 156 T7.2, ressalva A2: `resolveTripHasRoute` é cópia do SQL de `readRouteState`, e as duas
 * precisam concordar na mesma viagem — inclusive com a nota devolvida sem parada, que o SQL ignora.
 */
describe('allowed-actions: o recorte e o roteiro batem com o SQL (spec 156 D10, A2)', () => {
  testWithPostgres('resolveTripHasRoute concorda com readRouteState a cada passo', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const routeRepository = new DrizzleTripRouteRepository(database.db)

      async function compare(expected: boolean): Promise<void> {
        const snapshot = await readTripActionSnapshot(database.db, {
          companyId: company.companyId,
          tripId: trip.tripId,
        })
        const route = await routeRepository.readRouteState({
          companyId: company.companyId,
          tripId: trip.tripId,
        })
        const copy = resolveTripHasRoute({
          documents: snapshot?.documents ?? [],
          stopCount: snapshot?.stops.length ?? 0,
        })
        expect(route?.hasRoute).toBe(expected)
        expect(copy).toBe(expected)
      }

      await compare(true)
      await seedExtraDocument(database, company, trip, {
        returnReason: 'recusa',
        separationStatus: 'returned',
      })
      await compare(true)
      await seedExtraDocument(database, company, trip, {
        releasedAt: new Date('2026-09-18T09:00:00.000Z'),
        separationStatus: 'pending',
      })
      await compare(true)
      await seedExtraDocument(database, company, trip, { separationStatus: 'pending' })
      await compare(false)
      await database.db.delete(tripDocuments).where(isNull(tripDocuments.stopId))
      await database.db.update(tripDocuments).set({ stopId: null })
      await database.db.delete(tripStops).where(eq(tripStops.tripId, trip.tripId))
      await compare(false)
    })
  })

  testWithPostgres(
    'o recorte traz estado, parada, nota e motorista, e outra empresa não vê',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const other = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')

        const snapshot = await readTripActionSnapshot(database.db, {
          companyId: company.companyId,
          tripId: trip.tripId,
        })
        expect(snapshot).toEqual({
          documents: [
            {
              id: trip.documentId,
              releasedAt: null,
              separationStatus: 'loaded',
              stopId: trip.stopId,
            },
          ],
          hasDriver: true,
          status: 'in_transit',
          stops: [{ arrivedAt: null, id: trip.stopId }],
        })
        expect(
          await readTripActionSnapshot(database.db, {
            companyId: other.companyId,
            tripId: trip.tripId,
          }),
        ).toBeNull()
      })
    },
  )
})

/**
 * Spec 156 T7.3 (D7, aceite 10) contra o Postgres: o lote grava uma ocorrência `office` por nota
 * numa transação só, cada uma aparece no feed de `/ocorrencias`, avisa quem despachou por nota, e o
 * reenvio da mesma chave não grava nem avisa de novo.
 */
describe('a ocorrência em massa do escritório contra o Postgres (spec 156 T7.3)', () => {
  testWithPostgres(
    'aceite 10: três notas, três ocorrências no feed, três avisos, reenvio sem efeito',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedDispatchSnapshot(database, company, trip, new Date('2026-09-18T06:30:00.000Z'))
        const documentIds = [
          trip.documentId,
          await seedExtraDocument(database, company, trip, {
            separationStatus: 'loaded',
            stopId: trip.stopId,
          }),
          await seedExtraDocument(database, company, trip, {
            separationStatus: 'loaded',
            stopId: trip.stopId,
          }),
        ]
        const typeId = await seedDeliveryOccurrenceType(database, company)
        const { route, sent } = wireOccurrenceRoute(database)
        const post = () =>
          route.execute({
            context: fakeContext(company),
            correlationId: 'integration-occurrences',
            pathParameters: { id: trip.tripId },
            request: multipartRequest({
              fields: { documentIds, note: 'Portão fechado', occurrenceTypeId: typeId },
              idempotencyKey: 'lote-integracao',
            }),
          })

        const first = await post()
        expect(first.status).toBe(201)
        const firstBody = (await first.json()) as {
          data: { items: { documentId: string; id: string }[] }
        }
        expect(firstBody.data.items.map((item) => item.documentId)).toEqual(documentIds)

        const rows = await database.db
          .select()
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.companyId, company.companyId))
        expect(rows).toHaveLength(3)
        for (const row of rows) {
          expect(row.channel).toBe('office')
          expect(row.onBehalfOfDriverId).toBe(company.firstDriverId)
          expect(row.stage).toBe('delivery')
        }

        const feed = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })
        expect(feed.items.map((item) => item.id).toSorted()).toEqual(
          firstBody.data.items.map((item) => item.id).toSorted(),
        )

        // Spec 156 T9 (D3): a leitura do feed publica quem registrou e em nome de quem.
        expect(feed.items.every((item) => item.channel === 'office')).toBe(true)
        expect(feed.items.every((item) => item.onBehalfOfDriverName === 'Motorista Um')).toBe(true)
        // Nenhum perfil (`identity_user_profiles`) foi semeado para o ator nesta fixture: sem
        // vínculo com nome resolvido, a leitura publica `null`, nunca o id cru.
        expect(feed.items.every((item) => item.actorName === null)).toBe(true)

        const [occurrenceRead] = await listTripOccurrences(database.db, {
          companyId: company.companyId,
          documentId: documentIds[0]!,
          tripId: trip.tripId,
        })
        expect(occurrenceRead?.channel).toBe('office')
        expect(occurrenceRead?.onBehalfOfDriverName).toBe('Motorista Um')
        expect(occurrenceRead?.actorName).toBeNull()

        expect(sent).toHaveLength(3)
        expect(new Set(sent.map((notice) => notice.dedupeKey)).size).toBe(3)
        expect(sent.every((notice) => notice.recipientUserId === company.userId)).toBe(true)

        const [audit] = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.action, 'trip_field_office.document_occurrences'))
        expect(audit?.metadata).toMatchObject({ documentIds })

        const replay = await post()
        expect(replay.status).toBe(201)
        expect(await replay.json()).toEqual(firstBody)
        expect(
          await database.db
            .select()
            .from(tripDocumentOccurrences)
            .where(eq(tripDocumentOccurrences.companyId, company.companyId)),
        ).toHaveLength(3)
        expect(sent).toHaveLength(3)
      })
    },
  )

  testWithPostgres(
    'T7b (D7 §3.5): a mesma foto para as N notas — um objeto só, reenvio não reenvia',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await seedDispatchSnapshot(database, company, trip, new Date('2026-09-18T06:30:00.000Z'))
        const documentIds = [
          trip.documentId,
          await seedExtraDocument(database, company, trip, {
            separationStatus: 'loaded',
            stopId: trip.stopId,
          }),
          await seedExtraDocument(database, company, trip, {
            separationStatus: 'loaded',
            stopId: trip.stopId,
          }),
        ]
        const typeId = await seedDeliveryOccurrenceType(database, company)
        const { route, uploads } = wireOccurrenceRoute(database)
        const photo = { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/jpeg' }
        const post = () =>
          route.execute({
            context: fakeContext(company),
            correlationId: 'integration-occurrences-attachment',
            pathParameters: { id: trip.tripId },
            request: multipartRequest({
              fields: { documentIds, note: 'Cliente ausente', occurrenceTypeId: typeId },
              file: photo,
              idempotencyKey: 'lote-com-foto',
            }),
          })

        const first = await post()
        expect(first.status).toBe(201)
        expect(uploads).toHaveLength(1)

        const rows = await database.db
          .select()
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.companyId, company.companyId))
        expect(rows).toHaveLength(3)
        const attachmentObjectIds = new Set(rows.map((row) => row.attachmentObjectId))
        expect(attachmentObjectIds.size).toBe(1)
        expect([...attachmentObjectIds][0]).not.toBeNull()

        const attachmentObjects = await database.db
          .select()
          .from(storedObjects)
          .where(
            and(
              eq(storedObjects.companyId, company.companyId),
              eq(storedObjects.purpose, 'delivery_proof'),
            ),
          )
        expect(attachmentObjects).toHaveLength(1)
        expect(attachmentObjects[0]?.status).toBe('final')

        const replay = await post()
        expect(replay.status).toBe(201)
        expect(uploads).toHaveLength(1)
        expect(
          await database.db
            .select()
            .from(storedObjects)
            .where(
              and(
                eq(storedObjects.companyId, company.companyId),
                eq(storedObjects.purpose, 'delivery_proof'),
              ),
            ),
        ).toHaveLength(1)

        let conflict: unknown
        try {
          await route.execute({
            context: fakeContext(company),
            correlationId: 'integration-occurrences-attachment-conflict',
            pathParameters: { id: trip.tripId },
            request: multipartRequest({
              fields: { documentIds, note: 'Cliente ausente', occurrenceTypeId: typeId },
              file: { bytes: new Uint8Array([9, 9, 9]), mimeType: 'image/jpeg' },
              idempotencyKey: 'lote-com-foto',
            }),
          })
        } catch (error) {
          conflict = error
        }
        expect((conflict as { code?: string }).code).toBe('TRIP_FIELD_REPORT_KEY_REUSED')
        expect(uploads).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'uma nota de outra viagem desfaz o lote inteiro (409, zero linhas)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const otherTrip = await seedTrip(database, company, 'in_transit')
        const typeId = await seedDeliveryOccurrenceType(database, company)
        const { route } = wireOccurrenceRoute(database)

        let failure: unknown
        try {
          await route.execute({
            context: fakeContext(company),
            correlationId: 'integration-occurrences-foreign',
            pathParameters: { id: trip.tripId },
            request: multipartRequest({
              fields: {
                documentIds: [trip.documentId, otherTrip.documentId],
                occurrenceTypeId: typeId,
              },
              idempotencyKey: 'lote-estrangeiro',
            }),
          })
        } catch (error) {
          failure = error
        }

        expect((failure as { code?: string }).code).toBe('TRIP_DOCUMENT_NOT_REACHABLE')
        expect((failure as { details?: unknown }).details).toEqual([
          { field: 'documentIds', message: otherTrip.documentId },
        ])
        expect(await database.db.select().from(tripDocumentOccurrences)).toHaveLength(0)
        expect(await database.db.select().from(tripFieldReports)).toHaveLength(0)
      })
    },
  )

  testWithPostgres('viagem de outra empresa responde 404, sem gravar', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const other = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const typeId = await seedDeliveryOccurrenceType(database, other)
      const { route } = wireOccurrenceRoute(database)

      let failure: unknown
      try {
        await route.execute({
          context: fakeContext(other),
          correlationId: 'integration-occurrences-other-company',
          pathParameters: { id: trip.tripId },
          request: multipartRequest({
            fields: { documentIds: [trip.documentId], occurrenceTypeId: typeId },
            idempotencyKey: 'lote-outra-empresa',
          }),
        })
      } catch (error) {
        failure = error
      }

      expect((failure as { status?: number }).status).toBe(404)
      expect(await database.db.select().from(tripDocumentOccurrences)).toHaveLength(0)
    })
  })
})
