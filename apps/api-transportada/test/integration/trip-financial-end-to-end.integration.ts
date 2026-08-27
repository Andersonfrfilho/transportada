/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 061 T010 — **a viagem fecha a conta, contra Postgres.** Receita do CT-e autorizado, custo do
 * agregado pela tabela de região, imposto descendo da receita, e o congelado que não muda quando o
 * preço do combustível muda depois.
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
  cteBatchItemCharges,
  cteBatchItems,
  cteBatches,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  cteIssuancePayloads,
  fiscalSequenceReservations,
  fiscalSequences,
  fleetDriverRegions,
  fleetDrivers,
  fleetVehicles,
  freightCalculations,
  freightRegionDriverRates,
  freightRegions,
  freightRuleVersions,
  freightRules,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripCostEntries } from '../../src/database/trip-financial.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../src/database/trip.schema.js'
import { freezeTripFinancialResult } from '../../src/trips/application/freeze-trip-financial-result.use-case.js'
import { readTripValuation } from '../../src/trips/application/read-trip-valuation.use-case.js'
import { buildFinancialSummary } from '../../src/trips/domain/financial-summary.policy.js'
import { DrizzleTripFinancialResultRepository } from '../../src/trips/infrastructure/drizzle-trip-financial-result.repository.js'
import { DrizzleFinancialSummaryQuery } from '../../src/trips/infrastructure/financial-summary.query.js'
import { DrizzleTripValuationQuery } from '../../src/trips/infrastructure/trip-valuation.query.js'
import { DrizzleApplicableFreightRuleQuery } from '../../src/freight/infrastructure/drizzle-freight.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describe('a viagem fecha a conta (spec 061 T010)', () => {
  testWithPostgres(
    'receita do CT-e, agregado pela tabela, imposto descendo — e o congelado não muda depois',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTrip(database)
        const valuationRepository = {
          findApplicableRule: (
            query: Parameters<DrizzleApplicableFreightRuleQuery['findApplicableRule']>[0],
          ) => new DrizzleApplicableFreightRuleQuery(database.db).findApplicableRule(query),
          readContext: (query: { readonly companyId: string; readonly tripId: string }) =>
            new DrizzleTripValuationQuery(database.db).readContext(query),
        }

        const valuation = await readTripValuation({
          companyId: world.companyId,
          repository: valuationRepository,
          tripId: world.tripId,
        })

        /** Receita é o CT-e autorizado: 2.000,00 de encargos, e nada de previsão no meio. */
        expect(valuation.totalRevenue).toBe('2000.0000')
        expect(valuation.revenueSource).toBe('measured')

        const byKind = new Map(valuation.costParcels.map((parcel) => [parcel.kind, parcel]))
        /** O agregado sai da tabela de região cruzada com a classe do veículo (spec 038). */
        expect(byKind.get('driver')).toMatchObject({ amount: '812.4500', source: 'measured' })
        /** ICMS medido do documento; PIS/COFINS pela alíquota do regime: 2.000 × 3,65% = 73,00. */
        expect(byKind.get('icms')).toMatchObject({ amount: '240.0000', source: 'measured' })
        expect(byKind.get('pis_cofins')).toMatchObject({ amount: '73.0000', source: 'measured' })
        /** Pedágio lançado deixa de ser ausência. */
        expect(byKind.get('toll')).toMatchObject({ amount: '120.0000', source: 'measured' })

        const repository = new DrizzleTripFinancialResultRepository(database.db)
        const frozen = await freezeTripFinancialResult({
          actorUserId: world.userId,
          assumptions: { fuelPricePerLiter: '6.0000' },
          companyId: world.companyId,
          repository,
          tripId: world.tripId,
          valuation,
        })

        expect(frozen.version).toBe(1)
        expect(frozen.revenueAmount).toBe('2000.0000')
        expect(frozen.taxTotal).toBe('313.0000')
        /** Líquido = receita − imposto − custo, e o custo traz motorista, pedágio e o por-quilômetro. */
        expect(frozen.netAmount).toBe(subtract('2000.0000', add('313.0000', frozen.costTotal)))

        /**
         * ADR-0049 §5: o congelado **não muda** quando o cadastro muda. O preço do combustível sobe
         * 50% e o resultado de ontem continua o de ontem.
         */
        await database.db
          .update(companyFuelPrices)
          .set({ pricePerUnit: '9.0000' })
          .where(eq(companyFuelPrices.companyId, world.companyId))

        const current = await repository.findCurrent({
          companyId: world.companyId,
          tripId: world.tripId,
        })
        expect(current?.costTotal).toBe(frozen.costTotal)
        expect(current?.version).toBe(1)

        /** Recalcular gera versão nova, com motivo, e a anterior deixa de ser a viva. */
        const recalculated = await freezeTripFinancialResult({
          actorUserId: world.userId,
          assumptions: { fuelPricePerLiter: '9.0000' },
          companyId: world.companyId,
          reason: 'preço do diesel corrigido',
          repository,
          tripId: world.tripId,
          valuation: await readTripValuation({
            companyId: world.companyId,
            repository: valuationRepository,
            tripId: world.tripId,
          }),
        })
        expect(recalculated.version).toBe(2)
        expect(recalculated.costTotal).not.toBe(frozen.costTotal)

        /** E o acumulado do período conta a viagem **uma vez**, pela versão viva. */
        const summaryQuery = new DrizzleFinancialSummaryQuery(database.db)
        const filters = {
          companyId: world.companyId,
          from: '2026-01-01',
          groupBy: 'vehicle' as const,
          to: '2036-12-31',
        }
        const summary = buildFinancialSummary({
          payrollAmount: await summaryQuery.readPayroll(filters),
          rows: await summaryQuery.listGroups(filters),
        })

        expect(summary.tripCount).toBe(1)
        expect(summary.revenueAmount).toBe('2000.0000')
        expect(summary.groups[0]?.groupLabel).toBe('GCQ8E47')
        /** Frota só de agregado não tem folha: `null` diz isso, e o total se declara aproximado. */
        expect(summary.payrollAmount).toBeNull()
      })
    },
    60_000,
  )
})

