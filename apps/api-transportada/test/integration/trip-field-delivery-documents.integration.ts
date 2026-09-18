/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T14, ADR-0069 §3, contra o Postgres de verdade: `readTripFieldDeliveryDocuments`
 * devolve a chave de acesso de cada nota da viagem (fix `b1653f25`, T13 — o casamento do OCR por
 * chave inteira precisa dela, e `GET /trips/:id` não a traz, M1 do t7-design.md).
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { trips, tripDocuments } from '../../src/database/trip.schema.js'
import { readTripFieldDeliveryDocuments } from '../../src/trips/infrastructure/trip-field-delivery-documents.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

type Company = { readonly companyId: string; readonly userId: string; readonly vehicleId: string }

async function seedCompany(database: TestDatabase): Promise<Company> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E48',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })

  return { companyId, userId, vehicleId }
}

async function seedNfeDocument(
  database: TestDatabase,
  company: Company,
  input: { readonly accessKeyDigits: string; readonly number: string },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const suffix = documentId.replaceAll('-', '')
  const sha = suffix.padEnd(64, '0').slice(0, 64)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: company.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/field-delivery-documents-${suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: company.companyId,
    correlationId: `correlation-${suffix}`,
    id: importId,
    idempotencyKey: `field-delivery-documents-${suffix}`,
    requestFingerprint: `fingerprint-${suffix}`,
    requestedByUserId: company.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: input.accessKeyDigits.padEnd(44, '0'),
    authorizationProtocol: `protocol-${suffix}`,
    companyId: company.companyId,
    createdByUserId: company.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-18T06:00:00.000Z'),
    model: '55',
    number: input.number,
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

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_156_t14_${crypto.randomUUID().replaceAll('-', '')}`
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

describe('readTripFieldDeliveryDocuments contra o Postgres (spec 156 T14, ADR-0069 §3)', () => {
  testWithPostgres('devolve accessKey, número, série e releasedAt de cada nota', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const tripId = crypto.randomUUID()
      await database.db
        .insert(trips)
        .values({
          companyId: company.companyId,
          id: tripId,
          status: 'in_transit',
          vehicleId: company.vehicleId,
        })

      const loadedDocumentId = crypto.randomUUID()
      const loadedNfeDocumentId = await seedNfeDocument(database, company, {
        accessKeyDigits: '35240912345678000199550010000123456',
        number: '123456',
      })
      await database.db.insert(tripDocuments).values({
        companyId: company.companyId,
        id: loadedDocumentId,
        nfeDocumentId: loadedNfeDocumentId,
        separationStatus: 'loaded',
        tripId,
      })

      const releasedDocumentId = crypto.randomUUID()
      const releasedNfeDocumentId = await seedNfeDocument(database, company, {
        accessKeyDigits: '35240912345678000199550010000654321',
        number: '654321',
      })
      await database.db.insert(tripDocuments).values({
        companyId: company.companyId,
        id: releasedDocumentId,
        nfeDocumentId: releasedNfeDocumentId,
        releasedAt: new Date('2026-09-18T09:00:00.000Z'),
        separationStatus: 'pending',
        tripId,
      })

      const documents = await readTripFieldDeliveryDocuments(database.db, {
        companyId: company.companyId,
        tripId,
      })
      expect(documents).not.toBeNull()
      const byId = new Map((documents ?? []).map((document) => [document.id, document]))

      const loaded = byId.get(loadedDocumentId)
      expect(loaded?.accessKey).toBe('35240912345678000199550010000123456'.padEnd(44, '0'))
      expect(loaded?.nfeNumber).toBe('123456')
      expect(loaded?.nfeSeries).toBe('1')
      expect(loaded?.releasedAt).toBeNull()

      const released = byId.get(releasedDocumentId)
      expect(released?.releasedAt).toBe('2026-09-18T09:00:00.000Z')
    })
  })

  testWithPostgres('viagem de outra empresa devolve null — ausência, nunca 403', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const otherCompany = await seedCompany(database)
      const tripId = crypto.randomUUID()
      await database.db
        .insert(trips)
        .values({
          companyId: company.companyId,
          id: tripId,
          status: 'in_transit',
          vehicleId: company.vehicleId,
        })

      const documents = await readTripFieldDeliveryDocuments(database.db, {
        companyId: otherCompany.companyId,
        tripId,
      })
      expect(documents).toBeNull()
    })
  })
})
