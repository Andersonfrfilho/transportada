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
  TEN_PERCENT_RULE,
  seedTrip,
  seedTrips,
  seedWorld,
  type TestDatabase,
  type World,
} from '../fixtures/trip-list-world.fixture.js'
import { readTripListFinancials } from '../../src/trips/application/read-trip-list-financials.use-case.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import { readTripRevenueTotals } from '../../src/trips/application/read-trip-revenue-totals.use-case.js'
import {
  readTripValuation,
  type TripValuationContext,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { readTripListOccupancies } from '../../src/trips/infrastructure/trip-list-occupancy.query.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { DrizzleTripValuationQuery } from '../../src/trips/infrastructure/trip-valuation.query.js'

const SILENT_LOGGER = { error: () => undefined, info: () => undefined, warn: () => undefined }

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('a linha da lista diz o mesmo que o detalhe (spec 259, T1.2/T2.2/T2.3)', () => {
  testWithPostgres(
    'custo e margem da lista são os do detalhe, viagem a viagem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const seeded = await seedTrips(database, world)
        const tripIds = Object.values(seeded)

        const items = await listAsOfficeWithFinancials(database, world)

        expect(items.map((item) => item.id).sort()).toEqual([...tripIds].sort())
        for (const tripId of tripIds) {
          const item = fieldsOf(items.find((candidate) => candidate.id === tripId))
          const valuation = await valuate(database, world.companyId, tripId)

          expect(fieldsOf(item.amounts)).toMatchObject({
            costTotal: valuation.totalCost,
            hasGaps: valuation.hasGaps,
            marginPercentage: valuation.marginPercentage,
            marginTotal: valuation.totalMargin,
            revenueTotal: valuation.totalRevenue,
          })
        }
      })
    },
    60_000,
  )

  testWithPostgres(
    'ocupação e peso da lista são os do detalhe, viagem a viagem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const seeded = await seedTrips(database, world)
        const tripIds = Object.values(seeded)

        const items = await listAsOfficeWithFinancials(database, world)
        const repository = new DrizzleTripRepository(database.db)

        for (const tripId of tripIds) {
          const item = fieldsOf(items.find((candidate) => candidate.id === tripId))
          const detail = await repository.findById({ companyId: world.companyId, tripId })

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
        const withTrailer = await repository.findById({
          companyId: world.companyId,
          tripId: seeded.trailerTripId,
        })

        /** Spec 147: quem carrega é a carreta — a capacidade e o teto de peso são os dela, não os do cavalo. */
        expect(withTrailer?.occupancy?.capacityM3).toBe('30.000000')
        expect(withTrailer?.cargoWeight?.maxPayloadKg).toBe('5000.0000')
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

describe('o contexto de valoração em lote espelha o da viagem (spec 259, T2.1)', () => {
  testWithPostgres(
    'devolve, por viagem, o mesmo contexto de readContext',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const seeded = await seedTrips(database, world)
        const tripIds = Object.values(seeded)
        const query = new DrizzleTripValuationQuery(database.db, SILENT_LOGGER)

        const batch = await query.readValuationContexts({ companyId: world.companyId, tripIds })

        expect([...batch.keys()].sort()).toEqual([...tripIds].sort())
        for (const tripId of tripIds) {
          const single = await query.readContext({ companyId: world.companyId, tripId })
          expect(inStableOrder(batch.get(tripId))).toEqual(inStableOrder(single))
        }
      })
    },
    60_000,
  )

  testWithPostgres(
    'faz o mesmo número de consultas para 1 viagem e para 20',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const tripIds: string[] = []
        for (let index = 0; index < 20; index += 1) {
          tripIds.push(
            await seedTrip(database, {
              documentWeights: ['120.000', null],
              vehicleId: world.capableVehicleId,
              world,
            }),
          )
        }

        const one = await countSelects(database, (query) =>
          query.readValuationContexts({ companyId: world.companyId, tripIds: tripIds.slice(0, 1) }),
        )
        const twenty = await countSelects(database, (query) =>
          query.readValuationContexts({ companyId: world.companyId, tripIds }),
        )

        expect(one).toBeGreaterThan(0)
        expect(twenty).toBe(one)
      })
    },
    120_000,
  )

  testWithPostgres(
    'não alcança a viagem de outra empresa nem pelo id',
    async () => {
      await withDisposableDatabase(async (database) => {
        const mine = await seedWorld(database)
        const theirs = await seedWorld(database)
        const myTripId = await seedTrip(database, {
          documentWeights: ['120.000'],
          vehicleId: mine.capableVehicleId,
          world: mine,
        })
        const theirTripId = await seedTrip(database, {
          documentWeights: ['120.000'],
          vehicleId: theirs.capableVehicleId,
          world: theirs,
        })
        const query = new DrizzleTripValuationQuery(database.db, SILENT_LOGGER)

        const contexts = await query.readValuationContexts({
          companyId: mine.companyId,
          tripIds: [myTripId, theirTripId],
        })

        expect([...contexts.keys()]).toEqual([myTripId])
        expect(contexts.get(myTripId)?.documents).toHaveLength(1)
      })
    },
    60_000,
  )
})

