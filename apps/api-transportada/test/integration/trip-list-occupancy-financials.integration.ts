/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 259 — a linha de `GET /trips` diz ocupação e resultado, **e diz o mesmo que o detalhe**. Contra
 * Postgres: três viagens com perfis diferentes (capacidade e peso conhecidos, veículo sem capacidade,
 * sem veículo), todas com rota congelada, e a lista conferida campo a campo contra `findById` (ocupação
 * e peso) e `readTripValuation` (custo e margem), as duas leituras que a tela de detalhe usa.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  companyCargoSettings,
  companyCargoVolumeFactors,
  companyFuelPrices,
  companyTaxSettings,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  nfeVolumes,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripCostEntries } from '../../src/database/trip-financial.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../src/database/trip.schema.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import { readTripRevenueTotals } from '../../src/trips/application/read-trip-revenue-totals.use-case.js'
import {
  readTripValuation,
  type ApplicableFreightRule,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { DrizzleTripValuationQuery } from '../../src/trips/infrastructure/trip-valuation.query.js'

const SILENT_LOGGER = { error: () => undefined, info: () => undefined, warn: () => undefined }

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const FIFTY_KILOMETRES = 50_000
const ONE_HOUR = 3_600
const SHA = '2'.repeat(64)
let documentSequence = 0

const TEN_PERCENT_RULE: ApplicableFreightRule = {
  freightRuleId: '00000000-0000-4000-8000-000000000c01',
  freightRuleName: 'Regra de teste',
  freightRuleVersionId: '00000000-0000-4000-8000-000000000c02',
  maximumAmount: '',
  minimumAmount: '',
  percentage: '0.100000',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '',
  version: '1',
}

const FROZEN_ROUTE = {
  choiceReproduced: true,
  criterion: 'cheapest',
  depot: { leadingLegs: 1, trailingLegs: 1 },
  isNoToll: false,
  legs: Array.from({ length: 2 }, () => ({
    distanceMetres: FIFTY_KILOMETRES,
    durationSeconds: ONE_HOUR,
  })),
  points: [],
  signature: 'integration-259',
}

type World = {
  readonly capableVehicleId: string
  readonly companyId: string
  readonly driverId: string
  readonly importId: string
  readonly incapableVehicleId: string
  readonly userId: string
  readonly xmlObjectId: string
}

type SeededTrips = {
  readonly capableTripId: string
  readonly crewlessTripId: string
  readonly incapableTripId: string
}

describe('a linha da lista diz o mesmo que o detalhe (spec 259, T1.2)', () => {
  testWithPostgres(
    'ocupação, peso, custo e margem da lista são os do detalhe, viagem a viagem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const seeded = await seedTrips(database, world)
        const tripIds = [seeded.capableTripId, seeded.incapableTripId, seeded.crewlessTripId]

        const items = await listAsOfficeWithFinancials(database, world)
        const repository = new DrizzleTripRepository(database.db)

        expect(items.map((item) => item.id).sort()).toEqual([...tripIds].sort())
        for (const tripId of tripIds) {
          const item = fieldsOf(items.find((candidate) => candidate.id === tripId))
          const detail = await repository.findById({ companyId: world.companyId, tripId })
          const valuation = await valuate(database, world.companyId, tripId)

          expect(item.occupancy).toEqual(
            detail?.vehicleId === null
              ? null
              : {
                  capacityUnknownReason: detail?.capacityUnknownReason ?? null,
                  volume:
                    detail?.occupancy == null
                      ? null
                      : {
                          documentsWithoutVolume: detail.occupancy.documentsWithoutVolume,
                          occupancyRatio: detail.occupancy.occupancyRatio,
                          source: detail.occupancy.source,
                        },
                  weight:
                    detail?.cargoWeight == null
                      ? null
                      : {
                          documentsWithoutWeight: detail.cargoWeight.documentsWithoutWeight,
                          payloadRatio: detail.cargoWeight.payloadRatio,
                          source: detail.cargoWeight.source,
                        },
                },
          )
          expect(fieldsOf(item.amounts)).toMatchObject({
            costTotal: valuation.totalCost,
            hasGaps: valuation.hasGaps,
            marginPercentage: valuation.marginPercentage,
            marginTotal: valuation.totalMargin,
          })
        }
      })
    },
    60_000,
  )

  testWithPostgres(
    'o cenário prova algo: peso e volume conhecidos, veículo sem capacidade e viagem sem veículo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const seeded = await seedTrips(database, world)
        const repository = new DrizzleTripRepository(database.db)

        const capable = await repository.findById({
          companyId: world.companyId,
          tripId: seeded.capableTripId,
        })
        const incapable = await repository.findById({
          companyId: world.companyId,
          tripId: seeded.incapableTripId,
        })
        const crewless = await repository.findById({
          companyId: world.companyId,
          tripId: seeded.crewlessTripId,
        })
        const valuation = await valuate(database, world.companyId, seeded.capableTripId)

        expect(capable?.occupancy?.occupancyRatio).not.toBeNull()
        expect(capable?.cargoWeight?.payloadRatio).not.toBeNull()
        expect(capable?.cargoWeight?.documentsWithoutWeight).toBe(1)
        expect(incapable?.capacityUnknownReason).not.toBeNull()
        expect(incapable?.occupancy).toBeNull()
        expect(crewless?.vehicleId).toBeNull()
        expect(Number.parseFloat(valuation.totalCost)).toBeGreaterThan(0)
      })
    },
    60_000,
  )
})

