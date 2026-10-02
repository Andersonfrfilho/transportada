/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 T2.2 — **a soma das notas fecha com a viagem, contra Postgres.** Viagem de verdade com
 * rota congelada (barracão de ida e volta), três paradas, cinco notas e eventos de chegada e saída:
 * `Σ (costAmount + taxAmount)`, `Σ amount` e `Σ marginAmount` conferidos contra o que a própria
 * avaliação devolve, e a espera lida do banco (D9) provada por contraste com a mesma viagem sem eventos.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  companyFuelPrices,
  companyTaxSettings,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripCostEntries } from '../../src/database/trip-financial.schema.js'
import {
  tripDocuments,
  tripDrivers,
  tripStopEvents,
  tripStops,
  trips,
  type TripStopEventKind,
} from '../../src/database/trip.schema.js'
import {
  readTripValuation,
  type ApplicableFreightRule,
} from '../../src/trips/application/read-trip-valuation.use-case.js'
import { COST_BASES, TIME_BASES } from '../../src/trips/domain/document-cost-apportionment.types.js'
import type { TripValuation } from '../../src/trips/domain/trip-valuation.policy.js'
import { clearPlannedRoute } from '../../src/trips/infrastructure/trip-planned-route-clear.support.js'
import { DrizzleTripValuationQuery } from '../../src/trips/infrastructure/trip-valuation.query.js'

const SILENT_LOGGER = { error: () => undefined, info: () => undefined, warn: () => undefined }

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

type World = {
  readonly companyId: string
  readonly driverId: string
  readonly importId: string
  readonly userId: string
  readonly vehicleId: string
  readonly xmlObjectId: string
}

const MINUTE = 60_000
const FIFTY_KILOMETRES = 50_000
const ONE_HOUR = 3_600
const SHA = '1'.repeat(64)
let documentSequence = 0
const FIRST_STOP_ARRIVAL = new Date('2026-10-02T10:00:00.000Z')

const TEN_PERCENT_RULE: ApplicableFreightRule = {
  freightRuleId: '00000000-0000-4000-8000-000000000b01',
  freightRuleName: 'Regra de teste',
  freightRuleVersionId: '00000000-0000-4000-8000-000000000b02',
  maximumAmount: '',
  minimumAmount: '',
  percentage: '0.100000',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '',
  version: '1',
}

/** Saída do barracão, três trechos até as paradas e o retorno: 5 trechos para 3 paradas. */
const ROUTE_WITH_DEPOT = {
  choiceReproduced: true,
  criterion: 'cheapest',
  depot: { leadingLegs: 1, trailingLegs: 1 },
  isNoToll: false,
  legs: Array.from({ length: 4 }, () => ({
    distanceMetres: FIFTY_KILOMETRES,
    durationSeconds: ONE_HOUR,
  })),
  points: [],
  signature: 'integration-232',
}