/** Conta cada `select` que a leitura dispara — o que o N+1 multiplicaria. */
async function countSelects(
  database: TestDatabase,
  read: (query: DrizzleTripValuationQuery) => Promise<unknown>,
): Promise<number> {
  let selects = 0
  const counting = new Proxy(database.db, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target)
      if (property === 'select') selects += 1
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

  await read(new DrizzleTripValuationQuery(counting, SILENT_LOGGER))

  return selects
}

/** As notas não têm `order by`: a comparação ignora a ordem em que o Postgres as devolveu. */
function inStableOrder(context: TripValuationContext | null | undefined) {
  if (context === null || context === undefined) throw new Error('contexto ausente')

  return {
    ...context,
    documents: [...context.documents].sort((left, right) =>
      left.tripDocumentId.localeCompare(right.tripDocumentId),
    ),
  }
}

describe('a ocupação em lote não cresce com a página e não cruza empresas (spec 259, T2.3)', () => {
  testWithPostgres(
    'faz o mesmo número de consultas para 1 viagem e para 20',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const tripIds: string[] = []
        for (let index = 0; index < 20; index += 1) {
          tripIds.push(
            await seedTrip(database, {
              documentWeights: ['120.000', null],
              vehicleId: world.capableVehicleId,
              world,
            }),
          )
        }

        const one = await countSelectsOf(database, (counting) =>
          readTripListOccupancies(counting, {
            companyId: world.companyId,
            tripIds: tripIds.slice(0, 1),
          }),
        )
        const twenty = await countSelectsOf(database, (counting) =>
          readTripListOccupancies(counting, { companyId: world.companyId, tripIds }),
        )

        expect(one).toBeGreaterThan(0)
        expect(twenty).toBe(one)
      })
    },
    120_000,
  )

  testWithPostgres(
    'viagem de outra empresa não entra no mapa, nem pelo id',
    async () => {
      await withDisposableDatabase(async (database) => {
        const mine = await seedWorld(database)
        const theirs = await seedWorld(database)
        const myTripId = await seedTrip(database, {
          documentWeights: ['120.000'],
          vehicleId: mine.capableVehicleId,
          world: mine,
        })
        const theirTripId = await seedTrip(database, {
          documentWeights: ['120.000'],
          vehicleId: theirs.capableVehicleId,
          world: theirs,
        })

        const occupancies = await readTripListOccupancies(database.db, {
          companyId: mine.companyId,
          tripIds: [myTripId, theirTripId],
        })

        expect([...occupancies.keys()]).toEqual([myTripId])
      })
    },
    60_000,
  )

  testWithPostgres(
    'viagem sem veículo é null, não um objeto vazio',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const tripId = await seedTrip(database, {
          documentWeights: ['80.000'],
          vehicleId: null,
          world,
        })

        const occupancies = await readTripListOccupancies(database.db, {
          companyId: world.companyId,
          tripIds: [tripId],
        })

        expect(occupancies.get(tripId)).toBeNull()
        expect(occupancies.has(tripId)).toBe(true)
      })
    },
    60_000,
  )
})

/** Conta cada `select` que a leitura em lote dispara, num queryable que repassa tudo ao banco real. */
async function countSelectsOf(
  database: TestDatabase,
  read: (counting: TestDatabase['db']) => Promise<unknown>,
): Promise<number> {
  let selects = 0
  const counting = new Proxy(database.db, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target)
      if (property === 'select') selects += 1
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

  await read(counting)

  return selects
}

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
    financials: {
      read: (input) =>
        readTripListFinancials({
          ...input,
          repository: {
            findApplicableRule: () => Promise.resolve(TEN_PERCENT_RULE),
            readValuationContexts: (query) =>
              new DrizzleTripValuationQuery(database.db, SILENT_LOGGER).readValuationContexts(
                query,
              ),
          },
        }),
    },
    locations: { purgeByTrip: () => Promise.resolve() },
    occupancies: { read: (input) => readTripListOccupancies(database.db, input) },
    repository: new DrizzleTripRepository(database.db),
  })
  const page = await useCase.list({
    context: { companyId: world.companyId, userId: world.userId },
    cursor: null,
    includeFinancials: true,
    limit: 20,
  })

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