/** Lê a lista como o escritório com `trip.financials`: tudo ligado, exatamente como `main.ts` monta. */
async function listAsOfficeWithFinancials(database: TestDatabase, world: World) {
  const useCase = createTripUseCase({
    amounts: {
      read: (input) =>
        readTripRevenueTotals({
          ...input,
          repository: {
            findApplicableRule: () => Promise.resolve(TEN_PERCENT_RULE),
            readDocumentsByTrip: (query) =>
              new DrizzleTripValuationQuery(database.db, SILENT_LOGGER).readDocumentsByTrip(query),
          },
        }),
    },
    locations: { purgeByTrip: () => Promise.resolve() },
    repository: new DrizzleTripRepository(database.db),
  })
  // Variável, não literal: o campo `includeFinancials` entra no tipo na T2.2.
  const input = {
    context: { companyId: world.companyId, userId: world.userId },
    cursor: null,
    includeFinancials: true,
    limit: 20,
  }
  const page = await useCase.list(input)

  return page.items
}

function fieldsOf(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('o objeto esperado não veio')
  return value as Record<string, unknown>
}

function valuate(database: TestDatabase, companyId: string, tripId: string) {
  return readTripValuation({
    companyId,
    repository: {
      findApplicableRule: () => Promise.resolve(TEN_PERCENT_RULE),
      readContext: (query) =>
        new DrizzleTripValuationQuery(database.db, SILENT_LOGGER).readContext(query),
    },
    tripId,
  })
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const capableVehicleId = crypto.randomUUID()
  const incapableVehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(companyTaxSettings).values({
    cofinsRate: '0.030000',
    companyId,
    federalRegime: 'presumed',
    pisRate: '0.006500',
  })
  await database.db
    .insert(companyFuelPrices)
    .values({ companyId, pricePerUnit: '6.0000', product: 'diesel-s10' })
  await database.db.insert(companyCargoSettings).values({ companyId, defaultVolumeWeight: '10' })
  await database.db
    .insert(companyCargoVolumeFactors)
    .values({ companyId, species: 'CAIXA', volumePerUnitM3: '0.050000' })
  await database.db.insert(fleetVehicles).values({
    averageConsumption: '2.5000',
    capacityKg: '3000.000',
    capacityM3: '20.000',
    companyId,
    fuelType: 'diesel-s10',
    id: capableVehicleId,
    otherCostsPerKilometer: '0.3000',
    plate: 'GCQ8E48',
    role: 'traction',
    state: 'SP',
    vehicleType: 'toco',
  })
  await database.db.insert(fleetVehicles).values({
    averageConsumption: '3.0000',
    companyId,
    fuelType: 'diesel-s10',
    id: incapableVehicleId,
    plate: 'GCQ8E49',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    dailyAllowanceAmount: '350.0000',
    id: driverId,
    name: 'Agregado',
    paymentModel: 'route_table',
    taxId: '22222222222',
  })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'nfe/list-259.xml',
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-list-259',
    id: importId,
    idempotencyKey: 'list-259',
    requestFingerprint: 'fingerprint-list-259',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })

  return {
    capableVehicleId,
    companyId,
    driverId,
    importId,
    incapableVehicleId,
    userId,
    xmlObjectId,
  }
}

