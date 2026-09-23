/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  identityUsers,
  nfeDocuments,
  nfeImports,
  nfePackageBoxes,
  nfeParticipants,
  nfeProducts,
  storedObjects,
  tripCargoLayouts,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../src/database/trip.schema.js'
import { DrizzlePackageBoxRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const STOP_COUNT = 40
const DOCUMENTS_PER_STOP = 5

/**
 * spec 056 T014, §15 do code-standart.md: `GET /trips/:id` com 200 notas em 40 paradas não pode
 * variar o número de queries com o tamanho da viagem. `readTripDetail` busca a viagem, os
 * motoristas, os documentos (já com join de fiscalStatus/cteAuthorized) e as paradas em quatro
 * `select`s fixos, agrupando em memória — nunca uma query por parada ou por documento. O teste
 * prova isso contando `select`s reais contra o Postgres com uma viagem de 1 parada/1 nota e outra
 * de 40 paradas/200 notas, e exigindo a mesma contagem nas duas.
 */
describe('trip detail read has no N+1 across stops (spec 056 T014)', () => {
  testWithPostgres(
    'issues the same number of selects for 1 stop as for 40 stops with 200 documents',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const userId = crypto.randomUUID()
        const vehicleId = crypto.randomUUID()

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
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

        const freightRule = await seedFreightRuleVersion(database, { companyId, userId })
        const nfeDocumentId = await seedNfeDocument(database, { companyId, userId })

        const smallTripId = await seedTripWithStops(database, {
          companyId,
          documentsPerStop: 1,
          freightRule,
          nfeDocumentId,
          stopCount: 1,
          userId,
          vehicleId,
        })
        const largeTripId = await seedTripWithStops(database, {
          companyId,
          documentsPerStop: DOCUMENTS_PER_STOP,
          freightRule,
          nfeDocumentId,
          stopCount: STOP_COUNT,
          userId,
          vehicleId,
        })

        const { database: counted, selectCount } = countingDatabase(database.db)
        const repository = new DrizzleTripRepository(counted)

        const smallDetail = await repository.findById({ companyId, tripId: smallTripId })
        const smallSelectCount = selectCount()

        const largeDetail = await repository.findById({ companyId, tripId: largeTripId })
        const largeSelectCount = selectCount() - smallSelectCount

        expect(smallDetail?.stops).toHaveLength(1)
        expect(largeDetail?.stops).toHaveLength(STOP_COUNT)
        expect(largeDetail?.documents).toHaveLength(STOP_COUNT * DOCUMENTS_PER_STOP)
        for (const stop of largeDetail?.stops ?? []) {
          expect(stop.documents).toHaveLength(DOCUMENTS_PER_STOP)
        }

        // A prova de "sem N+1": a viagem com 40x mais paradas e 200x mais notas faz exatamente o
        // mesmo número de `select`s que a viagem com 1 parada e 1 nota.
        expect(largeSelectCount).toBe(smallSelectCount)
      })
    },
    30_000,
  )

  /**
   * Spec 145 G011: com baú medido o detalhe lê a planta guardada em `trip_cargo_layouts` — no máximo
   * duas leituras (a do hash atual e a última pronta da viagem), fixas, nunca uma por parada. O
   * pedido lazy não entra aqui: é transação própria, disparada pela rota depois da leitura.
   */
  testWithPostgres(
    'reads the stored layout in fixed selects, the same for 1 stop as for 40 stops',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const userId = crypto.randomUUID()
        const vehicleId = crypto.randomUUID()

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
        await database.db.insert(userCompanyMemberships).values({
          companyId,
          id: crypto.randomUUID(),
          status: 'active',
          userId,
        })
        await database.db.insert(fleetVehicles).values({
          capacityM3: '48.000',
          cargoHeightM: '2.500',
          cargoLengthM: '8.000',
          cargoWidthM: '2.400',
          companyId,
          id: vehicleId,
          plate: 'ABC1D24',
          role: 'traction',
          state: 'SP',
          vehicleType: 'three_quarter',
        })

        const freightRule = await seedFreightRuleVersion(database, { companyId, userId })
        const nfeDocumentId = await seedNfeDocument(database, { companyId, userId })
        const tripOf = (stopCount: number, documentsPerStop: number) =>
          seedTripWithStops(database, {
            companyId,
            documentsPerStop,
            freightRule,
            nfeDocumentId,
            stopCount,
            userId,
            vehicleId,
          })
        const smallTripId = await tripOf(1, 1)
        const largeTripId = await tripOf(STOP_COUNT, DOCUMENTS_PER_STOP)

        const { database: counted, layoutSelectCount, selectCount } = countingDatabase(database.db)
        const repository = new DrizzleTripRepository(counted)

        const smallDetail = await repository.findById({ companyId, tripId: smallTripId })
        const smallSelectCount = selectCount()
        const smallLayoutSelectCount = layoutSelectCount()

        await repository.findById({ companyId, tripId: largeTripId })
        const largeSelectCount = selectCount() - smallSelectCount
        const largeLayoutSelectCount = layoutSelectCount() - smallLayoutSelectCount

        expect(smallDetail?.cargoLayoutState.status).toBe('pending')
        expect(largeSelectCount).toBe(smallSelectCount)
        expect(largeLayoutSelectCount).toBe(smallLayoutSelectCount)
        expect(smallLayoutSelectCount).toBeGreaterThan(0)
        expect(smallLayoutSelectCount).toBeLessThanOrEqual(2)
      })
    },
    30_000,
  )
})

