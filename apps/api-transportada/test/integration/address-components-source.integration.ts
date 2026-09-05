/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createDrizzleAddressComponentsSource } from '../../src/routing/infrastructure/drizzle-address-components.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

/**
 * O degrau 2 da escada (adendo 2026-09-01 da ADR-0044) só sabe o que consultar depois de achar o
 * endereço por extenso a partir da chave. **Não achar aqui é o degrau inteiro recusando calado:** o
 * caso de uso responde `not_improved` sem nunca chamar o provedor, e o conferente que marcou a
 * parada lê "não melhorou" e conclui que a marca está quebrada.
 */
describe('address components source', () => {
  testWithPostgres('resolves the components of an address that has a city code', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedAddress(database, { cityCode: '3543402' })

      const components = await createDrizzleAddressComponentsSource(database.db).byAddressKey({
        addressKey: '3543402|14020000|100',
        companyId: world.companyId,
      })

      expect(components).toEqual({
        addressKey: '3543402|14020000|100',
        city: 'Ribeirão Preto',
        cityCode: '3543402',
        district: 'Centro',
        number: '100',
        postalCode: '14020000',
        state: 'SP',
        street: 'Rua Um',
      })
    })
  })

  /**
   * ⚠️ **O caso que estava quebrado.** `concat_ws` **pula argumento nulo**, então com `city_code`
   * nulo o SQL montava `14020000|100` — duas partes — enquanto `buildStopAddressKey` produz
   * `|14020000|100`, porque a normalização dela transforma nulo em vazio. A comparação nunca casava.
   *
   * E `nfe_addresses.city_code` é nulo com frequência nesta base, a ponto de existir um backfill só
   * para ele: o degrau 2 estava indisponível para uma classe inteira de endereço, sem sintoma.
   *
   * Medido no Postgres: `concat_ws('|', NULL, '14020000', '100')` → `14020000|100`.
   */
  testWithPostgres('resolves the components of an address whose city code is null', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedAddress(database, { cityCode: null })

      const components = await createDrizzleAddressComponentsSource(database.db).byAddressKey({
        addressKey: '|14020000|100',
        companyId: world.companyId,
      })

      expect(components?.street).toBe('Rua Um')
      expect(components?.cityCode).toBe('')
      expect(components?.postalCode).toBe('14020000')
    })
  })

  /** A chave de duas partes é a que o defeito produzia: casar com ela devolveria o defeito. */
  testWithPostgres(
    'never answers the two-part key the missing coalesce used to build',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedAddress(database, { cityCode: null })

        const components = await createDrizzleAddressComponentsSource(database.db).byAddressKey({
          addressKey: '14020000|100',
          companyId: world.companyId,
        })

        expect(components).toBeNull()
      })
    },
  )

  /**
   * `geocoded_addresses` não tem tenant, mas o endereço vem da nota: ler a nota de outra empresa
   * para montar a consulta ao provedor seria vazamento com outro nome.
   */
  testWithPostgres('never reads the address of another company', async () => {
    await withDisposableDatabase(async (database) => {
      await seedAddress(database, { cityCode: null })
      const stranger = crypto.randomUUID()
      await database.db.insert(companies).values({ id: stranger, status: 'active' })

      const components = await createDrizzleAddressComponentsSource(database.db).byAddressKey({
        addressKey: '|14020000|100',
        companyId: stranger,
      })

      expect(components).toBeNull()
    })
  })
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function seedAddress(
  database: TestDatabase,
  input: { readonly cityCode: string | null },
): Promise<{ readonly companyId: string }> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const participantId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const digest = crypto.randomUUID().replaceAll('-', '').repeat(2)

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
    id: participantId,
    legalName: 'Destinatário',
    role: 'recipient',
    taxId: '98765432000109',
  })
  await database.db.insert(nfeAddresses).values({
    city: 'Ribeirão Preto',
    cityCode: input.cityCode,
    companyId,
    district: 'Centro',
    id: crypto.randomUUID(),
    number: '100',
    participantId,
    postalCode: '14020-000',
    state: 'SP',
    street: 'Rua Um',
  })

  return { companyId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_components_${crypto.randomUUID().replaceAll('-', '')}`
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