async function seedTrips(database: TestDatabase, world: World): Promise<SeededTrips> {
  return {
    capableTripId: await seedTrip(database, {
      documentWeights: ['120.000', null],
      vehicleId: world.capableVehicleId,
      world,
    }),
    crewlessTripId: await seedTrip(database, {
      documentWeights: ['80.000'],
      vehicleId: null,
      world,
    }),
    incapableTripId: await seedTrip(database, {
      documentWeights: ['60.000'],
      vehicleId: world.incapableVehicleId,
      world,
    }),
  }
}

/** Uma viagem com rota congelada; `documentWeights[i]` é o peso bruto da nota `i` (`null` = sem volume). */
async function seedTrip(
  database: TestDatabase,
  input: {
    readonly documentWeights: readonly (string | null)[]
    readonly vehicleId: string | null
    readonly world: World
  },
): Promise<string> {
  const { world } = input
  const tripId = crypto.randomUUID()
  const hasVehicle = input.vehicleId !== null

  await database.db.insert(trips).values({
    companyId: world.companyId,
    dailyAllowanceDays: 2,
    id: tripId,
    plannedDistanceMeters: FIFTY_KILOMETRES * 2,
    plannedDurationSeconds: ONE_HOUR * 2,
    plannedReturnDistanceMeters: FIFTY_KILOMETRES,
    plannedRoute: FROZEN_ROUTE,
    plannedRouteFrozenAt: new Date('2026-10-02T06:00:00.000Z'),
    status: hasVehicle ? 'draft' : 'awaiting_crew',
    vehicleId: input.vehicleId,
  })
  if (hasVehicle) {
    await database.db.insert(tripDrivers).values({
      companyId: world.companyId,
      driverId: world.driverId,
      driverName: 'Agregado',
      driverTaxId: '22222222222',
      position: 1n,
      tripId,
    })
    await database.db.insert(tripCostEntries).values({
      actorUserId: world.userId,
      amount: '90.0000',
      companyId: world.companyId,
      description: 'Avulso da viagem',
      kind: 'other',
      tripId,
    })
  }

  const stopId = crypto.randomUUID()
  await database.db.insert(tripStops).values({
    addressKey: `${tripId}|1`,
    companyId: world.companyId,
    id: stopId,
    label: 'Parada 1',
    sequence: 1n,
    tripId,
  })
  for (const grossWeight of input.documentWeights) {
    const nfeDocumentId = await seedNfeDocument(database, world)
    if (grossWeight !== null) {
      await database.db.insert(nfeVolumes).values({
        companyId: world.companyId,
        documentId: nfeDocumentId,
        grossWeight,
        ordinal: 1n,
        quantity: '10',
        species: 'CAIXA',
      })
    }
    await database.db
      .insert(tripDocuments)
      .values({ companyId: world.companyId, nfeDocumentId, stopId, tripId })
  }

  return tripId
}

async function seedNfeDocument(database: TestDatabase, world: World): Promise<string> {
  const nfeDocumentId = crypto.randomUUID()
  documentSequence += 1
  await database.db.insert(nfeDocuments).values({
    accessKey: `6${String(documentSequence).padStart(43, '0')}`,
    authorizationProtocol: `protocol-list-${documentSequence}`,
    companyId: world.companyId,
    createdByUserId: world.userId,
    freightValue: '0.0000',
    id: nfeDocumentId,
    importId: world.importId,
    issuedAt: new Date('2026-09-30T06:00:00.000Z'),
    model: '55',
    number: String(800_000 + documentSequence),
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '10000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: `${documentSequence * 1500}.0000`,
    xmlObjectId: world.xmlObjectId,
    xmlSha256: SHA,
  })

  return nfeDocumentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_259',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
