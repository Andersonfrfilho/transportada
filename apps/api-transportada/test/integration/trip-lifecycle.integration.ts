/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
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
import { tripDispatchSnapshots, tripStops } from '../../src/database/trip.schema.js'
import { dispatchTrip } from '../../src/trips/application/dispatch-trip.use-case.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import { DrizzleTripDocumentRepository } from '../../src/trips/infrastructure/drizzle-trip-document.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

/**
 * T018: o ciclo inteiro da viagem contra Postgres real, através dos mesmos use cases e
 * repositórios que a API expõe — criar → vincular 3 notas em 2 endereços → planejar → separar →
 * carregar → despachar → conferir snapshot congelado e vínculo selado, mais o teste negativo de
 * tenant.
 *
 * A task original nomeia `test/e2e/trip-lifecycle.e2e.ts`, `env.test.e2e` e `make test-e2e` — nada
 * disso existe neste repositório (nem a pasta `envs/` que `code-standart.md` §4 documenta, nem o
 * alvo de Makefile). Construir essa camada do zero é um projeto de infraestrutura à parte, não
 * escopo desta task. O padrão real já estabelecido para "prova viva contra Postgres" é
 * `test/integration/*.integration.ts` com `withDisposableDatabase` — usado aqui, registrado no
 * mesmo `test:integration` dos demais.
 */
describe('trip lifecycle integration (spec 056 T018)', () => {
  testWithPostgres(
    'creates a trip, links three documents across two addresses, plans, separates, loads, dispatches, and seals the trip',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const otherCompanyId = crypto.randomUUID()
        const userId = crypto.randomUUID()
        const vehicleId = crypto.randomUUID()
        const driverId = crypto.randomUUID()

        await database.db.insert(companies).values([
          { id: companyId, status: 'active' },
          { id: otherCompanyId, status: 'active' },
        ])
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
          name: 'Motorista E2E',
          taxId: '11111111111',
        })

        // Duas notas no mesmo endereço (viram uma parada), uma nota num endereço diferente.
        const documentAId = await seedNfeDocumentWithRecipient(database, {
          companyId,
          postalCode: '14010100',
          suffix: '1',
          userId,
        })
        const documentBId = await seedNfeDocumentWithRecipient(database, {
          companyId,
          postalCode: '14010100',
          suffix: '2',
          userId,
        })
        const documentCId = await seedNfeDocumentWithRecipient(database, {
          companyId,
          postalCode: '01310100',
          suffix: '3',
          userId,
        })

        const tripRepository = new DrizzleTripRepository(database.db)
        const routeRepository = new DrizzleTripRouteRepository(database.db)
        const documentRepository = new DrizzleTripDocumentRepository(database.db)

        const trip = await tripRepository.create({
          companyId,
          crew: [
            {
              driverId,
              driverName: 'Motorista E2E',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId,
        })
        expect(trip.status).toBe('draft')

        const linkedA = await tripRepository.linkDocument({
          companyId,
          freightCalculationId: null,
          nfeDocumentId: documentAId,
          tripId: trip.id,
        })
        const linkedB = await tripRepository.linkDocument({
          companyId,
          freightCalculationId: null,
          nfeDocumentId: documentBId,
          tripId: trip.id,
        })
        const linkedC = await tripRepository.linkDocument({
          companyId,
          freightCalculationId: null,
          nfeDocumentId: documentCId,
          tripId: trip.id,
        })

        // Duas notas no mesmo CEP/número/município reaproveitam a mesma parada; a terceira, não.
        expect(linkedA.stopId).not.toBeNull()
        expect(linkedB.stopId).toBe(linkedA.stopId)
        expect(linkedC.stopId).not.toBeNull()
        expect(linkedC.stopId).not.toBe(linkedA.stopId)

        const stopRows = await database.db
          .select()
          .from(tripStops)
          .where(eq(tripStops.tripId, trip.id))
        expect(stopRows).toHaveLength(2)

        const planned = await planTripRoute({
          companyId,
          repository: routeRepository,
          tripId: trip.id,
        })
        expect(planned.tripStatus).toBe('route_planned')

        for (const documentId of [linkedA.id, linkedB.id, linkedC.id]) {
          const separated = await transitionTripDocument({
            action: 'separate',
            actorUserId: userId,
            companyId,
            documentId,
            repository: documentRepository,
            tripId: trip.id,
          })
          expect(separated.document.separationStatus).toBe('separated')
        }
        expect((await tripRepository.findById({ companyId, tripId: trip.id }))?.status).toBe(
          'separating',
        )

        for (const documentId of [linkedA.id, linkedB.id, linkedC.id]) {
          const loaded = await transitionTripDocument({
            action: 'load',
            actorUserId: userId,
            companyId,
            documentId,
            repository: documentRepository,
            tripId: trip.id,
          })
          expect(loaded.document.separationStatus).toBe('loaded')
        }
        expect((await tripRepository.findById({ companyId, tripId: trip.id }))?.status).toBe(
          'loading',
        )

        const dispatched = await dispatchTrip({
          actorUserId: userId,
          companyId,
          repository: routeRepository,
          tripId: trip.id,
        })
        expect(dispatched.tripStatus).toBe('dispatched')

        // O snapshot congelado lista as duas paradas, com as notas certas em cada uma.
        const [snapshot] = await database.db
          .select()
          .from(tripDispatchSnapshots)
          .where(eq(tripDispatchSnapshots.tripId, trip.id))
        expect(snapshot).toBeDefined()
        const stops = (snapshot?.snapshot as { stops: readonly { documentIds: string[] }[] }).stops
        expect(stops).toHaveLength(2)
        expect(stops.map((stop) => stop.documentIds.length).sort()).toEqual([1, 2])

        // O vínculo está selado: nem uma nota nova entra, nem uma existente sai.
        const newDocumentId = await seedNfeDocumentWithRecipient(database, {
          companyId,
          postalCode: '14010100',
          suffix: '4',
          userId,
        })
        await expect(
          tripRepository.linkDocument({
            companyId,
            freightCalculationId: null,
            nfeDocumentId: newDocumentId,
            tripId: trip.id,
          }),
        ).rejects.toMatchObject({ code: 'STATE_TRANSITION_NOT_ALLOWED', status: 409 })
        expect(
          await tripRepository.releaseDocument({
            companyId,
            documentId: linkedA.id,
            tripId: trip.id,
          }),
        ).toBeNull()

        // Teste negativo de tenant: a viagem de uma empresa não existe para a outra — 404, não 403.
        expect(await tripRepository.findById({ companyId: otherCompanyId, tripId: trip.id })).toBeNull()
      })
    },
    30_000,
  )
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function seedNfeDocumentWithRecipient(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly postalCode: string
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
    objectKey: `nfe/${input.suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-lifecycle-${input.suffix}`,
    id: importId,
    idempotencyKey: `lifecycle-${input.suffix}`,
    requestFingerprint: `fingerprint-lifecycle-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.suffix}${'1'.repeat(43)}`,
    authorizationProtocol: `protocol-lifecycle-${input.suffix}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-07-22T12:00:00.000Z'),
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
  })
  await database.db.insert(nfeAddresses).values({
    city: 'Ribeirao Preto',
    cityCode: '3543402',
    companyId: input.companyId,
    number: '100',
    participantId,
    postalCode: input.postalCode,
    state: 'SP',
    street: 'Rua do Ciclo Completo',
  })

  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t018_${crypto.randomUUID().replaceAll('-', '')}`
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
