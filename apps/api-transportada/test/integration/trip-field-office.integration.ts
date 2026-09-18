/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5, ADR-0067, contra o Postgres de verdade: as rotas do escritório resolvem o alvo pela
 * empresa do contexto, chamam os mesmos casos de uso do motorista e gravam `audit_logs`. O molde de
 * `withDisposableDatabase`/`seedCompany`/`seedTrip` é o de `trip-field-authorship.integration.ts`
 * (T4), com uma segunda tripulação para o aceite 13 (motorista escolhido).
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import {
  auditLogs,
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  companyOccurrenceTypes,
  trips,
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripFieldReports,
  tripDispatchSnapshots,
  tripDocuments,
  tripDrivers,
  tripStatusEvents,
  tripStops,
} from '../../src/database/trip.schema.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportFieldProof } from '../../src/trips/application/report-field-proof.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { startFieldTrip } from '../../src/trips/application/start-field-trip.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import { createDrizzleTripFieldOfficeAudit } from '../../src/trips/infrastructure/drizzle-trip-field-office-audit.gateway.js'
import { createTripFieldOfficeRoutes } from '../../src/trips/presentation/trip-field-office.routes.js'
import { resolveTripHasRoute } from '../../src/trips/domain/trip-allowed-actions.policy.js'
import { registerOfficeDocumentOccurrences } from '../../src/trips/application/register-office-document-occurrences.use-case.js'
import {
  listTripOccurrences,
  readOccurrenceLabels,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOfficeOccurrenceBatchUnitOfWork } from '../../src/trips/infrastructure/drizzle-office-occurrence-batch.repository.js'
import { createOccurrenceNotifier } from '../../src/trips/infrastructure/occurrence-notifier.gateway.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { createTripFieldOfficeOccurrenceRoutes } from '../../src/trips/presentation/trip-field-office-occurrence.routes.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { readTripActionSnapshot } from '../../src/trips/infrastructure/trip-action-snapshot.query.js'

/** As rotas do escritório nunca colhem assinatura (D8) — o comprovante do canhoto é sempre `photo`. */
const FAKE_ENVELOPE = { ciphertext: 'x', iv: 'y', keyId: 'test', tag: 'z' } as never

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

type Company = {
  readonly companyId: string
  readonly firstDriverId: string
  readonly secondDriverId: string
  readonly userId: string
  readonly vehicleId: string
}

type SeededTrip = {
  readonly documentId: string
  readonly stopId: string
  readonly tripId: string
}

function fakeContext(company: Company): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: company.companyId,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: new Set(['trip.report-on-behalf'] as never),
      roles: ['operator'],
      userId: company.userId,
    },
  }
}

function jsonRequest(input: { readonly body?: object; readonly idempotencyKey?: string }): Request {
  const headers: Record<string, string> = {}
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  return new Request('http://localhost/trips/x', {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers,
    method: 'POST',
  })
}

/**
 * Spec 156 T6/T7b: `field-delivery`/`field-proof`/`field-occurrences` são multipart — sem `file`, a
 * foto é "não veio". Um valor em array (`documentIds` do lote) vira campos repetidos.
 */
function multipartRequest(input: {
  readonly fields: Record<string, readonly string[] | string>
  readonly file?: { readonly bytes: Uint8Array; readonly mimeType: string }
  readonly idempotencyKey?: string
}): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.fields)) {
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item)
    } else {
      form.set(key, value as string)
    }
  }
  if (input.file !== undefined) {
    form.set('file', new File([input.file.bytes], 'canhoto.jpg', { type: input.file.mimeType }))
  }
  const headers: Record<string, string> = {}
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  return new Request('http://localhost/trips/x', { body: form, headers, method: 'POST' })
}

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

/**
 * Spec 156 T7b: dublê de armazenamento, no molde do `storage` de `wireRoutes` — o MinIO local não
 * é exercitado aqui, e um `sha256` fabricado basta: a impressão do lote (aceite "outro conteúdo")
 * usa o hash dos bytes recebidos, calculado no caso de uso, não o que o dublê devolve.
 */
function fakeAttachmentStorage(uploads: { objectId: string; objectKey: string }[]): {
  store(input: { readonly objectId: string; readonly objectKey: string }): Promise<{
    readonly sha256: string
  }>
} {
  let counter = 0
  return {
    async store(input) {
      uploads.push({ objectId: input.objectId, objectKey: input.objectKey })
      counter += 1
      return { sha256: `${counter}`.padStart(64, '0') }
    },
  }
}

