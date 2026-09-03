/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 058 P2 — o aceite da sugestão multi-veículo contra Postgres. O que só o banco prova: que uma
 * proposta sem viagem nenhuma vira **N viagens de verdade**, com as notas vinculadas, as paradas
 * nascidas da reconciliação e a ordem que o solver propôs — e tudo isso pelos casos de uso da 056,
 * que é a promessa da ADR-0044 §5.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetVehicles,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  routeSuggestionDocuments,
  routeSuggestionStopDocuments,
  routeSuggestionStops,
  routeSuggestionVehicles,
  routeSuggestions,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, trips } from '../../src/database/trip.schema.js'
import { createMultiVehicleSuggestionUseCase } from '../../src/routing/application/multi-vehicle-suggestion.use-case.js'
import type { MultiVehicleScope } from '../../src/routing/application/multi-vehicle-suggestion.port.js'
import { MultiVehicleSuggestionDocumentUnavailableError } from '../../src/routing/domain/routing.error.js'
import { createDrizzleMultiVehicleSuggestionRepository } from '../../src/routing/infrastructure/drizzle-multi-vehicle-suggestion.repository.js'
import { createDrizzleRouteSuggestionRepository } from '../../src/routing/infrastructure/drizzle-route-suggestion.repository.js'
import { createTripComposer } from '../../src/routing/infrastructure/trip-composer.adapter.js'
import { listTripStops } from '../../src/trips/application/list-trip-stops.use-case.js'
import { createTripLifecycleUseCase } from '../../src/trips/application/trip-lifecycle.use-case.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripStopLookupRepository } from '../../src/trips/infrastructure/drizzle-trip-stop-lookup.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const FIRST_ADDRESS_KEY = '3543402|14020000|100'
const SECOND_ADDRESS_KEY = '3543402|14025000|200'

/**
 * Spec 074: o teste do aceite semeia a sugestão por `insert` direto — então `create`, o **primeiro**
 * passo do fluxo, nunca era exercitado. Ele falhava em toda chamada: a releitura pós-inserção saía
 * por uma conexão de fora da transação, não enxergava a linha ainda não commitada, e o repositório
 * lançava `Error` puro que virava 500.
 *
 * Contra Postgres de verdade porque é a única forma de o defeito aparecer: dublê de repositório não
 * tem duas conexões, e responde o que o banco esconde.
 */
describe('a criação da multi-veículo contra Postgres (spec 074)', () => {
  testWithPostgres('creates the suggestion with its pool and its fleet', async () => {
    const database = shared?.database
    if (database === undefined) return
    const world = await seedSuggestion(database)
    const repository = createDrizzleMultiVehicleSuggestionRepository(database.db)

    const created = await repository.create({
      assumptions: {
        dutyEnabled: false,
        endPolicy: 'depot',
        fallbackWeightKilograms: '0.00',
        originAddressKey: 'depot',
        serviceTimeSeconds: 600,
        serviceTimeSource: 'default',
        solverTimeBudgetSeconds: 30,
      },
      companyId: world.companyId,
      documentIds: world.documentIds,
      seed: 11,
      vehicles: world.vehicles,
    })

    expect(created.id).toBeTruthy()
    expect(created.status).toBe('queued')
    /** Multiveículo não parte de viagem: o `trip_id` nulo é o que a distingue da sugestão por viagem. */
    expect(created.tripId).toBeNull()

    const pool = await database.db
      .select({ nfeDocumentId: routeSuggestionDocuments.nfeDocumentId })
      .from(routeSuggestionDocuments)
      .where(eq(routeSuggestionDocuments.suggestionId, created.id))
    const fleet = await database.db
      .select({
        position: routeSuggestionVehicles.position,
        vehicleId: routeSuggestionVehicles.vehicleId,
      })
      .from(routeSuggestionVehicles)
      .where(eq(routeSuggestionVehicles.suggestionId, created.id))

    expect(pool).toHaveLength(world.documentIds.length)
    /** A ordem oferecida é o que faz a mesma semente distribuir igual — ela é gravada, não inferida. */
    expect(fleet.map((row) => row.vehicleId)).toEqual(world.vehicles.map((pair) => pair.vehicleId))
    expect(fleet.map((row) => Number(row.position))).toEqual([0, 1])
  })

  /**
   * A recusa de negocio existia e era **inalcancavel**: o 500 da releitura fora da transacao
   * acontecia depois dela na leitura do codigo, mas antes na pratica, porque toda chamada morria.
   * Com a criacao funcionando, ela volta a ser o que sempre quis ser -- um 409 com o id no `details`.
   */
  testWithPostgres('refuses a note already linked to a trip with 409, never 500', async () => {
    const database = shared?.database
    if (database === undefined) return
    const world = await seedSuggestion(database)
    const useCase = buildUseCase(database)

    const created = await useCase.create({
      context: world.context,
      correlationId: crypto.randomUUID(),
      documentIds: world.documentIds,
      vehicles: world.vehicles,
    })
    expect(created.status).toBe('queued')

    const accepted = await useCase.accept({
      context: world.context,
      suggestionId: world.suggestionId,
    })
    expect(accepted.trips.length).toBeGreaterThan(0)

    /** As notas do pool agora estao em viagem: o segundo pedido tem de recusar, nomeando-as. */
    const refusal = await useCase
      .create({
        context: world.context,
        correlationId: crypto.randomUUID(),
        documentIds: world.documentIds,
        vehicles: world.vehicles,
      })
      .then(() => null)
      .catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(MultiVehicleSuggestionDocumentUnavailableError)
    expect((refusal as MultiVehicleSuggestionDocumentUnavailableError).status).toBe(409)
  })
})

