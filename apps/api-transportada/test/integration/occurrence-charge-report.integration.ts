/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T19 — a leitura do acumulado contra Postgres de verdade: o recorte `sem lote`, os
 * filtros, os totais em `numeric`, o isolamento por empresa, e a prova de que a consulta usa
 * `delivery_charges_contractor_period_idx` (T16) em vez de varrer a tabela.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  contractors,
  deliveryCharges,
  deliveryClients,
  extraChargeBatches,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrences,
  tripDocuments,
  trips,
} from '../../src/database/trip.schema.js'
import { fleetVehicles } from '../../src/database/fleet.schema.js'
import { DrizzleOccurrenceChargeReportRepository } from '../../src/delivery-clients/infrastructure/drizzle-occurrence-charge-report.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describe('a leitura do acumulado de ocorrência contra Postgres (spec 164 T19)', () => {
  testWithPostgres(
    'lista só o que está sem lote, com totais e isolamento por empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const repository = new DrizzleOccurrenceChargeReportRepository(database.db)

        const page = await repository.read({
          companyId: world.companyId,
          filters: { limit: 50 },
        })

        const ids = page.items.map((item) => item.id)
        expect(ids).toContain(world.openChargeId)
        /** Já em lote — some do recorte, mesmo sendo da mesma empresa e do mesmo contratante. */
        expect(ids).not.toContain(world.batchedChargeId)
        /** De outra empresa — nunca vaza. */
        expect(ids).not.toContain(world.otherCompanyChargeId)

        const openRow = page.items.find((item) => item.id === world.openChargeId)
        expect(openRow?.amount).toBe('120.0000')
        expect(openRow?.chargeType).toBe('returned_goods')

        expect(page.totals.totalAmount).toBe('120.0000')
        expect(page.totals.totalCount).toBe(1)
      })
    },
  )

  testWithPostgres('filtra por contratante, período e tipo de cobrança', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const repository = new DrizzleOccurrenceChargeReportRepository(database.db)

      const byContractor = await repository.read({
        companyId: world.companyId,
        filters: { contractorId: world.contractorId, limit: 50 },
      })
      expect(byContractor.items.map((item) => item.id)).toEqual([world.openChargeId])

      const outOfPeriod = await repository.read({
        companyId: world.companyId,
        filters: { from: '2026-09-01', limit: 50, to: '2026-09-30' },
      })
      expect(outOfPeriod.items).toHaveLength(0)

      const wrongType = await repository.read({
        companyId: world.companyId,
        filters: { chargeType: 'unloading', limit: 50 },
      })
      expect(wrongType.items).toHaveLength(0)
    })
  })

  testWithPostgres(
    'usa delivery_charges_contractor_period_idx, sem varrer a tabela inteira',
    async () => {
      if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
      const admin = new SQL(databaseUrl, { max: 1 })
      const databaseName = `transportada_164_t19_plan_${crypto.randomUUID().replaceAll('-', '')}`
      const disposableUrl = new URL(databaseUrl)
      disposableUrl.pathname = `/${databaseName}`
      disposableUrl.search = ''
      let connection: SQL | undefined
      try {
        await admin.unsafe(`create database "${databaseName}"`)
        await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
        connection = new SQL(disposableUrl.toString(), { max: 1 })

        const plan = await connection.begin(async (transaction) => {
          await transaction`set local enable_seqscan = off`
          const rows = await transaction<Array<{ readonly 'QUERY PLAN': string }>>`
            explain
            select id from delivery_charges
            where company_id = ${crypto.randomUUID()}::uuid
              and contractor_id = ${crypto.randomUUID()}::uuid
              and charged_on >= '2026-08-01'
              and charged_on <= '2026-08-31'
          `
          return rows.map((row) => row['QUERY PLAN']).join('\n')
        })

        expect(plan).toMatch(/Index (Only )?Scan using delivery_charges_contractor_period_idx/u)
      } finally {
        try {
          await connection?.close({ timeout: 0 })
        } finally {
          try {
            await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
          } finally {
            await admin.close({ timeout: 0 })
          }
        }
      }
    },
  )
})