function wireOccurrenceRoute(database: TestDatabase) {
  const sent: { dedupeKey: string; recipientUserId: string }[] = []
  const uploads: { objectId: string; objectKey: string }[] = []
  const routes = createTripFieldOfficeOccurrenceRoutes({
    audit: createDrizzleTripFieldOfficeAudit(database.db),
    listFieldOccurrenceTypes: async () => [],
    registerOccurrences: (input) =>
      registerOfficeDocumentOccurrences({
        ...input,
        attachment: {
          newObjectId: () => crypto.randomUUID(),
          storage: fakeAttachmentStorage(uploads),
          upload: input.attachment,
        },
        notifications: {
          notifier: createOccurrenceNotifier({
            logger: { warn() {} },
            queryable: database.db,
            send: async (notice) => void sent.push(notice),
          }),
          readLabels: (query) => readOccurrenceLabels(database.db, query),
        },
        unitOfWork: new DrizzleOfficeOccurrenceBatchUnitOfWork(database.db),
      }),
    targets: new DrizzleFieldTripTargetRepository(database.db),
  })
  const route = routes.find((candidate) => candidate.method === 'POST')
  if (route === undefined) throw new Error('route missing')
  return { route, sent, uploads }
}

async function seedDeliveryOccurrenceType(
  database: TestDatabase,
  company: Company,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id,
    name: 'Cliente ausente',
    notifies: true,
    stage: 'delivery',
  })
  return id
}

function wireRoutes(database: TestDatabase) {
  const targets = new DrizzleFieldTripTargetRepository(database.db)
  const currentDriverTrips = new DrizzleCurrentDriverTripRepository(database.db)
  const driverFieldReports = new DrizzleDriverFieldReportUnitOfWork(database.db)
  const deliveryProofs = new DrizzleDeliveryProofRepository(database.db)
  const audit = createDrizzleTripFieldOfficeAudit(database.db)
  let objectCounter = 0
  const storage = {
    store: async () => ({ sha256: (objectCounter++, `${objectCounter}`.padStart(64, '0')) }),
  }

  return createTripFieldOfficeRoutes({
    attachProof: (input) =>
      reportFieldProof({
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        documentId: input.documentId,
        idempotencyKey: input.idempotencyKey,
        newObjectId: () => crypto.randomUUID(),
        newProofId: () => crypto.randomUUID(),
        repository: deliveryProofs,
        sealDocument: async () => FAKE_ENVELOPE,
        storage,
        target: input.target,
        unitOfWork: driverFieldReports,
        upload: { ...input.proof, kind: 'photo' },
      }),
    audit,
    reportArrival: (input) =>
      reportStopArrival({
        ...input,
        location: null,
        now: new Date('2026-09-18T13:00:00.000Z'),
        unitOfWork: driverFieldReports,
      }),
    reportDelivery: (input) =>
      reportDocumentDelivery({
        ...input,
        location: null,
        now: input.deliveredAt,
        proof: {
          newObjectId: () => crypto.randomUUID(),
          newProofId: () => crypto.randomUUID(),
          resolveSettings: (settings) => deliveryProofs.resolveProofFieldSettings(settings),
          sealDocument: async () => FAKE_ENVELOPE,
          storage,
          upload: input.proof,
        },
        recordedAt: new Date('2026-09-18T13:00:00.000Z'),
        unitOfWork: driverFieldReports,
      }),
    reportOccurrence: (input) =>
      reportStopOccurrence({ ...input, attachmentObjectId: null, unitOfWork: driverFieldReports }),
    reportReturn: (input) =>
      reportDocumentReturn({
        ...input,
        location: null,
        now: input.returnedAt,
        recordedAt: new Date('2026-09-18T13:00:00.000Z'),
        unitOfWork: driverFieldReports,
      }),
    startFieldTrip: (input) => startFieldTrip({ ...input, repository: currentDriverTrips }),
    targets,
  })
}

async function seedCompany(database: TestDatabase): Promise<Company> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const firstDriverId = crypto.randomUUID()
  const secondDriverId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E48',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values([
    { companyId, id: firstDriverId, name: 'Motorista Um', taxId: '11122233344' },
    { companyId, id: secondDriverId, name: 'Motorista Dois', taxId: '22233344455' },
  ])

  return { companyId, firstDriverId, secondDriverId, userId, vehicleId }
}

