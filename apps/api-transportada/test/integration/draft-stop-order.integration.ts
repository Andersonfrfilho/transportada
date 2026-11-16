/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323 T7 — a ordem das paradas do rascunho contra Postgres. O que só o banco prova: que o vínculo em lote cria as
 * paradas, o ordenador lê o barracão e as coordenadas de `geocoded_addresses`, a ordem sai gravada em `trip_stops` e a
 * origem (`stop_order_source`) vai junto na mesma transação do reordenar. A matriz é falsa (distância pela longitude):
 * o OSRM não é o que está em teste aqui.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  companyRouteOptimizationSettings,
  fleetVehicles,
  geocodedAddresses,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripStops, trips } from '../../src/database/trip.schema.js'
import { createLinkTripDocumentsBatchUseCase } from '../../src/trips/application/link-trip-documents-batch.use-case.js'
import { createOrderDraftTripStops } from '../../src/trips/application/order-draft-trip-stops.use-case.js'
import { reorderTripStops } from '../../src/trips/application/reorder-trip-stops.use-case.js'
import type { RoadMatrixPort } from '../../src/trips/application/road-matrix.port.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import { buildStopAddressKey } from '../../src/trips/domain/stop-address-key.js'
import { createDrizzleDraftStopOrderRepository } from '../../src/trips/infrastructure/drizzle-draft-stop-order.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { createRouteDepotQuery } from '../../src/trips/infrastructure/route-depot.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/** Três cidades que o bip intercala. A longitude é a "estrada": Matão, Monte Alto, Jaboticabal. */
const CITIES = {
  jaboticabal: { cityCode: '3524303', longitude: 3, postalCode: '14870000' },
  matao: { cityCode: '3529401', longitude: 1, postalCode: '15990000' },
  monteAlto: { cityCode: '3531803', longitude: 2, postalCode: '15910000' },
} as const
type CityName = keyof typeof CITIES

const lineMatrix: RoadMatrixPort = {
  async readMatrix(points) {
    const costs = points.map((from) => points.map((to) => Math.abs(from.longitude - to.longitude)))
    return { distancesMetres: costs, durationsSeconds: costs }
  },
}
const downMatrix: RoadMatrixPort = { readMatrix: async () => null }

describe('ordem das paradas do rascunho contra Postgres (spec 323)', () => {
  testWithPostgres(
    'o lote bipado intercalado sai na ordem da estrada, marcado como sugerido',
    async () => {
      const database = shared?.database
      if (database === undefined) return
      const world = await seedWorld(database, ['jaboticabal', 'matao', 'monteAlto', 'matao'])

      const result = await world.link(lineMatrix, world.documentIds)

      expect(result.linked).toHaveLength(4)
      expect(await readCityOrder(database, world.tripId)).toEqual([
        'matao',
        'monteAlto',
        'jaboticabal',
      ])
      expect(await readOrderState(database, world.tripId)).toEqual({
        code: null,
        source: 'suggested',
      })
    },
  )

  testWithPostgres(
    'OSRM fora do ar: o vínculo vale, a ordem é a de chegada e o código fica gravado',
    async () => {
      const database = shared?.database
      if (database === undefined) return
      const world = await seedWorld(database, ['jaboticabal', 'matao', 'monteAlto'])

      const result = await world.link(downMatrix, world.documentIds)

      expect(result.linked).toHaveLength(3)
      expect(await readCityOrder(database, world.tripId)).toEqual([
        'jaboticabal',
        'matao',
        'monteAlto',
      ])
      expect(await readOrderState(database, world.tripId)).toEqual({
        code: 'ROUTING_MATRIX_UNAVAILABLE',
        source: 'unordered',
      })
    },
  )

  testWithPostgres(
    'ajuste manual: a nota nova é encaixada e a ordem do despachante fica',
    async () => {
      const database = shared?.database
      if (database === undefined) return
      const world = await seedWorld(database, ['jaboticabal', 'matao', 'monteAlto'])
      await world.link(downMatrix, world.documentIds.slice(0, 2))
      const stops = await database.db
        .select({ id: tripStops.id })
        .from(tripStops)
        .where(eq(tripStops.tripId, world.tripId))
        .orderBy(asc(tripStops.sequence))
      /** O despachante põe Matão antes de Jaboticabal e arrasta: a origem vira `manual`. */
      await reorderTripStops({
        companyId: world.companyId,
        orderedStopIds: stops.map((stop) => stop.id).reverse(),
        repository: new DrizzleTripRouteRepository(database.db),
        tripId: world.tripId,
      })
      expect(await readOrderState(database, world.tripId)).toEqual({ code: null, source: 'manual' })

      await world.link(lineMatrix, world.documentIds.slice(2))

      expect(await readCityOrder(database, world.tripId)).toEqual([
        'matao',
        'monteAlto',
        'jaboticabal',
      ])
      expect(await readOrderState(database, world.tripId)).toEqual({ code: null, source: 'manual' })
    },
  )

  testWithPostgres('o botão refaz até a ordem manual e volta a sugerida', async () => {
    const database = shared?.database
    if (database === undefined) return
    const world = await seedWorld(database, ['jaboticabal', 'matao', 'monteAlto'])
    await world.link(downMatrix, world.documentIds)

    const outcome = await world.orderer(lineMatrix).execute({
      companyId: world.companyId,
      intent: 'reorder_all',
      strict: true,
      tripId: world.tripId,
    })

    expect(outcome.status).toBe('ordered')
    expect(await readCityOrder(database, world.tripId)).toEqual([
      'matao',
      'monteAlto',
      'jaboticabal',
    ])
    expect(await readOrderState(database, world.tripId)).toEqual({
      code: null,
      source: 'suggested',
    })
  })
})

function randomAccessKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(44)), (byte) => String(byte % 10)).join(
    '',
  )
}

async function readCityOrder(database: TestDatabase, tripId: string): Promise<CityName[]> {
  const rows = await database.db
    .select({ addressKey: tripStops.addressKey })
    .from(tripStops)
    .where(eq(tripStops.tripId, tripId))
    .orderBy(asc(tripStops.sequence))
  const byKey = new Map(
    (Object.entries(CITIES) as [CityName, (typeof CITIES)[CityName]][]).map(([name, city]) => [
      buildStopAddressKey({ cityCode: city.cityCode, number: '10', postalCode: city.postalCode }),
      name,
    ]),
  )
  return rows.map((row) => byKey.get(row.addressKey) as CityName)
}

async function readOrderState(database: TestDatabase, tripId: string) {
  const [row] = await database.db
    .select({ code: trips.stopOrderErrorCode, source: trips.stopOrderSource })
    .from(trips)
    .where(eq(trips.id, tripId))
  return row
}

async function seedWorld(database: TestDatabase, cities: readonly CityName[]) {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const depotKey = `depot-${companyId}`

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E50',
    role: 'traction',
    state: 'SP',
    vehicleType: 'toco',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-323',
    id: importId,
    idempotencyKey: `323-${companyId}`,
    requestFingerprint: 'fingerprint-323',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })

  /** O barracão em longitude 0, geocodificado, e as três cidades no meio-fio (precisão `street`). */
  await database.db
    .insert(companyRouteOptimizationSettings)
    .values({ companyId, originAddressKey: depotKey })
  await database.db
    .insert(geocodedAddresses)
    .values({
      addressKey: depotKey,
      latitude: '0',
      longitude: '0',
      precision: 'street',
      source: 'manual',
    })
    .onConflictDoNothing()
  for (const city of Object.values(CITIES)) {
    await database.db
      .insert(geocodedAddresses)
      .values({
        addressKey: buildStopAddressKey({
          cityCode: city.cityCode,
          number: '10',
          postalCode: city.postalCode,
        }) as string,
        latitude: '0',
        longitude: String(city.longitude),
        precision: 'street',
        source: 'manual',
      })
      .onConflictDoNothing()
  }

  const documentIds: string[] = []
  for (const [index, name] of cities.entries()) {
    const city = CITIES[name]
    const documentId = crypto.randomUUID()
    const xmlObjectId = crypto.randomUUID()
    documentIds.push(documentId)
    await database.db.insert(storedObjects).values({
      bucket: 'integration',
      companyId,
      id: xmlObjectId,
      mimeType: 'application/xml',
      objectKey: `nfe/323-${documentId}.xml`,
      provider: 's3',
      purpose: 'nfe_document',
      sha256: String(index + 1).repeat(64),
      sizeBytes: 100n,
      status: 'final',
    })
    await database.db.insert(nfeDocuments).values({
      accessKey: randomAccessKey(),
      authorizationProtocol: `protocol-${documentId}`,
      companyId,
      createdByUserId: userId,
      freightValue: '0.0000',
      id: documentId,
      importId,
      issuedAt: new Date('2026-11-10T06:00:00.000Z'),
      model: '55',
      number: String(910000 + index),
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '1000.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: '1000.0000',
      xmlObjectId,
      xmlSha256: String(index + 1).repeat(64),
    })
    const participantId = crypto.randomUUID()
    await database.db.insert(nfeParticipants).values({
      companyId,
      documentId,
      id: participantId,
      legalName: 'Destinatário',
      role: 'recipient',
      taxId: '98765432000109',
    })
    await database.db.insert(nfeAddresses).values({
      city: name,
      cityCode: city.cityCode,
      companyId,
      district: 'Centro',
      id: crypto.randomUUID(),
      number: '10',
      participantId,
      postalCode: city.postalCode,
      state: 'SP',
      street: 'Rua Um',
    })
  }

  const tripRepository = new DrizzleTripRepository(database.db)
  const routeRepository = new DrizzleTripRouteRepository(database.db)
  const trip = await createTripUseCase({
    locations: { purgeByTrip: async () => {} },
    repository: tripRepository,
  }).create({ context: { companyId, userId }, driverIds: [], vehicleId })

  const orderer = (matrix: RoadMatrixPort) =>
    createOrderDraftTripStops({
      depot: createRouteDepotQuery(database.db),
      matrix,
      reorder: routeRepository,
      repository: createDrizzleDraftStopOrderRepository(database.db),
    })

  return {
    companyId,
    documentIds,
    link: (matrix: RoadMatrixPort, nfeDocumentIds: readonly string[]) =>
      createLinkTripDocumentsBatchUseCase({
        repository: tripRepository,
        stopOrderer: orderer(matrix),
      }).execute({ context: { companyId }, nfeDocumentIds, tripId: trip.id }),
    orderer,
    tripId: trip.id,
  }
}

let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_323_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${name}"`)
    await runDatabaseMigrations({ connectionString: url.toString() })
    shared = { database: createDrizzleProvider({ connection: url.toString() }), name }
  } finally {
    await admin.close({ timeout: 0 })
  }
}, 60_000)

afterAll(async () => {
  if (databaseUrl === undefined || shared === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    await shared.database.close()
    await admin.unsafe(`drop database if exists "${shared.name}" with (force)`)
  } finally {
    await admin.close({ timeout: 0 })
  }
})