describe('a soma das notas fecha com a viagem (spec 232 D4, CA01)', () => {
  testWithPostgres(
    'Σ (costAmount + taxAmount) é o totalCost, Σ amount o totalRevenue e Σ marginAmount o totalMargin',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const tripId = await seedTrip(database, { documentsPerStop: [2, 2, 1], world })

        const valuation = await valuate(database, world.companyId, tripId)

        expectSumsToClose(valuation)
        expect(valuation.revenueLines).toHaveLength(5)
        for (const line of valuation.revenueLines) {
          expect(line.costBasis).toBe(COST_BASES.leg)
        }
      })
    },
  )

  testWithPostgres(
    'o cenário tem imposto, avulso e retorno: senão a conta acima não provaria nada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const tripId = await seedTrip(database, { documentsPerStop: [2, 2, 1], world })

        const valuation = await valuate(database, world.companyId, tripId)

        const taxTotal = sumScaled(
          valuation.costParcels
            .filter((parcel) => parcel.kind === 'pis_cofins')
            .map((parcel) => parcel.amount),
        )
        expect(taxTotal).toBeGreaterThan(0n)
        expect(sumScaled(valuation.revenueLines.map((line) => line.taxAmount))).toBe(taxTotal)
        for (const line of valuation.revenueLines) {
          expect(toScaled(line.tripShareCostAmount)).toBeGreaterThan(0n)
        }
      })
    },
  )

  testWithPostgres(
    'a espera vem dos eventos do banco (D9): sem eles o tempo fica incompleto e o gasto muda',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const tripId = await seedTrip(database, { documentsPerStop: [2, 2, 1], world })

        const withEvents = await valuate(database, world.companyId, tripId)
        // Viagem completa e semeada: tem `departed` para toda parada que tem uma seguinte. A última não
        // tem saída possível depois dela e não rebaixa o tempo (revisão da 232, M2) — esta asserção
        // dizia `partial` e só passava por causa dela.
        expect(new Set(withEvents.revenueLines.map((line) => line.timeBasis))).toEqual(
          new Set([TIME_BASES.complete]),
        )

        await database.db
          .delete(tripStopEvents)
          .where(eq(tripStopEvents.companyId, world.companyId))
        const withoutEvents = await valuate(database, world.companyId, tripId)

        expect(new Set(withoutEvents.revenueLines.map((line) => line.timeBasis))).toEqual(
          new Set([TIME_BASES.incomplete]),
        )
        expectSumsToClose(withoutEvents)
        expect(withoutEvents.revenueLines.map((line) => line.legCostAmount)).not.toEqual(
          withEvents.revenueLines.map((line) => line.legCostAmount),
        )
      })
    },
  )

  testWithPostgres('sem roteiro congelado nenhuma nota inventa gasto (D5, CA04)', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const tripId = await seedTrip(database, { documentsPerStop: [2, 2, 1], world })
      await clearPlannedRoute(database.db, { companyId: world.companyId, tripId })

      const valuation = await valuate(database, world.companyId, tripId)

      for (const line of valuation.revenueLines) {
        expect(line.costBasis).toBe(COST_BASES.unavailable)
        expect(line.costAmount).toBeNull()
        expect(line.marginAmount).toBeNull()
      }
    })
  })

  /**
   * Revisão da 232, M4. A espera na parada é refinamento: os totais da viagem não dependem dela, e a
   * mesma leitura alimenta o recálculo do resultado congelado. Falha aqui não pode virar 500 na
   * avaliação — e o que vai para o log é o nome do erro, nunca a mensagem, que o Postgres enche com a linha.
   */
  testWithPostgres(
    'falha na leitura da espera não derruba a avaliação nem vaza no log',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const tripId = await seedTrip(database, { documentsPerStop: [2, 2, 1], world })
        const healthy = await valuate(database, world.companyId, tripId)

        const warnings: { readonly message: string; readonly metadata: unknown }[] = []
        const query = new DrizzleTripValuationQuery(database.db, {
          ...SILENT_LOGGER,
          warn: (message: string, metadata?: Record<string, unknown>) => {
            warnings.push({ message, metadata })
          },
        })
        Reflect.set(query, 'readStopDwells', () =>
          Promise.reject(new Error('conexão caiu perto de -23.5505199,-46.6333094')),
        )

        const valuation = await readTripValuation({
          companyId: world.companyId,
          repository: {
            findApplicableRule: () => Promise.resolve(TEN_PERCENT_RULE),
            readContext: (input) => query.readContext(input),
          },
          tripId,
        })

        expect(valuation.totalCost).toBe(healthy.totalCost)
        expect(valuation.totalRevenue).toBe(healthy.totalRevenue)
        expect(valuation.revenueLines.length).toBe(healthy.revenueLines.length)
        for (const line of valuation.revenueLines) {
          expect(line.costBasis).toBe(COST_BASES.unavailable)
        }
        expect(warnings.map((entry) => entry.message)).toEqual([
          'trip.valuation.stop_dwells_unavailable',
        ])
        expect(JSON.stringify(warnings)).not.toContain('-23.5505199')
      })
    },
  )

  testWithPostgres(
    'não há N+1: o número de consultas não cresce com paradas nem com notas',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const small = await seedTrip(database, { documentsPerStop: [1], world })
        const large = await seedTrip(database, { documentsPerStop: [2, 2, 1], world })

        const smallQueries = await countSelects(database, world.companyId, small)
        const largeQueries = await countSelects(database, world.companyId, large)

        expect(smallQueries).toBeGreaterThan(0)
        expect(largeQueries).toBe(smallQueries)
      })
    },
  )
})