describe('o aceite da multi-veículo contra Postgres (spec 058 P2)', () => {
  testWithPostgres('vira duas viagens, com nota vinculada e parada na ordem proposta', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedSuggestion(database)
      const useCase = buildUseCase(database)

      const accepted = await useCase.accept({
        context: world.context,
        suggestionId: world.suggestionId,
      })

      expect(accepted.suggestion.status).toBe('accepted')
      expect(accepted.trips).toHaveLength(2)

      for (const trip of accepted.trips) {
        const [row] = await database.db
          .select({ status: trips.status, vehicleId: trips.vehicleId })
          .from(trips)
          .where(and(eq(trips.companyId, world.companyId), eq(trips.id, trip.tripId)))

        /** A viagem sai do aceite em `route_planned` — é o que a spec promete ao operador (RF-5). */
        expect(row?.status).toBe('route_planned')
        expect(row?.vehicleId).toBe(trip.vehicleId)

        const linked = await database.db
          .select({ id: tripDocuments.id })
          .from(tripDocuments)
          .where(
            and(
              eq(tripDocuments.companyId, world.companyId),
              eq(tripDocuments.tripId, trip.tripId),
            ),
          )
        expect(linked).toHaveLength(trip.documentCount)

        /**
         * A parada **nasceu da reconciliação** (ADR-0043 §3), não da sugestão: é isso que garante
         * que a parada proposta e a parada criada sejam a mesma coisa.
         */
        const stops = await listTripStops({
          companyId: world.companyId,
          repository: new DrizzleTripStopLookupRepository(database.db),
          tripId: trip.tripId,
        })
        expect(stops.stops).toHaveLength(trip.stopCount)
      }

      /** A primeira viagem leva duas notas do mesmo endereço: uma parada, dois documentos. */
      const firstTrip = accepted.trips[0]
      expect(firstTrip?.documentCount).toBe(2)
      expect(firstTrip?.stopCount).toBe(1)
    })
  })

  /** Decidida uma vez, decidida para sempre: o segundo clique não cria a segunda leva de viagens. */
  testWithPostgres('o segundo aceite não cria viagem de novo', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedSuggestion(database)
      const useCase = buildUseCase(database)

      await useCase.accept({ context: world.context, suggestionId: world.suggestionId })
      const before = await countTrips(database, world.companyId)

      await expect(
        useCase.accept({ context: world.context, suggestionId: world.suggestionId }),
      ).rejects.toThrow()

      expect(await countTrips(database, world.companyId)).toBe(before)
    })
  })
})

async function countTrips(database: TestDatabase, companyId: string): Promise<number> {
  const rows = await database.db
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.companyId, companyId))

  return rows.length
}

function buildUseCase(database: TestDatabase) {
  const tripRepository = new DrizzleTripRepository(database.db)
  const routeRepository = new DrizzleTripRouteRepository(database.db)
  const stopRepository = new DrizzleTripStopLookupRepository(database.db)
  const tripUseCase = createTripUseCase({
    locations: { purgeByTrip: async () => {} },
    repository: tripRepository,
  })
  const lifecycle = createTripLifecycleUseCase({
    batchRepository: tripRepository as never,
    deliveryAddressOverrideRepository: tripRepository as never,
    documentRepository: tripRepository as never,
    locationRepository: stopRepository,
    routeRepository,
    stopRepository,
    suggestCharges: { onDelivered: async () => {} },
    trackingRepository: { purgeByTrip: async () => {} },
  })

  return createMultiVehicleSuggestionUseCase({
    multiVehicle: createDrizzleMultiVehicleSuggestionRepository(database.db),
    queue: { publish: async () => {} },
    suggestions: createDrizzleRouteSuggestionRepository(database.db),
    trips: createTripComposer({
      create: (input) => tripUseCase.create(input),
      link: (input) => tripUseCase.linkDocument(input),
      listStops: async (input) =>
        (await listTripStops({ ...input, repository: stopRepository })).stops,
      planRoute: (input) => lifecycle.planRoute.execute(input),
      reorder: (input) => lifecycle.reorderStops.execute(input),
    }),
  })
}

type World = {
  readonly companyId: string
  readonly context: MultiVehicleScope
  readonly documentIds: readonly string[]
  readonly suggestionId: string
  readonly vehicles: readonly { readonly vehicleId: string }[]
}