type World = {
  readonly companyId: string
  readonly tripId: string
  readonly userId: string
}

async function seedTrip(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const regionId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const nfeDocumentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const batchId = crypto.randomUUID()
  const batchItemId = crypto.randomUUID()
  const attemptId = crypto.randomUUID()
  const fiscalSequenceId = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const sha = '1'.repeat(64)

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  /** Regime declarado: sem ele o federal ficaria `missing`, que é o outro caso do contrato. */
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
    id: driverId,
    name: 'Agregado',
    paymentModel: 'route_table',
    taxId: '11111111111',
  })
  await database.db
    .insert(freightRegions)
    .values({ code: '1.000', companyId, id: regionId, name: 'Barretos', zone: 1 })
  await database.db.insert(freightRegionDriverRates).values({
    companyId,
    driverAmount: '812.4500',
    freightClass: 'toco',
    regionId,
  })
  await database.db
    .insert(fleetDriverRegions)
    .values({ companyId, driverId, regionId, scope: 'region' })

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'nfe/financial.xml',
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-financial',
    id: importId,
    idempotencyKey: 'financial',
    requestFingerprint: 'fingerprint-financial',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `7${'1'.repeat(43)}`,
    authorizationProtocol: 'protocol-financial',
    companyId,
    createdByUserId: userId,
    freightValue: '0.0000',
    id: nfeDocumentId,
    importId,
    issuedAt: new Date('2026-08-26T06:00:00.000Z'),
    model: '55',
    number: '700001',
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
  for (const [role, taxId] of [
    ['emitter', '30290856000160'],
    ['recipient', '98765432000109'],
  ] as const) {
    const participantId = crypto.randomUUID()
    await database.db
      .insert(nfeParticipants)
      .values({
        companyId,
        documentId: nfeDocumentId,
        id: participantId,
        legalName: role,
        role,
        taxId,
      })
    await database.db.insert(nfeAddresses).values({
      city: 'Barretos',
      cityCode: '3505708',
      companyId,
      number: '100',
      participantId,
      postalCode: '14780000',
      state: 'SP',
      street: 'Rua da Entrega',
    })
  }

  await database.db.insert(cteBatches).values({
    companyId,
    correlationId: 'correlation-financial-batch',
    id: batchId,
    idempotencyFingerprint: 'fingerprint-financial-batch',
    idempotencyKey: 'financial-batch',
    name: 'Lote financeiro',
    operatorUserId: userId,
    status: 'submitted',
    version: 1n,
  })
  /** O item do lote nasce de um cálculo de frete — a coluna é obrigatória, e é assim na produção. */
  const freightRuleId = crypto.randomUUID()
  const freightRuleVersionId = crypto.randomUUID()
  const freightCalculationId = crypto.randomUUID()
  await database.db.insert(freightRules).values({
    companyId,
    createdByUserId: userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: 'Frete financeiro',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId,
    createdByUserId: userId,
    filters: {},
    freightRuleId,
    id: freightRuleVersionId,
    percentage: '0.200000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await database.db.insert(freightCalculations).values({
    adjustments: [],
    baseAmount: '10000.0000',
    calculatedAmount: '2000.0000',
    calculationDetails: {},
    companyId,
    correlationId: 'correlation-financial-freight',
    createdByUserId: userId,
    freightRuleId,
    freightRuleVersionId,
    id: freightCalculationId,
    idempotencyKey: 'financial-freight',
    nfeDocumentId,
    percentage: '0.200000',
    requestFingerprint: 'fingerprint-financial-freight',
    ruleSnapshot: {},
    ruleVersion: 1n,
    status: 'snapshotted',
    totalAmount: '2000.0000',
  })
  await database.db.insert(cteBatchItems).values({
    batchId,
    calculationSnapshot: {},
    companyId,
    freightCalculationId,
    id: batchItemId,
    nfeDocumentId,
    position: 1n,
  })
  await database.db.insert(cteBatchItemCharges).values({
    amount: '2000.0000',
    baseAmount: '10000.0000',
    calculationType: 'percentage_of_cargo',
    companyId,
    itemId: batchItemId,
    label: 'Frete',
    ordinal: 1n,
    rate: '0.200000',
  })
  await database.db.insert(fiscalSequences).values({
    companyId,
    environment: 'homologation',
    id: fiscalSequenceId,
    lastReservedNumber: 1n,
    model: 'cte',
    nextNumber: 2n,
    series: 1n,
    version: 1n,
  })
  await database.db.insert(fiscalSequenceReservations).values({
    companyId,
    fiscalSequenceId,
    id: reservationId,
    number: 1n,
    reservationKey: 'reservation-financial',
  })
  await database.db.insert(cteIssuanceAttempts).values({
    attemptKind: 'issue',
    attemptNumber: 1n,
    batchId,
    batchItemId,
    companyId,
    correlationId: 'correlation-financial-attempt',
    fiscalEnvironment: 'homologation',
    fiscalNumber: 1n,
    fiscalSeries: '1',
    id: attemptId,
    idempotencyFingerprint: 'fingerprint-financial-attempt',
    idempotencyKey: 'financial-attempt',
    requestFingerprint: 'request-financial-attempt',
    reservationId,
    status: 'authorized',
  })
  await database.db.insert(cteFiscalDocuments).values({
    accessKey: `6${'2'.repeat(43)}`,
    attemptId,
    authorizationProtocol: 'protocol-financial-cte',
    authorizedAt: new Date('2026-08-26T07:00:00.000Z'),
    batchItemId,
    companyId,
    fiscalEnvironment: 'homologation',
    fiscalNumber: 1n,
    fiscalSeries: '1',
    status: 'authorized',
    xmlObjectId,
    xmlSha256: sha,
  })
  /** ADR-0049 §4: o ICMS sai **daqui** — do payload que viajou no XML, não do perfil de hoje. */
  await database.db.insert(cteIssuancePayloads).values({
    attemptId,
    batchId,
    batchItemId,
    companyId,
    payload: { icms: { cst: '00', pICMS: '12.00', vBC: '2000.00', vICMS: '240.0000' } },
    payloadSha256: sha,
    providerConfig: {},
  })

  await database.db.insert(trips).values({ companyId, id: tripId, status: 'completed', vehicleId })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Agregado',
    driverTaxId: '11111111111',
    position: 1n,
    tripId,
  })
  await database.db
    .insert(tripDocuments)
    .values({ companyId, id: crypto.randomUUID(), nfeDocumentId, tripId })
  /**
   * A parada carrega a distância do roteiro aceito: sem ela o combustível seria ausência, e a
   * mudança de preço não teria como mexer no recálculo — que é justamente o que este teste mede.
   */
  await database.db.insert(tripStops).values({
    addressKey: '14780000|100|3505708',
    companyId,
    distanceFromPreviousMeters: 200_000,
    label: 'Barretos',
    sequence: 1n,
    tripId,
  })
  /** Pedágio lançado à mão: sem ele a parcela seria ausência, que é o outro caso do contrato. */
  await database.db.insert(tripCostEntries).values({
    actorUserId: userId,
    amount: '120.0000',
    companyId,
    description: 'Pedágio da rota',
    kind: 'toll',
    tripId,
  })

  return { companyId, tripId, userId }
}

function toScaled(value: string): bigint {
  const [integer = '0', fraction = ''] = value.split('.')
  return BigInt(`${integer}${`${fraction}0000`.slice(0, 4)}`)
}

function format(value: bigint): string {
  const negative = value < 0n
  const magnitude = (negative ? -value : value).toString().padStart(5, '0')
  return `${negative ? '-' : ''}${magnitude.slice(0, -4)}.${magnitude.slice(-4)}`
}

function add(left: string, right: string): string {
  return format(toScaled(left) + toScaled(right))
}

function subtract(left: string, right: string): string {
  return format(toScaled(left) - toScaled(right))
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_061_${crypto.randomUUID().replaceAll('-', '')}`
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