function expectSumsToClose(valuation: TripValuation): void {
  const lines = valuation.revenueLines
  const operatingPlusTax =
    sumScaled(lines.map((line) => line.costAmount)) + sumScaled(lines.map((line) => line.taxAmount))

  expect(operatingPlusTax).toBe(toScaled(valuation.totalCost))
  expect(sumScaled(lines.map((line) => line.amount))).toBe(toScaled(valuation.totalRevenue))
  expect(sumScaled(lines.map((line) => line.marginAmount))).toBe(toScaled(valuation.totalMargin))
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

/** Conta cada `select` do Drizzle que `readContext` dispara — o que o N+1 multiplicaria. */
async function countSelects(
  database: TestDatabase,
  companyId: string,
  tripId: string,
): Promise<number> {
  let selects = 0
  const counting = new Proxy(database.db, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target)
      if (property === 'select') selects += 1
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

  await new DrizzleTripValuationQuery(counting, SILENT_LOGGER).readContext({ companyId, tripId })

  return selects
}

function toScaled(value: null | string | undefined): bigint {
  if (value === null || value === undefined) throw new Error('campo de dinheiro ausente')
  const [integer = '0', fraction = ''] = value.split('.')
  const digits = BigInt(`${integer.replace('-', '')}${`${fraction}0000`.slice(0, 4)}`)
  return integer.startsWith('-') ? -digits : digits
}

function sumScaled(values: readonly (null | string | undefined)[]): bigint {
  return values.reduce<bigint>((total, value) => total + toScaled(value), 0n)
}

/** A empresa e tudo que as viagens dela compartilham: veículo, motorista, regime e uma NF-e de base. */
async function seedWorld(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
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
  await database.db.insert(fleetVehicles).values({
    averageConsumption: '2.5000',
    companyId,
    fuelType: 'diesel-s10',
    id: vehicleId,
    otherCostsPerKilometer: '0.3000',
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'toco',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    dailyAllowanceAmount: '350.0000',
    id: driverId,
    name: 'Agregado',
    paymentModel: 'route_table',
    taxId: '11111111111',
  })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'nfe/figures.xml',
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-figures',
    id: importId,
    idempotencyKey: 'figures',
    requestFingerprint: 'fingerprint-figures',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })

  return { companyId, driverId, importId, userId, vehicleId, xmlObjectId }
}

/**
 * Uma viagem com rota congelada: `documentsPerStop[i]` notas descem na parada `i`. A segunda parada
 * espera 30 min e a terceira 5 (só `delivered`, sem saída para a seguinte: espera parcial).
 */
