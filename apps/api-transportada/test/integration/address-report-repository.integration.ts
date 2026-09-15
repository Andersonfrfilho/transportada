/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T104 (RF11): o relatório passa a expor o nome do destinatário, lido na **mesma** consulta
 * que já escolhe o emitente — só se prova contra um Postgres de verdade porque a junção precisa do
 * `role` exato gravado pelo worker (`recipient`, nunca `delivery`, que a junção de destino também
 * aceita).
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  addressComparisons,
  companies,
  geocodedAddresses,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createDrizzleAddressReportRepository } from '../../src/addresses/infrastructure/drizzle-address-report.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describe('o relatório traz o nome do destinatário (spec 150 T104, RF11)', () => {
  testWithPostgres('o nome vem do participante de papel recipient, não delivery', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDocument(database, {
        deliveryName: 'DEPOSITO CENTRAL LTDA',
        recipientName: 'JOAO DA SILVA',
      })

      const source = await createDrizzleAddressReportRepository(database.db).read({
        companyId: world.companyId,
      })

      expect(source.measurements).toHaveLength(1)
      expect(source.measurements[0]?.recipientName).toBe('JOAO DA SILVA')
    })
  })

  testWithPostgres('nota sem participante recipient devolve null, nunca quebra', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDocument(database, {
        deliveryName: 'DEPOSITO CENTRAL LTDA',
        recipientName: null,
      })

      const source = await createDrizzleAddressReportRepository(database.db).read({
        companyId: world.companyId,
      })

      expect(source.measurements).toHaveLength(1)
      expect(source.measurements[0]?.recipientName).toBeNull()
    })
  })

  /** ADR-0062: a linha não resolvida segue o mesmo mapa de contexto, e carrega o nome junto. */
  testWithPostgres('o nome também chega na linha não resolvida', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDocument(database, {
        deliveryName: 'DEPOSITO CENTRAL LTDA',
        recipientName: 'MARIA OLIVEIRA',
        unresolved: true,
      })

      const source = await createDrizzleAddressReportRepository(database.db).read({
        companyId: world.companyId,
      })

      expect(source.unresolved).toHaveLength(1)
      expect(source.unresolved[0]?.recipientName).toBe('MARIA OLIVEIRA')
    })
  })
})

async function seedDocument(
  database: TestDatabase,
  input: {
    readonly deliveryName: string
    readonly recipientName: string | null
    readonly unresolved?: boolean
  },
): Promise<{ readonly companyId: string }> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const emitterId = crypto.randomUUID()
  const deliveryId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const digest = crypto.randomUUID().replaceAll('-', '').repeat(2)
  const addressKey = '3543402|14020000|100'

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-${documentId}`,
    id: importId,
    idempotencyKey: documentId,
    requestFingerprint: `fingerprint-${documentId}`,
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${documentId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: digest,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `9${'1'.repeat(43)}`,
    authorizationProtocol: 'protocol-1',
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
    xmlSha256: digest,
  })
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId,
    id: emitterId,
    legalName: 'CONTRATANTE LTDA',
    role: 'emitter',
    taxId: '11222333000181',
  })
  /**
   * `delivery` é o participante que a junção de destino também aceita
   * (`destinationRolesFilter`) — o endereço da nota é o dele, para provar que o nome não vaza
   * dessa linha para o campo `recipientName`.
   */
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId,
    id: deliveryId,
    legalName: input.deliveryName,
    role: 'delivery',
    taxId: '99888777000166',
  })
  if (input.recipientName !== null) {
    await database.db.insert(nfeParticipants).values({
      companyId,
      documentId,
      id: crypto.randomUUID(),
      legalName: input.recipientName,
      role: 'recipient',
      taxId: '22333444000155',
    })
  }
  await database.db.insert(nfeAddresses).values({
    city: 'Ribeirão Preto',
    cityCode: '3543402',
    companyId,
    district: 'Centro',
    id: crypto.randomUUID(),
    number: '100',
    participantId: deliveryId,
    postalCode: '14020-000',
    state: 'SP',
    street: 'Rua Um',
  })

  if (input.unresolved === true) {
    await database.db.insert(geocodedAddresses).values({
      addressKey,
      latitude: '-21.1699984',
      longitude: '-47.8099984',
      paidRefinedAt: new Date('2026-08-11T06:00:00.000Z'),
      precision: 'city',
      source: 'city',
    })
  } else {
    await database.db.insert(addressComparisons).values({
      addressKey,
      companyId,
      districtDiverges: false,
      matchLevel: 'rooftop',
      noteDistrict: 'Centro',
      noteNumber: '100',
      notePostalCode: '14020-000',
      noteStreet: 'Rua Um',
      postalCodeDiverges: false,
      providerDistrict: 'Centro',
      providerNumber: '100',
      providerPostalCode: '14020-000',
      providerStreet: 'Rua Um',
      streetDiverges: false,
    })
  }

  return { companyId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_address_report_${crypto.randomUUID().replaceAll('-', '')}`
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
