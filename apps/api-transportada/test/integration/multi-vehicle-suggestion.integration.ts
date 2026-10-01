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
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  routeSuggestionDocuments,
  routeSuggestionStopDocuments,
  routeSuggestionStops,
  routeSuggestionVehicleHelpers,
  routeSuggestionVehicles,
  routeSuggestions,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, tripDrivers, trips } from '../../src/database/trip.schema.js'
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
          .select({
            plannedRoute: trips.plannedRoute,
            plannedToll: trips.plannedToll,
            status: trips.status,
            vehicleId: trips.vehicleId,
          })
          .from(trips)
          .where(and(eq(trips.companyId, world.companyId), eq(trips.id, trip.tripId)))

        /**
         * Spec 217 D10: o grupo sugerido **sem motorista** (081 RF-5 o mantém legítimo) sai do
         * aceite em `awaiting_crew`, não mais em `route_planned` — e por isso sem rota e sem pedágio
         * congelados. O trabalho do rascunho fica todo lá (veículo, notas, ordem das paradas, horas
         * do solver) e o operador planeja a rota depois de definir quem dirige.
         *
         * ⚠️ O que este teste prende é o aceite **não estourar**: antes da D10 ele chamava
         * `planRoute` numa viagem `awaiting_crew` e tomava 409 `TRIP_CREW_NOT_DEFINED`, derrubando o
         * lote inteiro.
         */
        expect(row?.status).toBe('awaiting_crew')
        expect(row?.vehicleId).toBe(trip.vehicleId)
        expect(row?.plannedRoute).toBeNull()
        expect(row?.plannedToll).toBeNull()

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

  /**
   * Spec 110 D5a: **aceitar parte, contra o banco.** O contrato de aplicação prova o filtro; só o
   * Postgres prova que a nota do veículo não marcado continua **livre** — que é a frase que a tela
   * promete ao operador ("as notas voltam para o maço").
   */
  testWithPostgres('aceita um dos dois veículos e deixa a carga do outro livre', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedSuggestion(database)
      const useCase = buildUseCase(database)
      const chosen = world.vehicles[1]?.vehicleId ?? ''

      const accepted = await useCase.accept({
        context: world.context,
        suggestionId: world.suggestionId,
        vehicleIds: [chosen],
      })

      expect(accepted.trips).toHaveLength(1)
      expect(accepted.trips[0]?.vehicleId).toBe(chosen)
      expect(await countTrips(database, world.companyId)).toBe(1)

      /**
       * ⚠️ O que não foi aceito **não tem vínculo nenhum**: as notas do outro caminhão continuam
       * como estavam, disponíveis para a próxima montagem. Nada a desfazer, porque nada foi feito.
       */
      const linked = await database.db
        .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
        .from(tripDocuments)
        .where(eq(tripDocuments.companyId, world.companyId))

      expect(linked.length).toBe(accepted.trips[0]?.documentCount ?? 0)
      expect(linked.length).toBeLessThan(world.documentIds.length)
    })
  })

  testWithPostgres('veículo fora da proposta não consome a sugestão', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedSuggestion(database)
      const useCase = buildUseCase(database)

      await expect(
        useCase.accept({
          context: world.context,
          suggestionId: world.suggestionId,
          vehicleIds: [crypto.randomUUID()],
        }),
      ).rejects.toThrow()

      expect(await countTrips(database, world.companyId)).toBe(0)

      /** A proposta continua boa: o aceite inteiro ainda funciona depois do id errado. */
      const accepted = await useCase.accept({
        context: world.context,
        suggestionId: world.suggestionId,
      })
      expect(accepted.trips).toHaveLength(2)
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

/**
 * Spec 153 T801 (N1): o conjunto de notas vivas sozinho não identifica a composição anterior — a
 * frota pode mudar entre tentativas, e a viagem pode já ter sido despachada. Contra Postgres porque
 * é o `join`/filtro em `trips` que está sob teste, não o contrato de aplicação.
 */
describe('findLiveTripIdForDocuments filtra por veículo e status (spec 153 T801)', () => {
  testWithPostgres('mesmo conjunto de notas em veículo diferente não reaproveita', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedSuggestion(database)
      const tripRepository = new DrizzleTripRepository(database.db)
      const tripUseCase = createTripUseCase({
        locations: { purgeByTrip: async () => {} },
        repository: tripRepository,
      })
      const firstVehicleId = world.vehicles[0]?.vehicleId ?? ''
      const secondVehicleId = world.vehicles[1]?.vehicleId ?? ''

      const created = await tripUseCase.create({
        context: world.context,
        driverIds: [],
        vehicleId: firstVehicleId,
      })
      for (const nfeDocumentId of world.documentIds) {
        await tripUseCase.linkDocument({
          context: world.context,
          freightCalculationId: null,
          nfeDocumentId,
          tripId: created.id,
        })
      }

      /** T708 não regride: o mesmo veículo continua reaproveitando a viagem. */
      const reusedSameVehicle = await tripRepository.findLiveTripIdForDocuments({
        companyId: world.companyId,
        driverId: null,
        nfeDocumentIds: world.documentIds,
        vehicleId: firstVehicleId,
      })
      expect(reusedSameVehicle).toBe(created.id)

      /** A frota mudou entre tentativas: o mesmo conjunto de notas, veículo diferente, não reaproveita. */
      const reusedOtherVehicle = await tripRepository.findLiveTripIdForDocuments({
        companyId: world.companyId,
        driverId: null,
        nfeDocumentIds: world.documentIds,
        vehicleId: secondVehicleId,
      })
      expect(reusedOtherVehicle).toBeNull()
    })
  })

  testWithPostgres('viagem já despachada não é reaproveitada', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedSuggestion(database)
      const tripRepository = new DrizzleTripRepository(database.db)
      const tripUseCase = createTripUseCase({
        locations: { purgeByTrip: async () => {} },
        repository: tripRepository,
      })
      const vehicleId = world.vehicles[0]?.vehicleId ?? ''

      const created = await tripUseCase.create({
        context: world.context,
        driverIds: [],
        vehicleId,
      })
      for (const nfeDocumentId of world.documentIds) {
        await tripUseCase.linkDocument({
          context: world.context,
          freightCalculationId: null,
          nfeDocumentId,
          tripId: created.id,
        })
      }

      await database.db
        .update(trips)
        .set({ status: 'dispatched' })
        .where(and(eq(trips.companyId, world.companyId), eq(trips.id, created.id)))

      const reused = await tripRepository.findLiveTripIdForDocuments({
        companyId: world.companyId,
        driverId: null,
        nfeDocumentIds: world.documentIds,
        vehicleId,
      })
      expect(reused).toBeNull()
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

function buildUseCase(database: TestDatabase, options: { readonly freezesEta?: boolean } = {}) {
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
    logger: { error: () => {} },
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
      /** Spec 153 T708 (H4): a integração exercita o mesmo caminho de reaproveitamento da produção. */
      findLiveTripIdForDocuments: (input) => tripRepository.findLiveTripIdForDocuments(input),
      link: (input) => tripUseCase.linkDocument(input),
      listStops: async (input) =>
        (await listTripStops({ ...input, repository: stopRepository })).stops,
      /**
       * Spec 107 D3: a integração não confere ETA por padrão; o contrato de unidade faz isso.
       * Spec 149 T6: quem prova o congelamento da jornada contra Postgres pede o repositório real
       * (`freezesEta: true`) — sem ele `trips.planned_journey_seconds` nunca sairia de `null`.
       */
      writeEstimatedArrivals:
        options.freezesEta === true
          ? (input) =>
              routeRepository.writeEstimatedArrivals({
                arrivals: input.arrivals,
                companyId: input.context.companyId,
                plannedDepartureAt: input.plannedDepartureAt,
                returnLegSeconds: input.returnLegSeconds ?? null,
                tripId: input.tripId,
              })
          : async () => undefined,
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
  readonly vehicles: readonly { readonly driverId?: string; readonly vehicleId: string }[]
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

async function withSharedDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (shared === undefined) throw new Error('A PostgreSQL test URL is required')
  await operation(shared.database)
}

/**
 * Spec 112: **mover parada contra o banco.** O contrato de aplicação prova a regra com um
 * repositório de mentira, que devolve o mapeamento nota→parada que o teste escreveu. Só o Postgres
 * prova que `readGroups` o devolve de verdade — a junção a `route_suggestion_stop_documents` que o
 * agrupamento jogava fora.
 */
describe('mover parada entre caminhões no aceite, contra Postgres (spec 112)', () => {
  testWithPostgres(
    'a parada vai com as duas notas dela, e o caminhão vazio não vira viagem',
    async () => {
      await withSharedDatabase(async (database) => {
        const world = await seedSuggestion(database)
        const useCase = buildUseCase(database)
        const destination = world.vehicles[1]?.vehicleId ?? ''

        const accepted = await useCase.accept({
          context: world.context,
          stopOrderByVehicle: [
            { orderedAddressKeys: [SECOND_ADDRESS_KEY, FIRST_ADDRESS_KEY], vehicleId: destination },
          ],
          suggestionId: world.suggestionId,
        })

        /** O primeiro caminhão perdeu a única parada que tinha: não há viagem vazia para ele. */
        expect(accepted.trips.map((trip) => trip.vehicleId)).toEqual([destination])
        const [trip] = accepted.trips
        expect(trip?.documentCount).toBe(3)
        expect(trip?.stopCount).toBe(2)

        const linked = await database.db
          .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
          .from(tripDocuments)
          .where(
            and(
              eq(tripDocuments.companyId, world.companyId),
              eq(tripDocuments.tripId, trip?.tripId ?? ''),
            ),
          )
        /** As duas notas da parada que mudou de caminhão foram junto — e a nota de sempre ficou. */
        expect(linked.map((row) => row.nfeDocumentId).sort()).toEqual([...world.documentIds].sort())
      })
    },
  )
})

/**
 * Spec 149 T5 (ADR-0065 D12): o aceite leva a tripulação **completa** — motorista e ajudantes — para
 * `trip_drivers`, não só o motorista. O contrato de aplicação prova o encadeamento com dublês; só o
 * Postgres prova que `readGroups` traz os ajudantes gravados em `route_suggestion_vehicle_helpers` e
 * que `resolveTripCrewForCreation` os grava de volta com o papel certo.
 */
describe('aceite com motorista e ajudantes contra Postgres (spec 149 T5)', () => {
  testWithPostgres(
    'a viagem nasce com 3 linhas em trip_drivers: 1 motorista e 2 ajudantes',
    async () => {
      await withSharedDatabase(async (database) => {
        const world = await seedSuggestionWithCrew(database)
        const useCase = buildUseCase(database)

        const accepted = await useCase.accept({
          context: world.context,
          suggestionId: world.suggestionId,
        })

        expect(accepted.trips).toHaveLength(1)
        const tripId = accepted.trips[0]?.tripId ?? ''

        const crew = await database.db
          .select({ position: tripDrivers.position, role: tripDrivers.role })
          .from(tripDrivers)
          .where(and(eq(tripDrivers.companyId, world.companyId), eq(tripDrivers.tripId, tripId)))
          .orderBy(tripDrivers.position)

        expect(crew).toHaveLength(3)
        expect(crew.map((row) => row.role)).toEqual(['driver', 'helper', 'helper'])
        expect(crew.map((row) => Number(row.position))).toEqual([1, 2, 3])
      })
    },
  )
})

/**
 * Spec 149 T6 (decisão do usuário, 15/09/2026): a viagem congela a jornada no mesmo instante do
 * ETA — ida + volta quando a proposta grava a volta, só ida quando não grava.
 */
describe('a jornada congela junto do ETA (spec 149 T6)', () => {
  testWithPostgres('com volta gravada, grava ida + volta e includesReturn = true', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedSuggestionWithCrew(database, { journey: 'with-return' })
      const useCase = buildUseCase(database, { freezesEta: true })

      const accepted = await useCase.accept({
        context: world.context,
        suggestionId: world.suggestionId,
      })
      const tripId = accepted.trips[0]?.tripId ?? ''

      const [trip] = await database.db
        .select({
          plannedJourneyIncludesReturn: trips.plannedJourneyIncludesReturn,
          plannedJourneySeconds: trips.plannedJourneySeconds,
        })
        .from(trips)
        .where(and(eq(trips.companyId, world.companyId), eq(trips.id, tripId)))

      /** 09:00 de ida (08h → 17h) + 00:30 de volta gravada = 09:30. */
      expect(trip?.plannedJourneySeconds).toBe(9 * 3600 + 1_800)
      expect(trip?.plannedJourneyIncludesReturn).toBe(true)
    })
  })

  testWithPostgres('sem volta gravada, grava só a ida e includesReturn = false', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedSuggestionWithCrew(database, { journey: 'without-return' })
      const useCase = buildUseCase(database, { freezesEta: true })

      const accepted = await useCase.accept({
        context: world.context,
        suggestionId: world.suggestionId,
      })
      const tripId = accepted.trips[0]?.tripId ?? ''

      const [trip] = await database.db
        .select({
          plannedJourneyIncludesReturn: trips.plannedJourneyIncludesReturn,
          plannedJourneySeconds: trips.plannedJourneySeconds,
        })
        .from(trips)
        .where(and(eq(trips.companyId, world.companyId), eq(trips.id, tripId)))

      expect(trip?.plannedJourneySeconds).toBe(9 * 3600)
      expect(trip?.plannedJourneyIncludesReturn).toBe(false)
    })
  })

  testWithPostgres('sem saída planejada nem ETA, a jornada fica nula nos dois campos', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedSuggestionWithCrew(database, { journey: 'none' })
      const useCase = buildUseCase(database, { freezesEta: true })

      const accepted = await useCase.accept({
        context: world.context,
        suggestionId: world.suggestionId,
      })
      const tripId = accepted.trips[0]?.tripId ?? ''

      const [trip] = await database.db
        .select({
          plannedJourneyIncludesReturn: trips.plannedJourneyIncludesReturn,
          plannedJourneySeconds: trips.plannedJourneySeconds,
        })
        .from(trips)
        .where(and(eq(trips.companyId, world.companyId), eq(trips.id, tripId)))

      expect(trip?.plannedJourneySeconds).toBeNull()
      expect(trip?.plannedJourneyIncludesReturn).toBeNull()
    })
  })
})