async function seedTrip(
  database: TestDatabase,
  input: { readonly documentsPerStop: readonly number[]; readonly world: World },
): Promise<string> {
  const { world } = input
  const tripId = crypto.randomUUID()
  const stopCount = input.documentsPerStop.length

  await database.db.insert(trips).values({
    companyId: world.companyId,
    dailyAllowanceDays: 2,
    id: tripId,
    plannedDistanceMeters: FIFTY_KILOMETRES * (stopCount + 1),
    plannedDurationSeconds: ONE_HOUR * (stopCount + 1),
    plannedReturnDistanceMeters: FIFTY_KILOMETRES,
    plannedRoute: {
      ...ROUTE_WITH_DEPOT,
      legs: ROUTE_WITH_DEPOT.legs.slice(0, stopCount + 1),
    },
    plannedRouteFrozenAt: new Date('2026-10-02T06:00:00.000Z'),
    vehicleId: world.vehicleId,
  })
  await database.db.insert(tripDrivers).values({
    companyId: world.companyId,
    driverId: world.driverId,
    driverName: 'Agregado',
    driverTaxId: '11111111111',
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

  const stopIds = await seedStops(database, { stopCount, tripId, world })
  await seedDocuments(database, {
    documentsPerStop: input.documentsPerStop,
    stopIds,
    tripId,
    world,
  })
  await seedStopEvents(database, { stopIds, world })

  return tripId
}

async function seedStops(
  database: TestDatabase,
  input: { readonly stopCount: number; readonly tripId: string; readonly world: World },
): Promise<readonly string[]> {
  const stopIds = Array.from({ length: input.stopCount }, () => crypto.randomUUID())
  await database.db.insert(tripStops).values(
    stopIds.map((id, index) => ({
      addressKey: `${input.tripId}|${index}`,
      companyId: input.world.companyId,
      id,
      label: `Parada ${index + 1}`,
      sequence: BigInt(index + 1),
      tripId: input.tripId,
    })),
  )

  return stopIds
}

async function seedDocuments(
  database: TestDatabase,
  input: {
    readonly documentsPerStop: readonly number[]
    readonly stopIds: readonly string[]
    readonly tripId: string
    readonly world: World
  },
): Promise<void> {
  const { world } = input
  const stopForDocument = input.documentsPerStop.flatMap((count, stopIndex) =>
    Array.from({ length: count }, () => input.stopIds[stopIndex] as string),
  )

  for (const [index, stopId] of stopForDocument.entries()) {
    const nfeDocumentId = crypto.randomUUID()
    documentSequence += 1
    await database.db.insert(nfeDocuments).values({
      accessKey: `7${String(documentSequence).padStart(43, '0')}`,
      authorizationProtocol: `protocol-${documentSequence}`,
      companyId: world.companyId,
      createdByUserId: world.userId,
      freightValue: '0.0000',
      id: nfeDocumentId,
      importId: world.importId,
      issuedAt: new Date('2026-09-30T06:00:00.000Z'),
      model: '55',
      number: String(700_000 + documentSequence),
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '10000.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: `${(index + 1) * 2000}.0000`,
      xmlObjectId: world.xmlObjectId,
      xmlSha256: SHA,
    })
    await database.db.insert(tripDocuments).values({
      companyId: world.companyId,
      nfeDocumentId,
      stopId,
      tripId: input.tripId,
    })
  }
}

/** Parada 1 → saída para a 2 aos +30 min; a 2 espera 15 min; a 3 só entrega, 5 min depois de chegar. */
async function seedStopEvents(
  database: TestDatabase,
  input: { readonly stopIds: readonly string[]; readonly world: World },
): Promise<void> {
  const [first, second, third] = input.stopIds
  if (first === undefined) return
  const event = (kind: TripStopEventKind, stopId: string, minutes: number) => ({
    createdAt: new Date(FIRST_STOP_ARRIVAL.getTime() + minutes * MINUTE),
    kind,
    stopId,
  })
  const events = [
    event('arrived', first, 0),
    ...(second === undefined ? [] : [event('departed', second, 30), event('arrived', second, 75)]),
    ...(third === undefined
      ? []
      : [
          event('departed', third, 90),
          event('arrived', third, 150),
          event('delivered', third, 155),
        ]),
  ]

  await database.db.insert(tripStopEvents).values(
    events.map((event) => ({
      actorUserId: input.world.userId,
      companyId: input.world.companyId,
      createdAt: event.createdAt,
      kind: event.kind,
      stopId: event.stopId,
    })),
  )
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_232_${crypto.randomUUID().replaceAll('-', '')}`
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