type World = {
  readonly batchedChargeId: string
  readonly companyId: string
  readonly contractorId: string
  readonly openChargeId: string
  readonly otherCompanyChargeId: string
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const otherContractorId = crypto.randomUUID()
  const deliveryClientId = crypto.randomUUID()
  const occurrenceTypeId = crypto.randomUUID()
  const occurrenceId = crypto.randomUUID()
  const batchedOccurrenceId = crypto.randomUUID()
  const otherCompanyOccurrenceTypeId = crypto.randomUUID()
  const otherCompanyOccurrenceId = crypto.randomUUID()
  const tripDocumentId = crypto.randomUUID()
  const otherTripDocumentId = crypto.randomUUID()
  const otherCompanyTripDocumentId = crypto.randomUUID()

  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: otherCompanyId, status: 'active' },
  ])
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values([
    { companyId, id: crypto.randomUUID(), status: 'active', userId },
    { companyId: otherCompanyId, id: crypto.randomUUID(), status: 'active', userId },
  ])
  await database.db.insert(contractors).values([
    { companyId, displayName: 'Spani Atacadista', id: contractorId, taxId: '30290856000160' },
    { companyId, displayName: 'Outro embarcador', id: otherContractorId, taxId: '12345678000190' },
  ])
  await database.db.insert(deliveryClients).values({
    companyId,
    displayName: 'Loja Central',
    id: deliveryClientId,
    taxId: '98765432000109',
  })
  const otherCompanyDeliveryClientId = crypto.randomUUID()
  await database.db.insert(deliveryClients).values({
    companyId: otherCompanyId,
    displayName: 'Loja de outra empresa',
    id: otherCompanyDeliveryClientId,
    taxId: '11222333000144',
  })

  const vehicleId = crypto.randomUUID()
  const otherCompanyVehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const otherCompanyTripId = crypto.randomUUID()

  await database.db.insert(fleetVehicles).values([
    {
      companyId,
      id: vehicleId,
      plate: 'GCQ8E47',
      role: 'traction',
      state: 'SP',
      vehicleType: 'tractor_unit',
    },
    {
      companyId: otherCompanyId,
      id: otherCompanyVehicleId,
      plate: 'HTX2P19',
      role: 'traction',
      state: 'SP',
      vehicleType: 'tractor_unit',
    },
  ])
  await database.db.insert(trips).values([
    { companyId, id: tripId, status: 'dispatched', vehicleId },
    {
      companyId: otherCompanyId,
      id: otherCompanyTripId,
      status: 'dispatched',
      vehicleId: otherCompanyVehicleId,
    },
  ])
  const importId = crypto.randomUUID()
  const otherCompanyImportId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const otherXmlObjectId = crypto.randomUUID()
  const thirdXmlObjectId = crypto.randomUUID()
  const nfeDocumentId = crypto.randomUUID()
  const otherNfeDocumentId = crypto.randomUUID()
  const otherCompanyNfeDocumentId = crypto.randomUUID()

  await database.db.insert(storedObjects).values([
    {
      bucket: 'integration',
      companyId,
      id: xmlObjectId,
      mimeType: 'application/xml',
      objectKey: 'nfe/occurrence-charge-1.xml',
      provider: 's3',
      purpose: 'nfe_document',
      sha256: '1'.repeat(64),
      sizeBytes: 100n,
      status: 'final',
    },
    {
      bucket: 'integration',
      companyId,
      id: otherXmlObjectId,
      mimeType: 'application/xml',
      objectKey: 'nfe/occurrence-charge-2.xml',
      provider: 's3',
      purpose: 'nfe_document',
      sha256: '2'.repeat(64),
      sizeBytes: 100n,
      status: 'final',
    },
    {
      bucket: 'integration',
      companyId: otherCompanyId,
      id: thirdXmlObjectId,
      mimeType: 'application/xml',
      objectKey: 'nfe/occurrence-charge-3.xml',
      provider: 's3',
      purpose: 'nfe_document',
      sha256: '3'.repeat(64),
      sizeBytes: 100n,
      status: 'final',
    },
  ])
  await database.db.insert(nfeImports).values([
    {
      companyId,
      correlationId: 'correlation-occurrence-charge',
      id: importId,
      idempotencyKey: 'occurrence-charge',
      requestFingerprint: 'fingerprint-occurrence-charge',
      requestedByUserId: userId,
      source: 'upload',
      status: 'completed',
    },
    {
      companyId: otherCompanyId,
      correlationId: 'correlation-occurrence-charge-other',
      id: otherCompanyImportId,
      idempotencyKey: 'occurrence-charge-other',
      requestFingerprint: 'fingerprint-occurrence-charge-other',
      requestedByUserId: userId,
      source: 'upload',
      status: 'completed',
    },
  ])
  await database.db.insert(nfeDocuments).values([
    {
      accessKey: `9${'1'.repeat(43)}`,
      authorizationProtocol: 'protocol-occurrence-charge-1',
      companyId,
      createdByUserId: userId,
      freightValue: '0.0000',
      id: nfeDocumentId,
      importId,
      issuedAt: new Date('2026-08-10T06:00:00.000Z'),
      model: '55',
      number: '900101',
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '1000.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: '1000.0000',
      xmlObjectId,
      xmlSha256: '1'.repeat(64),
    },
    {
      accessKey: `9${'2'.repeat(43)}`,
      authorizationProtocol: 'protocol-occurrence-charge-2',
      companyId,
      createdByUserId: userId,
      freightValue: '0.0000',
      id: otherNfeDocumentId,
      importId,
      issuedAt: new Date('2026-08-11T06:00:00.000Z'),
      model: '55',
      number: '900102',
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '1000.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: '1000.0000',
      xmlObjectId: otherXmlObjectId,
      xmlSha256: '2'.repeat(64),
    },
    {
      accessKey: `9${'3'.repeat(43)}`,
      authorizationProtocol: 'protocol-occurrence-charge-3',
      companyId: otherCompanyId,
      createdByUserId: userId,
      freightValue: '0.0000',
      id: otherCompanyNfeDocumentId,
      importId: otherCompanyImportId,
      issuedAt: new Date('2026-08-12T06:00:00.000Z'),
      model: '55',
      number: '900103',
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '1000.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: '1000.0000',
      xmlObjectId: thirdXmlObjectId,
      xmlSha256: '3'.repeat(64),
    },
  ])

  await database.db.insert(tripDocuments).values([
    { companyId, id: tripDocumentId, nfeDocumentId, tripId },
    { companyId, id: otherTripDocumentId, nfeDocumentId: otherNfeDocumentId, tripId },
    {
      companyId: otherCompanyId,
      id: otherCompanyTripDocumentId,
      nfeDocumentId: otherCompanyNfeDocumentId,
      tripId: otherCompanyTripId,
    },
  ])

  await database.db.insert(companyOccurrenceTypes).values([
    { companyId, id: occurrenceTypeId, name: 'Avaria total', stage: 'delivery' },
    {
      companyId: otherCompanyId,
      id: otherCompanyOccurrenceTypeId,
      name: 'Avaria total',
      stage: 'delivery',
    },
  ])

  await database.db.insert(tripDocumentOccurrences).values([
    {
      actorUserId: userId,
      companyId,
      id: occurrenceId,
      occurrenceTypeId,
      stage: 'delivery',
      tripDocumentId,
    },
    {
      actorUserId: userId,
      companyId,
      id: batchedOccurrenceId,
      occurrenceTypeId,
      stage: 'delivery',
      tripDocumentId: otherTripDocumentId,
    },
    {
      actorUserId: userId,
      companyId: otherCompanyId,
      id: otherCompanyOccurrenceId,
      occurrenceTypeId: otherCompanyOccurrenceTypeId,
      stage: 'delivery',
      tripDocumentId: otherCompanyTripDocumentId,
    },
  ])

  const openChargeId = crypto.randomUUID()
  const batchedChargeId = crypto.randomUUID()
  const otherCompanyChargeId = crypto.randomUUID()
  const batchId = crypto.randomUUID()

  await database.db.insert(extraChargeBatches).values({
    accessToken: 'token-opaco-de-trinta-e-dois-bytes-ou-mais',
    closedByUserId: userId,
    companyId,
    contractorId: otherContractorId,
    id: batchId,
    periodEnd: '2026-08-31',
    periodStart: '2026-08-01',
  })

  await database.db.insert(deliveryCharges).values([
    {
      amount: '120.0000',
      chargeType: 'returned_goods',
      chargedOn: '2026-08-12',
      companyId,
      contractorId,
      deliveryClientId,
      id: openChargeId,
      occurrenceId,
      origin: 'occurrence',
      status: 'recorded',
    },
    {
      amount: '50.0000',
      batchId,
      chargeType: 'returned_goods',
      chargedOn: '2026-08-13',
      companyId,
      contractorId: otherContractorId,
      deliveryClientId,
      id: batchedChargeId,
      occurrenceId: batchedOccurrenceId,
      origin: 'occurrence',
      status: 'submitted',
    },
    {
      amount: '75.0000',
      chargeType: 'returned_goods',
      chargedOn: '2026-08-14',
      companyId: otherCompanyId,
      deliveryClientId: otherCompanyDeliveryClientId,
      id: otherCompanyChargeId,
      occurrenceId: otherCompanyOccurrenceId,
      origin: 'occurrence',
      status: 'recorded',
    },
  ])

  return { batchedChargeId, companyId, contractorId, openChargeId, otherCompanyChargeId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_164_t19_${crypto.randomUUID().replaceAll('-', '')}`
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
