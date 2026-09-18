/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  identityUsers,
  nfeDocuments,
  nfeImports,
  nfePackageBoxes,
  nfeParticipants,
  nfeProducts,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { createExportPendingPackageBoxes } from '../../src/nfe-documents/application/export-pending-package-boxes.use-case'
import { createListPackageBoxes } from '../../src/nfe-documents/application/list-package-boxes.use-case'
import { DrizzlePackageBoxRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const PENDING_COUNT = 4
const EMITTER_TAX_ID = '05868574001090'
const COMMERCIAL_UNIT = 'CX12'
const SHA = 'e'.repeat(64)

/**
 * A exportação do que falta medir contra o Postgres: a mesma fila da tela, inteira, só da empresa
 * do contexto — e o corte no teto é o começo da fila, não um pedaço qualquer dela.
 */
describe('exportar as caixas pendentes (Postgres)', () => {
  testWithPostgres(
    'devolve todas as pendentes da empresa, na ordem da fila, sem a outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const listPackageBoxes = createListPackageBoxes({
          repository: new DrizzlePackageBoxRepository(database.db),
        })
        const exportPending = createExportPendingPackageBoxes({ listPackageBoxes })

        const exported = await exportPending.execute({
          context: { companyId: scenario.companyId },
        })
        const queue = await listPackageBoxes.execute({
          context: { companyId: scenario.companyId },
          filters: { status: 'pending' },
          limit: 200,
        })

        expect(exported.truncated).toBe(false)
        expect(exported.items).toHaveLength(PENDING_COUNT)
        expect(exported.items.map((item) => item.id)).toEqual(queue.items.map((item) => item.id))
        expect(exported.items.map((item) => item.id).toSorted()).toEqual(
          scenario.pendingIds.toSorted(),
        )
        expect(exported.items.map((item) => item.id)).not.toContain(scenario.measuredId)
        expect(exported.items.map((item) => item.id)).not.toContain(scenario.otherCompanyBoxId)
      })
    },
  )

  testWithPostgres('corta no teto e avisa; exatamente no teto não é corte', async () => {
    await withDisposableDatabase(async (database) => {
      const scenario = await seedScenario(database)
      const listPackageBoxes = createListPackageBoxes({
        repository: new DrizzlePackageBoxRepository(database.db),
      })
      const queue = await listPackageBoxes.execute({
        context: { companyId: scenario.companyId },
        filters: { status: 'pending' },
        limit: 200,
      })

      const cut = await createExportPendingPackageBoxes({
        listPackageBoxes,
        maxItems: 2,
      }).execute({ context: { companyId: scenario.companyId } })
      expect(cut.truncated).toBe(true)
      expect(cut.items.map((item) => item.id)).toEqual(
        queue.items.slice(0, 2).map((item) => item.id),
      )

      const exact = await createExportPendingPackageBoxes({
        listPackageBoxes,
        maxItems: PENDING_COUNT,
      }).execute({ context: { companyId: scenario.companyId } })
      expect(exact.truncated).toBe(false)
      expect(exact.items).toHaveLength(PENDING_COUNT)
    })
  })

  testWithPostgres(
    'ordena pelo volume transportado da própria empresa — o da outra não entra na conta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const [p0, p1, p2, p3] = scenario.pendingIds
        await seedTransportedProducts(database, {
          companyId: scenario.companyId,
          products: [
            { productCode: 'P2', quantity: '50.0000' },
            { productCode: 'P0', quantity: '10.0000' },
          ],
        })
        // Mesmo (emitente, cProd, uCom) de P3, noutra empresa: se vazasse, P3 iria para o topo.
        await seedTransportedProducts(database, {
          companyId: scenario.otherCompanyId,
          products: [{ productCode: 'P3', quantity: '1000.0000' }],
        })

        const exported = await createExportPendingPackageBoxes({
          listPackageBoxes: createListPackageBoxes({
            repository: new DrizzlePackageBoxRepository(database.db),
          }),
        }).execute({ context: { companyId: scenario.companyId } })

        const ids = exported.items.map((item) => item.id)
        expect(ids.slice(0, 2)).toEqual([p2!, p0!])
        // Sem volume, o desempate é o id — o mesmo da política da fila.
        expect(ids.slice(2)).toEqual([p1!, p3!].toSorted())
        const volumes = new Map(exported.items.map((item) => [item.id, item.transportedVolumes]))
        expect(volumes.get(p2!)).toBe(50)
        expect(volumes.get(p0!)).toBe(10)
        expect(volumes.get(p3!)).toBe(0)
      })
    },
  )
})