/**
 * Um veículo só, um motorista e dois ajudantes — o mínimo que prova o critério de aceite 3 da spec.
 *
 * `journey`: spec 149 T6 — `'none'` (padrão) não grava saída/ETA/volta, `'with-return'` grava as
 * três (a jornada congela ida + volta), `'without-return'` grava saída/ETA sem a perna de volta (a
 * jornada congela só de ida).
 */
async function seedSuggestionWithCrew(
  database: TestDatabase,
  options: { readonly journey?: 'none' | 'with-return' | 'without-return' } = {},
): Promise<World> {
  const journey = options.journey ?? 'none'
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const firstHelperId = crypto.randomUUID()
  const secondHelperId = crypto.randomUUID()
  const suggestionId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E49',
    role: 'traction',
    state: 'SP',
    vehicleType: 'toco',
  })
  await database.db.insert(fleetDrivers).values([
    { companyId, id: driverId, membershipId: null, name: 'Motorista', taxId: '11111111111' },
    {
      canActAsHelper: true,
      companyId,
      id: firstHelperId,
      membershipId: null,
      name: 'Ajudante Um',
      taxId: '22222222222',
    },
    {
      canActAsHelper: true,
      companyId,
      id: secondHelperId,
      membershipId: null,
      name: 'Ajudante Dois',
      taxId: '33333333333',
    },
  ])
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-p2-crew',
    id: importId,
    idempotencyKey: 'p2-crew',
    requestFingerprint: 'fingerprint-p2-crew',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'nfe/p2-crew-900001.xml',
    provider: 's3',
    purpose: 'nfe_document',
    sha256: '4'.repeat(64),
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `8${'1'.repeat(43)}`,
    authorizationProtocol: 'protocol-900001-crew',
    companyId,
    createdByUserId: userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-08-10T06:00:00.000Z'),
    model: '55',
    number: '900001',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: '4'.repeat(64),
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
    number: '100',
    participantId,
    postalCode: '14020000',
    state: 'SP',
    street: 'Rua Um',
  })

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
    /** Spec 149 T6: a âncora do congelamento — `null` fora de `'none'`. */
    plannedDepartureAt: journey === 'none' ? null : new Date('2026-08-10T08:00:00.000Z'),
    seed: 7,
    status: 'ready',
    tripId: null,
  })
  await database.db
    .insert(routeSuggestionDocuments)
    .values({ companyId, nfeDocumentId: documentId, suggestionId })
  await database.db.insert(routeSuggestionVehicles).values({
    companyId,
    driverId,
    driverSource: 'manual',
    position: 0n,
    /** Spec 149 T6: a perna de volta ao barracão, só quando o cenário a grava. */
    returnDistanceMeters: journey === 'with-return' ? 12_000 : null,
    returnDurationSeconds: journey === 'with-return' ? 1_800 : null,
    suggestionId,
    vehicleId,
  })
  await database.db.insert(routeSuggestionVehicleHelpers).values([
    { companyId, driverId: firstHelperId, suggestionId, vehicleId },
    { companyId, driverId: secondHelperId, suggestionId, vehicleId },
  ])
  const [stop] = await database.db
    .insert(routeSuggestionStops)
    .values({
      addressKey: FIRST_ADDRESS_KEY,
      companyId,
      estimatedArrivalAt: journey === 'none' ? null : new Date('2026-08-10T17:00:00.000Z'),
      excludedFromOptimization: false,
      label: 'Rua Um',
      sequence: 1n,
      suggestionId,
      vehicleId,
      weightEstimated: true,
    })
    .returning({ id: routeSuggestionStops.id })
  await database.db
    .insert(routeSuggestionStopDocuments)
    .values({ companyId, nfeDocumentId: documentId, suggestionStopId: stop?.id ?? '' })

  return {
    companyId,
    context: { companyId, membershipId, userId } as unknown as MultiVehicleScope,
    documentIds: [documentId],
    suggestionId,
    vehicles: [{ driverId, vehicleId }],
  }
}
