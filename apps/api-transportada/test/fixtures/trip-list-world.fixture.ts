/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 259: o mundo das integrações da lista de viagens — empresa com regime, combustível, fatores de
 * volume, veículos (com capacidade, sem capacidade, cavalo + carreta) e viagens de rota congelada com notas
 * de volume e peso conhecidos. Compartilhado pelo teste de paridade e pelo de medição de tempo.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

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
import type { ApplicableFreightRule } from '../../src/trips/application/read-trip-valuation.use-case.js'

export type TestDatabase = ReturnType<typeof createDrizzleProvider>

export const FIFTY_KILOMETRES = 50_000
export const ONE_HOUR = 3_600
export const SHA = '2'.repeat(64)
let documentSequence = 0
let plateSequence = 0

/** Placa Mercosul única por chamada: a placa é única na instalação, e o teste semeia várias empresas. */
export function nextPlate(): string {
  plateSequence += 1
  return `GCQ${Math.floor(plateSequence / 100) % 10}E${String(plateSequence % 100).padStart(2, '0')}`
}

export const TEN_PERCENT_RULE: ApplicableFreightRule = {
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

export const FROZEN_ROUTE = {
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

export type World = {
  readonly capableVehicleId: string
  readonly trailerId: string
  readonly tractorId: string
  readonly companyId: string
  readonly driverId: string
  readonly importId: string
  readonly incapableVehicleId: string
  readonly userId: string
  readonly xmlObjectId: string
}

export type SeededTrips = {
  readonly capableTripId: string
  readonly crewlessTripId: string
  readonly incapableTripId: string
  readonly trailerTripId: string
}

export async function seedWorld(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const capableVehicleId = crypto.randomUUID()
  const incapableVehicleId = crypto.randomUUID()
  const tractorId = crypto.randomUUID()
  const trailerId = crypto.randomUUID()
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
    plate: nextPlate(),
    role: 'traction',
    state: 'SP',
    vehicleType: 'toco',
  })
  await database.db.insert(fleetVehicles).values({
    averageConsumption: '3.0000',
    companyId,
    fuelType: 'diesel-s10',
    id: incapableVehicleId,
    plate: nextPlate(),
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetVehicles).values([
    {
      averageConsumption: '3.0000',
      capacityKg: '9000.000',
      companyId,
      fuelType: 'diesel-s10',
      id: tractorId,
      plate: nextPlate(),
      role: 'traction',
      state: 'SP',
      vehicleType: 'tractor_unit',
    },
    {
      capacityKg: '5000.000',
      capacityM3: '30.000',
      companyId,
      id: trailerId,
      loadingAccess: 'open',
      plate: nextPlate(),
      role: 'trailer',
      state: 'SP',
      vehicleType: '',
    },
  ])
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
    tractorId,
    trailerId,
    userId,
    xmlObjectId,
  }
}

export async function seedTrips(database: TestDatabase, world: World): Promise<SeededTrips> {
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
    trailerTripId: await seedTrip(database, {
      documentWeights: ['200.000', '300.000'],
      trailerVehicleId: world.trailerId,
      vehicleId: world.tractorId,
      world,
    }),
  }
}

/** Uma viagem com rota congelada; `documentWeights[i]` é o peso bruto da nota `i` (`null` = sem volume). */
export async function seedTrip(
  database: TestDatabase,
  input: {
    readonly documentWeights: readonly (string | null)[]
    readonly trailerVehicleId?: string
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
    trailerVehicleId: input.trailerVehicleId ?? null,
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

export async function seedNfeDocument(database: TestDatabase, world: World): Promise<string> {
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
