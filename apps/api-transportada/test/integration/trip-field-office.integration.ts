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
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
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
import { trips, tripDrivers, tripDocuments, tripStops } from '../../src/database/trip.schema.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { startFieldTrip } from '../../src/trips/application/start-field-trip.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import { createDrizzleTripFieldOfficeAudit } from '../../src/trips/infrastructure/drizzle-trip-field-office-audit.gateway.js'
import { createTripFieldOfficeRoutes } from '../../src/trips/presentation/trip-field-office.routes.js'

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

function wireRoutes(database: TestDatabase) {
  const targets = new DrizzleFieldTripTargetRepository(database.db)
  const currentDriverTrips = new DrizzleCurrentDriverTripRepository(database.db)
  const driverFieldReports = new DrizzleDriverFieldReportUnitOfWork(database.db)
  const audit = createDrizzleTripFieldOfficeAudit(database.db)

  return createTripFieldOfficeRoutes({
    audit,
    reportArrival: (input) =>
      reportStopArrival({
        ...input,
        location: null,
        now: new Date('2026-09-18T13:00:00.000Z'),
        unitOfWork: driverFieldReports,
      }),
    reportOccurrence: (input) =>
      reportStopOccurrence({ ...input, attachmentObjectId: null, unitOfWork: driverFieldReports }),
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