/** Uma NF-e autorizada da empresa, com os produtos dados, do mesmo emitente e unidade das caixas. */
async function seedTransportedProducts(
  database: TestDatabase,
  input: Readonly<{
    companyId: string
    products: readonly Readonly<{ productCode: string; quantity: string }>[]
  }>,
): Promise<void> {
  const userId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const documentId = crypto.randomUUID()

  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId: input.companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${input.companyId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-${input.companyId}`,
    id: importId,
    idempotencyKey: `import-${input.companyId}`,
    requestFingerprint: `fingerprint-${input.companyId}`,
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `352609${EMITTER_TAX_ID}550010000000011000000010`,
    authorizationProtocol: `protocol-${documentId}`,
    companyId: input.companyId,
    createdByUserId: userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-10T12:00:00.000Z'),
    model: '55',
    number: '1',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: SHA,
  })
  await database.db.insert(nfeParticipants).values({
    companyId: input.companyId,
    documentId,
    legalName: 'Emitente Ltda',
    role: 'emitter',
    taxId: EMITTER_TAX_ID,
  })
  await database.db.insert(nfeProducts).values(
    input.products.map((product, index) => ({
      cfop: '5102',
      code: product.productCode,
      commercialUnit: COMMERCIAL_UNIT,
      companyId: input.companyId,
      description: `PRODUTO ${product.productCode}`,
      documentId,
      ncm: '84713012',
      ordinal: BigInt(index + 1),
      quantity: product.quantity,
      totalValue: '10.0000',
      unitValue: '1.0000',
    })),
  )
}

type Scenario = {
  readonly companyId: string
  readonly otherCompanyId: string
  readonly measuredId: string
  readonly otherCompanyBoxId: string
  readonly pendingIds: readonly string[]
}

async function seedScenario(database: TestDatabase): Promise<Scenario> {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const pendingIds = Array.from({ length: PENDING_COUNT }, () => crypto.randomUUID())
  const measuredId = crypto.randomUUID()
  const otherCompanyBoxId = crypto.randomUUID()
  const emitterTaxId = EMITTER_TAX_ID

  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: otherCompanyId, status: 'active' },
  ])

  await database.db.insert(nfePackageBoxes).values([
    ...pendingIds.map((id, index) => ({
      commercialUnit: COMMERCIAL_UNIT,
      companyId,
      description: `CAIXA PENDENTE ${index}`,
      emitterTaxId,
      id,
      productCode: `P${index}`,
    })),
    {
      commercialUnit: COMMERCIAL_UNIT,
      companyId,
      description: 'CAIXA MEDIDA',
      emitterTaxId,
      grossWeightGrams: 500,
      heightMm: 150,
      id: measuredId,
      lengthMm: 300,
      measuredAt: new Date('2026-09-16T12:00:00.000Z'),
      measurementSource: 'typed' as const,
      productCode: 'M1',
      unitsPerBox: 1,
      widthMm: 200,
    },
    {
      commercialUnit: COMMERCIAL_UNIT,
      companyId: otherCompanyId,
      description: 'CAIXA DE OUTRA EMPRESA',
      emitterTaxId,
      id: otherCompanyBoxId,
      productCode: 'P0',
    },
  ])

  return { companyId, measuredId, otherCompanyBoxId, otherCompanyId, pendingIds }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_pkgbox_pending_export_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
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
