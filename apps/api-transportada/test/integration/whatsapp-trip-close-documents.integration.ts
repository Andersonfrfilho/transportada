/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 (revisão): `listTripCloseDocuments` contra Postgres — o `leftJoin` com a NF devolve a nota sem
 * NF com número vazio, e o filtro por empresa e viagem não pode vazar nota de outra viagem.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetVehicles,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, trips } from '../../src/database/trip.schema.js'
import { listTripCloseDocuments } from '../../src/whatsapp-commands/infrastructure/whatsapp-attendant-field.adapter.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('listTripCloseDocuments (Postgres)', () => {
  testWithPostgres(
    'devolve número, liberação e separação por nota; nota sem NF volta com número vazio; só a viagem pedida',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = crypto.randomUUID()
        const userId = crypto.randomUUID()
        const vehicleId = crypto.randomUUID()
        await db.insert(companies).values({ id: companyId, status: 'active' })
        await db.insert(identityUsers).values({ id: userId, status: 'active' })
        await db
          .insert(userCompanyMemberships)
          .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
        await db.insert(fleetVehicles).values({
          companyId,
          id: vehicleId,
          plate: 'GCQ8E47',
          role: 'traction',
          state: 'SP',
          vehicleType: 'tractor_unit',
        })
        const tripId = await seedTrip(db, { companyId, vehicleId })
        const otherTripId = await seedTrip(db, { companyId, vehicleId })
        const nfe = await seedNfeDocument(db, { companyId, userId })
        const otherNfe = await seedNfeDocument(db, { companyId, userId })
        const freightCalculationId = await seedFreightCalculation(db, {
          companyId,
          nfeDocumentId: otherNfe.id,
          userId,
        })
        const releasedAt = new Date('2026-11-01T10:00:00.000Z')
        await db.insert(tripDocuments).values([
          {
            companyId,
            nfeDocumentId: nfe.id,
            separationStatus: 'loaded',
            tripId,
          },
          {
            companyId,
            freightCalculationId,
            releasedAt,
            separationStatus: 'delivered',
            tripId,
          },
          {
            companyId,
            nfeDocumentId: otherNfe.id,
            separationStatus: 'loaded',
            tripId: otherTripId,
          },
        ])

        const documents = await listTripCloseDocuments(db, { companyId, tripId })

        expect(
          [...documents].sort((left, right) => left.number.localeCompare(right.number)),
        ).toEqual([
          { number: '', releasedAt: releasedAt.toISOString(), separationStatus: 'delivered' },
          { number: nfe.number, releasedAt: null, separationStatus: 'loaded' },
        ])
      })
    },
  )
})

async function seedTrip(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly vehicleId: string },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(trips).values({
    companyId: input.companyId,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    id,
    status: 'in_transit',
    vehicleId: input.vehicleId,
  })
  return id
}

async function seedNfeDocument(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly userId: string },
): Promise<{ readonly id: string; readonly number: string }> {
  const importId = crypto.randomUUID()
  const id = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const suffix = id.replaceAll('-', '')
  const sha = suffix.padEnd(64, '0').slice(0, 64)
  const digits = suffix.replace(/[a-f]/g, (letter) => String(letter.charCodeAt(0) % 10))
  const number = `1${digits.slice(0, 5)}`

  await db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/trip-close-documents-${suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-${suffix}`,
    id: importId,
    idempotencyKey: `trip-close-documents-${suffix}`,
    requestFingerprint: `fingerprint-${suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await db.insert(nfeDocuments).values({
    accessKey: `${digits}${'0'.repeat(12)}`,
    authorizationProtocol: `protocol-${suffix}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id,
    importId,
    issuedAt: new Date('2026-09-18T06:00:00.000Z'),
    model: '55',
    number,
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
  return { id, number }
}

async function seedFreightCalculation(
  db: TestDatabase['db'],
  input: { readonly companyId: string; readonly nfeDocumentId: string; readonly userId: string },
): Promise<string> {
  const ruleId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  const id = crypto.randomUUID()
  await db.insert(freightRules).values({
    companyId: input.companyId,
    createdByUserId: input.userId,
    currentVersion: 1n,
    id: ruleId,
    name: 'Frete',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await db.insert(freightRuleVersions).values({
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
  await db.insert(freightCalculations).values({
    adjustments: [],
    baseAmount: '10000.0000',
    calculatedAmount: '350.0000',
    calculationDetails: {},
    companyId: input.companyId,
    correlationId: `correlation-${id}`,
    createdByUserId: input.userId,
    freightRuleId: ruleId,
    freightRuleVersionId: versionId,
    id,
    idempotencyKey: `freight-${id}`,
    nfeDocumentId: input.nfeDocumentId,
    percentage: '0.035000',
    requestFingerprint: `fingerprint-${id}`,
    ruleSnapshot: {},
    ruleVersion: 1n,
    status: 'snapshotted',
    totalAmount: '350.0000',
  })
  return id
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_300',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