async function seedSuggestion(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const firstVehicleId = crypto.randomUUID()
  const secondVehicleId = crypto.randomUUID()
  const suggestionId = crypto.randomUUID()
  const importId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetVehicles).values([
    {
      companyId,
      id: firstVehicleId,
      plate: 'GCQ8E47',
      role: 'traction',
      state: 'SP',
      vehicleType: 'toco',
    },
    {
      companyId,
      id: secondVehicleId,
      plate: 'GCQ8E48',
      role: 'traction',
      state: 'SP',
      vehicleType: 'truck',
    },
  ])
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-p2',
    id: importId,
    idempotencyKey: 'p2',
    requestFingerprint: 'fingerprint-p2',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })

  const documents = [
    { number: '900001', postalCode: '14020000', street: 'Rua Um', streetNumber: '100' },
    { number: '900002', postalCode: '14020000', street: 'Rua Um', streetNumber: '100' },
    { number: '900003', postalCode: '14025000', street: 'Rua Dois', streetNumber: '200' },
  ]

  const documentIds: string[] = []
  for (const [index, document] of documents.entries()) {
    const documentId = crypto.randomUUID()
    const xmlObjectId = crypto.randomUUID()
    documentIds.push(documentId)

    await database.db.insert(storedObjects).values({
      bucket: 'integration',
      companyId,
      id: xmlObjectId,
      mimeType: 'application/xml',
      objectKey: `nfe/p2-${document.number}.xml`,
      provider: 's3',
      purpose: 'nfe_document',
      sha256: String(index + 1).repeat(64),
      sizeBytes: 100n,
      status: 'final',
    })
    await database.db.insert(nfeDocuments).values({
      accessKey: `${9 - index}${'1'.repeat(43)}`,
      authorizationProtocol: `protocol-${document.number}`,
      companyId,
      createdByUserId: userId,
      freightValue: '0.0000',
      id: documentId,
      importId,
      issuedAt: new Date(`2026-08-1${index}T06:00:00.000Z`),
      model: '55',
      number: document.number,
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
      city: 'Ribeirão Preto',
      cityCode: '3543402',
      companyId,
      district: 'Centro',
      id: crypto.randomUUID(),
      number: document.streetNumber,
      participantId,
      postalCode: document.postalCode,
      state: 'SP',
      street: document.street,
    })
  }

  await database.db.insert(routeSuggestions).values({
    assumptions: {
      dutyEnabled: false,
      endPolicy: 'depot',
      fallbackWeightKilograms: '0.00',
      originAddressKey: 'depot',
      serviceTimeSeconds: 600,
      serviceTimeSource: 'default',
      solverTimeBudgetSeconds: 30,
    },
    companyId,
    id: suggestionId,
    seed: 7,
    status: 'ready',
    tripId: null,
  })
  await database.db
    .insert(routeSuggestionDocuments)
    .values(documentIds.map((nfeDocumentId) => ({ companyId, nfeDocumentId, suggestionId })))
  await database.db.insert(routeSuggestionVehicles).values([
    { companyId, position: 0n, suggestionId, vehicleId: firstVehicleId },
    { companyId, position: 1n, suggestionId, vehicleId: secondVehicleId },
  ])

  /** O que o worker teria escrito: duas paradas, uma por veículo, com as notas de cada uma. */
  const [firstStop] = await database.db
    .insert(routeSuggestionStops)
    .values({
      addressKey: FIRST_ADDRESS_KEY,
      companyId,
      excludedFromOptimization: false,
      label: 'Rua Um',
      sequence: 1n,
      suggestionId,
      vehicleId: firstVehicleId,
      weightEstimated: true,
    })
    .returning({ id: routeSuggestionStops.id })
  const [secondStop] = await database.db
    .insert(routeSuggestionStops)
    .values({
      addressKey: SECOND_ADDRESS_KEY,
      companyId,
      excludedFromOptimization: false,
      label: 'Rua Dois',
      sequence: 2n,
      suggestionId,
      vehicleId: secondVehicleId,
      weightEstimated: true,
    })
    .returning({ id: routeSuggestionStops.id })

  await database.db.insert(routeSuggestionStopDocuments).values([
    { companyId, nfeDocumentId: documentIds[0] as string, suggestionStopId: firstStop?.id ?? '' },
    { companyId, nfeDocumentId: documentIds[1] as string, suggestionStopId: firstStop?.id ?? '' },
    { companyId, nfeDocumentId: documentIds[2] as string, suggestionStopId: secondStop?.id ?? '' },
  ])

  return {
    companyId,
    context: { companyId, membershipId, userId } as unknown as MultiVehicleScope,
    documentIds: [...documentIds],
    suggestionId,
    vehicles: [{ vehicleId: firstVehicleId }, { vehicleId: secondVehicleId }],
  }
}

let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_058_p2_${crypto.randomUUID().replaceAll('-', '')}`
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
})

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

async function withSharedDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (shared === undefined) throw new Error('A PostgreSQL test URL is required')
  await operation(shared.database)
}