async function seedTrip(
  database: TestDatabase,
  company: Company,
  status: 'in_transit',
): Promise<SeededTrip> {
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const documentId = crypto.randomUUID()

  await database.db.insert(trips).values({
    companyId: company.companyId,
    id: tripId,
    status,
    vehicleId: company.vehicleId,
  })
  await database.db.insert(tripDrivers).values([
    {
      companyId: company.companyId,
      driverId: company.firstDriverId,
      driverName: 'Motorista Um',
      driverTaxId: '11122233344',
      position: 1n,
      tripId,
    },
    {
      companyId: company.companyId,
      driverId: company.secondDriverId,
      driverName: 'Motorista Dois',
      driverTaxId: '22233344455',
      position: 2n,
      tripId,
    },
  ])
  await database.db.insert(tripStops).values({
    addressKey: `3550308|01001000|${tripId}`,
    arrivedAt: null,
    companyId: company.companyId,
    id: stopId,
    label: 'Centro, 100',
    sequence: 1n,
    tripId,
  })
  await database.db.insert(tripDocuments).values({
    companyId: company.companyId,
    id: documentId,
    loadedAt: new Date('2026-09-18T08:00:00.000Z'),
    nfeDocumentId: await seedNfeDocument(database, company),
    separatedAt: new Date('2026-09-18T07:00:00.000Z'),
    separationStatus: 'loaded',
    stopId,
    tripId,
  })

  return { documentId, stopId, tripId }
}

/**
 * `completeStopIfSettled` exige `arrived_at` preenchido (`trip_stops_completed_requires_arrived_check`)
 * — a entrega que fecha a última parada da viagem só é válida depois da chegada.
 */
async function seedStopArrival(
  database: TestDatabase,
  trip: SeededTrip,
  arrivedAt: Date,
): Promise<void> {
  await database.db.update(tripStops).set({ arrivedAt }).where(eq(tripStops.id, trip.stopId))
}

/** Nota a mais na viagem — sem parada é o caso que decide se o roteiro existe (A2). */
async function seedExtraDocument(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  input: {
    readonly releasedAt?: Date
    readonly returnReason?: string
    readonly separationStatus: 'loaded' | 'pending' | 'returned'
    readonly stopId?: string
  },
): Promise<string> {
  const documentId = crypto.randomUUID()
  await database.db.insert(tripDocuments).values({
    companyId: company.companyId,
    id: documentId,
    nfeDocumentId: await seedNfeDocument(database, company),
    releasedAt: input.releasedAt ?? null,
    returnReason: input.returnReason ?? null,
    separationStatus: input.separationStatus,
    stopId: input.stopId ?? null,
    tripId: trip.tripId,
  })
  return documentId
}

/** ADR-0067 §3: a fonte de "quando a viagem despachou" para validar `deliveredAt`/`returnedAt`. */
async function seedDispatchSnapshot(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  dispatchedAt: Date,
): Promise<void> {
  await database.db.insert(tripDispatchSnapshots).values({
    actorUserId: company.userId,
    companyId: company.companyId,
    dispatchedAt,
    id: crypto.randomUUID(),
    snapshot: { stops: [] },
    snapshotSha256: '0'.repeat(64),
    tripId: trip.tripId,
  })
}

async function seedNfeDocument(database: TestDatabase, company: Company): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const suffix = documentId.replaceAll('-', '')
  const sha = suffix.padEnd(64, '0').slice(0, 64)
  const digits = suffix.replace(/[a-f]/g, (letter) => String(letter.charCodeAt(0) % 10))

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: company.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/trip-field-office-${suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: company.companyId,
    correlationId: `correlation-${suffix}`,
    id: importId,
    idempotencyKey: `trip-field-office-${suffix}`,
    requestFingerprint: `fingerprint-${suffix}`,
    requestedByUserId: company.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${digits}${'0'.repeat(12)}`,
    authorizationProtocol: `protocol-${suffix}`,
    companyId: company.companyId,
    createdByUserId: company.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-18T06:00:00.000Z'),
    model: '55',
    number: `1${digits.slice(0, 5)}`,
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

  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_156_t5_${crypto.randomUUID().replaceAll('-', '')}`
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