/**
 * Spec 168: `GET /trips/:id` é a rota que a tela de detalhe usa de fato, e até aqui nunca resolvia
 * `packageBoxId`/`grossWeightGrams`/`unitsPerBox` das pendências — só a rota dedicada de
 * `/cargo-layouts/:layoutId` o fazia. O fix reusa o mesmo `PendingMeasurementBoxLookupPort`
 * (`DrizzlePackageBoxRepository.findBoxIdsForPendingMeasurements`), casado por
 * `buildPendingMeasurementBoxKey`, direto em `readTripDetail`.
 */
describe('the trip detail resolves the box of each pending measurement (spec 168)', () => {
  testWithPostgres(
    'a pendência que casa (número da nota, código do produto) ganha os três campos do catálogo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const userId = crypto.randomUUID()
        const vehicleId = crypto.randomUUID()
        const emitterTaxId = '05868574001090'
        /** `seedNfeDocument` grava sempre o número `9` — a busca do catálogo casa por ele. */
        const documentNumber = '9'
        const productCode = 'SKU-168'

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
        await database.db.insert(userCompanyMemberships).values({
          companyId,
          id: crypto.randomUUID(),
          status: 'active',
          userId,
        })
        await database.db.insert(fleetVehicles).values({
          capacityM3: '48.000',
          cargoHeightM: '2.500',
          cargoLengthM: '8.000',
          cargoWidthM: '2.400',
          companyId,
          id: vehicleId,
          plate: 'ABC1D25',
          role: 'traction',
          state: 'SP',
          vehicleType: 'three_quarter',
        })

        const freightRule = await seedFreightRuleVersion(database, { companyId, userId })
        const nfeDocumentId = await seedNfeDocument(database, { companyId, userId })
        const tripId = await seedTripWithStops(database, {
          companyId,
          documentsPerStop: 1,
          freightRule,
          nfeDocumentId,
          stopCount: 1,
          userId,
          vehicleId,
        })

        /** Casa a nota semeada por `seedNfeDocument` (número `9`) com o catálogo. */
        await database.db.insert(nfeParticipants).values({
          companyId,
          documentId: nfeDocumentId,
          legalName: 'Emitente de teste',
          role: 'emitter',
          taxId: emitterTaxId,
        })
        await database.db.insert(nfeProducts).values({
          cfop: '5102',
          code: productCode,
          commercialUnit: 'CX',
          companyId,
          description: 'PRODUTO DE TESTE',
          documentId: nfeDocumentId,
          ncm: '84713012',
          ordinal: 1n,
          quantity: '1.0000',
          totalValue: '10.0000',
          unitValue: '10.0000',
        })
        /**
         * Spec 168 (regressão): a caixa do catálogo casa a pendência, mas ainda **não tem** as três
         * dimensões — só `grossWeightGrams`/`unitsPerBox`. Uma caixa já medida some da lista (é
         * exatamente o defeito que o fix corrige), então este cenário precisa de uma caixa sem
         * medida para continuar provando o enriquecimento (`packageBoxId`/`grossWeightGrams`/
         * `unitsPerBox`) sem se confundir com o descarte.
         */
        const boxId = crypto.randomUUID()
        await database.db.insert(nfePackageBoxes).values({
          commercialUnit: 'CX',
          companyId,
          description: 'CAIXA DO CATÁLOGO',
          emitterTaxId,
          grossWeightGrams: 700,
          id: boxId,
          productCode,
          unitsPerBox: 4,
        })

        /**
         * `readPreviousReady` só filtra por `(companyId, tripId, status)` — sem casar hash —, então
         * uma linha `ready` qualquer basta para servir esta planta fabricada, sem empacotar de fato.
         */
        await database.db.insert(tripCargoLayouts).values({
          companyId,
          computedAt: new Date('2026-09-20T10:00:00.000Z'),
          input: {},
          inputHash: 'fabricated-hash-168',
          layout: {
            freeRows: 0,
            occupancyKnown: true,
            orderIsBinding: true,
            overflowM3: '0.000000',
            placement: { layers: [], source: 'measured', unplaced: [] },
            pendingMeasurements: [
              {
                boxCount: 2,
                documentNumber,
                estimateSource: 'none',
                label: 'Caixa sem código',
                productCode,
                sequence: 1,
                stopLabel: 'Parada 1',
              },
            ],
            rows: [],
            slices: [],
            stopsWithoutVolume: [],
          },
          policyVersion: 'test-168',
          status: 'ready',
          tripId,
        })

        const repository = new DrizzleTripRepository(
          database.db,
          undefined,
          { packageBoxLookup: new DrizzlePackageBoxRepository(database.db) },
        )

        const detail = await repository.findById({ companyId, tripId })

        expect(detail?.cargoLayout?.pendingMeasurements).toEqual([
          {
            boxCount: 2,
            documentNumber,
            estimateSource: 'none',
            grossWeightGrams: 700,
            label: 'Caixa sem código',
            packageBoxId: boxId,
            productCode,
            sequence: 1,
            stopLabel: 'Parada 1',
            unitsPerBox: 4,
          },
        ])
      })
    },
    30_000,
  )

  testWithPostgres(
    'a caixa casada já tem as três dimensões gravadas: a pendência some da lista (bug do spec 168)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const userId = crypto.randomUUID()
        const vehicleId = crypto.randomUUID()
        const emitterTaxId = '05868574001090'
        const documentNumber = '9'
        const productCode = 'SKU-168-MEASURED'

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
        await database.db.insert(userCompanyMemberships).values({
          companyId,
          id: crypto.randomUUID(),
          status: 'active',
          userId,
        })
        await database.db.insert(fleetVehicles).values({
          capacityM3: '48.000',
          cargoHeightM: '2.500',
          cargoLengthM: '8.000',
          cargoWidthM: '2.400',
          companyId,
          id: vehicleId,
          plate: 'ABC1D26',
          role: 'traction',
          state: 'SP',
          vehicleType: 'three_quarter',
        })

        const freightRule = await seedFreightRuleVersion(database, { companyId, userId })
        const nfeDocumentId = await seedNfeDocument(database, { companyId, userId })
        const tripId = await seedTripWithStops(database, {
          companyId,
          documentsPerStop: 1,
          freightRule,
          nfeDocumentId,
          stopCount: 1,
          userId,
          vehicleId,
        })

        await database.db.insert(nfeParticipants).values({
          companyId,
          documentId: nfeDocumentId,
          legalName: 'Emitente de teste',
          role: 'emitter',
          taxId: emitterTaxId,
        })
        await database.db.insert(nfeProducts).values({
          cfop: '5102',
          code: productCode,
          commercialUnit: 'CX',
          companyId,
          description: 'PRODUTO DE TESTE',
          documentId: nfeDocumentId,
          ncm: '84713012',
          ordinal: 1n,
          quantity: '1.0000',
          totalValue: '10.0000',
          unitValue: '10.0000',
        })
        /** A caixa já foi medida — a mesma que o defeito medido na bancada reproduziu (spec 168). */
        await database.db.insert(nfePackageBoxes).values({
          commercialUnit: 'CX',
          companyId,
          description: 'CAIXA JÁ MEDIDA',
          emitterTaxId,
          grossWeightGrams: 700,
          heightMm: 250,
          id: crypto.randomUUID(),
          lengthMm: 400,
          measuredAt: new Date('2026-09-23T16:53:51.562Z'),
          measurementSource: 'typed' as const,
          productCode,
          unitsPerBox: 4,
          widthMm: 300,
        })

        /**
         * Planta guardada **antes** da medida (`stale`, servida por `readPreviousReady`): a mesma
         * situação que a bancada mediu — a planta pronta mais recente pode não ter recalculado ainda.
         */
        await database.db.insert(tripCargoLayouts).values({
          companyId,
          computedAt: new Date('2026-09-20T10:00:00.000Z'),
          input: {},
          inputHash: 'fabricated-hash-168-measured',
          layout: {
            freeRows: 0,
            occupancyKnown: true,
            orderIsBinding: true,
            overflowM3: '0.000000',
            placement: { layers: [], source: 'measured', unplaced: [] },
            pendingMeasurements: [
              {
                boxCount: 2,
                documentNumber,
                estimateSource: 'none',
                label: 'Caixa sem código',
                productCode,
                sequence: 1,
                stopLabel: 'Parada 1',
              },
            ],
            rows: [],
            slices: [],
            stopsWithoutVolume: [],
          },
          policyVersion: 'test-168',
          status: 'ready',
          tripId,
        })

        const repository = new DrizzleTripRepository(
          database.db,
          undefined,
          { packageBoxLookup: new DrizzlePackageBoxRepository(database.db) },
        )

        const detail = await repository.findById({ companyId, tripId })

        expect(detail?.cargoLayout?.pendingMeasurements).toEqual([])
      })
    },
    30_000,
  )
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type FreightRuleReference = { readonly ruleId: string; readonly versionId: string }

async function seedFreightRuleVersion(
  database: TestDatabase,
  input: { readonly companyId: string; readonly userId: string },
): Promise<FreightRuleReference> {
  const ruleId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  await database.db.insert(freightRules).values({
    companyId: input.companyId,
    createdByUserId: input.userId,
    currentVersion: 1n,
    id: ruleId,
    name: 'Frete do teste de query count',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId: input.companyId,
    createdByUserId: input.userId,
    filters: {},
    freightRuleId: ruleId,
    id: versionId,
    percentage: '0.035000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  return { ruleId, versionId }
}

async function seedNfeDocument(
  database: TestDatabase,
  input: { readonly companyId: string; readonly userId: string },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = 'a'.repeat(64)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'nfe/query-count.xml',
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: 'correlation-import-query-count',
    id: importId,
    idempotencyKey: 'import-query-count',
    requestFingerprint: 'fingerprint-import-query-count',
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `9${'1'.repeat(43)}`,
    authorizationProtocol: 'protocol-nfe-query-count',
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-07-22T12:00:00.000Z'),
    model: '55',
    number: '9',
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

async function seedTripWithStops(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly documentsPerStop: number
    readonly freightRule: FreightRuleReference
    readonly nfeDocumentId: string
    readonly stopCount: number
    readonly userId: string
    readonly vehicleId: string
  },
): Promise<string> {
  const tripId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const driverTaxId = String(input.stopCount).padStart(2, '0').repeat(6).slice(0, 11)
  await database.db.insert(trips).values({
    companyId: input.companyId,
    id: tripId,
    status: 'draft',
    vehicleId: input.vehicleId,
  })
  await database.db.insert(fleetDrivers).values({
    companyId: input.companyId,
    id: driverId,
    name: 'Motorista de teste',
    taxId: driverTaxId,
  })
  await database.db.insert(tripDrivers).values({
    companyId: input.companyId,
    driverId,
    driverName: 'Motorista de teste',
    driverTaxId,
    id: crypto.randomUUID(),
    position: 1n,
    tripId,
  })

  for (let stopIndex = 1; stopIndex <= input.stopCount; stopIndex += 1) {
    const stopId = crypto.randomUUID()
    await database.db.insert(tripStops).values({
      addressKey: `${tripId.slice(0, 8)}-${stopIndex}`,
      companyId: input.companyId,
      id: stopId,
      label: `Parada ${stopIndex}`,
      sequence: BigInt(stopIndex),
      tripId,
    })

    for (let documentIndex = 1; documentIndex <= input.documentsPerStop; documentIndex += 1) {
      const freightCalculationId = crypto.randomUUID()
      await database.db.insert(freightCalculations).values({
        adjustments: [],
        baseAmount: '1000.0000',
        calculatedAmount: '35.0000',
        calculationDetails: {},
        companyId: input.companyId,
        correlationId: `correlation-${freightCalculationId}`,
        createdByUserId: input.userId,
        freightRuleId: input.freightRule.ruleId,
        freightRuleVersionId: input.freightRule.versionId,
        id: freightCalculationId,
        idempotencyKey: `idempotency-${freightCalculationId}`,
        nfeDocumentId: input.nfeDocumentId,
        percentage: '0.035000',
        requestFingerprint: `fingerprint-${freightCalculationId}`,
        ruleSnapshot: {},
        ruleVersion: 1n,
        status: 'snapshotted',
        totalAmount: '35.0000',
      })
      await database.db.insert(tripDocuments).values({
        companyId: input.companyId,
        freightCalculationId,
        stopId,
        tripId,
      })
    }
  }

  return tripId
}

/**
 * Envolve `database.db` numa camada que conta chamadas a `.select(...)` no queryable de topo (o
 * que `readTripDetail` de fato usa) — cada chamada corresponde a exatamente uma query real, sem
 * precisar instrumentar o driver Postgres por baixo.
 */
function countingDatabase(db: TestDatabase['db']): {
  readonly database: TestDatabase['db']
  readonly layoutSelectCount: () => number
  readonly selectCount: () => number
} {
  let count = 0
  let layoutCount = 0
  const database = new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'select') return Reflect.get(target, property, receiver)
      count += 1
      const select = Reflect.get(target, property, receiver) as (...args: unknown[]) => object
      return (...args: unknown[]) =>
        new Proxy(select.apply(receiver, args), {
          get(builder, key, builderReceiver) {
            const value = Reflect.get(builder, key, builderReceiver) as unknown
            if (key !== 'from' || typeof value !== 'function') return value
            return (table: unknown, ...rest: unknown[]) => {
              if (table === tripCargoLayouts) layoutCount += 1
              return (value as (...parameters: unknown[]) => unknown).apply(builder, [
                table,
                ...rest,
              ])
            }
          },
        })
    },
  })
  return { database, layoutSelectCount: () => layoutCount, selectCount: () => count }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t014_${crypto.randomUUID().replaceAll('-', '')}`
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
