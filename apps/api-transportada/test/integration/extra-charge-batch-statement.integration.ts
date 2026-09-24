/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20 (RF29/RF30) contra Postgres de verdade. Quatro coisas que só o banco prova: o
 * demonstrativo nasce **no fechamento** e fica guardado em `stored_objects` com o propósito novo (o
 * CHECK da migration aceita); a leitura serve o arquivo guardado, sem recomputar; a foto fora do
 * prazo de guarda vira selo e **não é baixada**; e nada fiscal é escrito — provado por **contagem
 * lida antes e depois**, não por ausência de erro.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  contractors,
  deliveryCharges,
  deliveryClients,
  extraChargeBatches,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrences,
  tripDocuments,
  trips,
} from '../../src/database/trip.schema.js'
import { createExtraChargeBatchesUseCase } from '../../src/delivery-clients/application/extra-charge-batches.use-case.js'
import type { OccurrenceStatementArchivePort } from '../../src/delivery-clients/application/occurrence-statement.port.js'
import { EXTRA_CHARGE_BATCH_STATEMENT_PURPOSE } from '../../src/delivery-clients/application/occurrence-statement.port.js'
import { createOccurrenceStatementUseCase } from '../../src/delivery-clients/application/occurrence-statement.use-case.js'
import { DrizzleDeliveryChargeRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { DrizzleExtraChargeBatchRepository } from '../../src/delivery-clients/infrastructure/drizzle-extra-charge-batch.repository.js'
import { DrizzleOccurrenceStatementRepository } from '../../src/delivery-clients/infrastructure/drizzle-occurrence-statement.repository.js'
import { createOccurrenceStatementPdfGateway } from '../../src/delivery-clients/infrastructure/occurrence-statement-pdf.gateway.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const TOKEN = 'token-opaco-de-trinta-e-dois-bytes-ou-mais'
const LIVE_PHOTO_KEY = 'occurrences/live-thumbnail.jpg'
const EXPIRED_PHOTO_KEY = 'occurrences/expired-original.jpg'

/**
 * As tabelas que **não podem** ganhar linha nenhuma por causa do demonstrativo. É a lista do Risco 6
 * do `plan.md`: confundir o demonstrativo com documento fiscal é o erro caro.
 */
const FISCAL_TABLES = [
  'billing_invoices',
  'billing_invoice_items',
  'billing_invoice_documents',
  'cte_fiscal_documents',
  'cte_issuance_attempts',
  'nfse_service_invoices',
  'fiscal_sequences',
  'fiscal_sequence_reservations',
] as const

describe('o demonstrativo de ressarcimento contra Postgres (spec 164 T20)', () => {
  testWithPostgres(
    'nasce no fechamento, guarda no propósito novo e é servido de lá — sem tocar em nada fiscal',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedBatchWorld(database)
        const archive = buildArchive()
        const statements = buildStatementUseCase({ archive, database })
        const useCase = buildUseCase({ database, statements })

        const fiscalBefore = await countFiscalRows(database)

        const batch = await useCase.close({
          context: world.context,
          contractorId: world.contractorId,
          periodEnd: '2026-09-30',
          periodStart: '2026-09-01',
        })

        const [batchRow] = await database.db
          .select({ statementObjectId: extraChargeBatches.statementObjectId })
          .from(extraChargeBatches)
          .where(eq(extraChargeBatches.id, batch.id))
        expect(batchRow?.statementObjectId).not.toBeNull()

        const [objectRow] = await database.db
          .select()
          .from(storedObjects)
          .where(
            and(
              eq(storedObjects.companyId, world.companyId),
              eq(storedObjects.purpose, EXTRA_CHARGE_BATCH_STATEMENT_PURPOSE),
            ),
          )
        expect(objectRow?.status).toBe('final')
        expect(objectRow?.mimeType).toBe('application/pdf')
        /** Prazo de guarda próprio, mais longo que o da foto — é o que faz a prova sobreviver. */
        expect(objectRow?.retentionUntil).not.toBeNull()
        expect(Number(objectRow?.sizeBytes ?? 0n)).toBeGreaterThan(0)

        /** A foto viva foi baixada; a fora do prazo de guarda **não** — ela vira selo textual. */
        expect(archive.requestedKeys).toContain(LIVE_PHOTO_KEY)
        expect(archive.requestedKeys).not.toContain(EXPIRED_PHOTO_KEY)

        const document = await statements.read({ batchId: batch.id, context: world.context })
        expect(document.contentType).toBe('application/pdf')
        expect(Buffer.from(document.bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-')
        expect(document.fileName).toBe(`demonstrativo-ressarcimento-${batch.id}.pdf`)

        /** Ler duas vezes devolve o **mesmo** arquivo: artefato imutável, nunca recomputado. */
        const again = await statements.read({ batchId: batch.id, context: world.context })
        expect(again.bytes.byteLength).toBe(document.bytes.byteLength)
        expect(archive.putCount).toBe(1)

        const fiscalAfter = await countFiscalRows(database)
        expect(fiscalAfter).toEqual(fiscalBefore)
      })
    },
  )

  testWithPostgres('lote sem demonstrativo recusa a leitura em vez de inventar um', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedBatchWorld(database)
      const archive = buildArchive()
      const statements = buildStatementUseCase({ archive, database })
      /** Fechamento **sem** a porta do demonstrativo: é o lote fechado antes desta spec. */
      const useCase = buildUseCase({ database })

      const batch = await useCase.close({
        context: world.context,
        contractorId: world.contractorId,
        periodEnd: '2026-09-30',
        periodStart: '2026-09-01',
      })

      await expect(statements.read({ batchId: batch.id, context: world.context })).rejects.toThrow(
        'This extra charge batch has no statement document',
      )
      expect(archive.putCount).toBe(0)
    })
  })
})

type FakeArchive = OccurrenceStatementArchivePort & {
  readonly requestedKeys: string[]
  putCount: number
}

function buildArchive(): FakeArchive {
  const stored = new Map<string, Uint8Array>()
  const archive: FakeArchive = {
    async loadObject(location) {
      archive.requestedKeys.push(location.objectKey)
      return stored.get(location.objectKey) ?? new Uint8Array([1, 2, 3, 4])
    },
    async put(document) {
      archive.putCount += 1
      const objectKey = `statements/${document.batchId}/${document.objectId}.pdf`
      stored.set(objectKey, document.bytes)
      return { bucket: 'integration', objectKey, provider: 'object-storage' }
    },
    putCount: 0,
    requestedKeys: [],
  }
  return archive
}

function buildStatementUseCase(input: {
  readonly archive: OccurrenceStatementArchivePort
  readonly database: TestDatabase
}) {
  return createOccurrenceStatementUseCase({
    archive: input.archive,
    clock: () => new Date('2026-09-22T12:00:00.000Z'),
    createObjectId: () => crypto.randomUUID(),
    renderer: createOccurrenceStatementPdfGateway(),
    repository: new DrizzleOccurrenceStatementRepository(input.database.db),
    sha256: () => 'a'.repeat(64),
  })
}

function buildUseCase(input: {
  readonly database: TestDatabase
  readonly statements?: ReturnType<typeof buildStatementUseCase>
}) {
  const { statements } = input
  return createExtraChargeBatchesUseCase({
    batches: new DrizzleExtraChargeBatchRepository(input.database.db),
    charges: new DrizzleDeliveryChargeRepository(input.database.db),
    createToken: () => TOKEN,
    ...(statements === undefined
      ? {}
      : { statement: { generate: (generateInput) => statements.generate(generateInput) } }),
  })
}

async function countFiscalRows(database: TestDatabase): Promise<Readonly<Record<string, number>>> {
  const counts: Record<string, number> = {}
  for (const table of FISCAL_TABLES) {
    const rows = (await database.db.execute(
      `select count(*)::int as total from "${table}"`,
    )) as unknown as ReadonlyArray<{ readonly total: number }>
    counts[table] = rows[0]?.total ?? 0
  }
  return counts
}

type World = {
  readonly companyId: string
  readonly context: CompanyContext
  readonly contractorId: string
}

async function seedBatchWorld(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const deliveryClientId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const nfeDocumentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const tripDocumentId = crypto.randomUUID()
  const occurrenceTypeId = crypto.randomUUID()
  const occurrenceId = crypto.randomUUID()
  const livePhotoObjectId = crypto.randomUUID()
  const liveThumbnailObjectId = crypto.randomUUID()
  const expiredPhotoObjectId = crypto.randomUUID()
  const expiredOccurrenceId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(contractors).values({
    companyId,
    displayName: 'Spani Atacadista',
    id: contractorId,
    taxId: '30290856000160',
  })
  await database.db.insert(deliveryClients).values({
    companyId,
    displayName: 'Loja Central',
    id: deliveryClientId,
    taxId: '98765432000109',
  })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'dispatched', vehicleId })
  await database.db.insert(storedObjects).values([
    {
      bucket: 'integration',
      companyId,
      id: xmlObjectId,
      mimeType: 'application/xml',
      objectKey: 'nfe/statement.xml',
      provider: 's3',
      purpose: 'nfe_document',
      sha256: '1'.repeat(64),
      sizeBytes: 100n,
      status: 'final',
    },
    {
      bucket: 'integration',
      companyId,
      id: livePhotoObjectId,
      mimeType: 'image/jpeg',
      objectKey: 'occurrences/live-original.jpg',
      provider: 's3',
      purpose: 'trip_occurrence_attachment',
      retentionUntil: new Date('2027-01-01T00:00:00.000Z'),
      sha256: '2'.repeat(64),
      sizeBytes: 2048n,
      status: 'final',
    },
    {
      bucket: 'integration',
      companyId,
      id: liveThumbnailObjectId,
      mimeType: 'image/jpeg',
      objectKey: LIVE_PHOTO_KEY,
      provider: 's3',
      purpose: 'trip_occurrence_thumbnail',
      retentionUntil: new Date('2027-01-01T00:00:00.000Z'),
      sha256: '3'.repeat(64),
      sizeBytes: 512n,
      status: 'final',
    },
    {
      bucket: 'integration',
      companyId,
      id: expiredPhotoObjectId,
      mimeType: 'image/jpeg',
      objectKey: EXPIRED_PHOTO_KEY,
      provider: 's3',
      purpose: 'trip_occurrence_attachment',
      /** ⚠️ O expurgo da spec 161 é cego à cobrança: esta foto já passou do prazo de guarda. */
      retentionUntil: new Date('2026-01-01T00:00:00.000Z'),
      sha256: '4'.repeat(64),
      sizeBytes: 2048n,
      status: 'final',
    },
  ])
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-statement',
    id: importId,
    idempotencyKey: 'statement',
    requestFingerprint: 'fingerprint-statement',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `9${'2'.repeat(43)}`,
    authorizationProtocol: 'protocol-statement',
    companyId,
    createdByUserId: userId,
    freightValue: '0.0000',
    id: nfeDocumentId,
    importId,
    issuedAt: new Date('2026-09-10T06:00:00.000Z'),
    model: '55',
    number: '900002',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: '2'.repeat(64),
  })
  await database.db
    .insert(tripDocuments)
    .values({ companyId, id: tripDocumentId, nfeDocumentId, tripId })
  await database.db.insert(companyOccurrenceTypes).values({
    companyId,
    id: occurrenceTypeId,
    name: 'Avaria na separação',
    stage: 'separation',
  })
  await database.db.insert(tripDocumentOccurrences).values([
    {
      actorUserId: userId,
      companyId,
      id: occurrenceId,
      note: 'Caixa violada na descarga.',
      occurrenceTypeId,
      productCode: 'SKU-1',
      stage: 'separation',
      tripDocumentId,
    },
    {
      actorUserId: userId,
      companyId,
      id: expiredOccurrenceId,
      note: 'Produto molhado.',
      occurrenceTypeId,
      productCode: 'SKU-9',
      stage: 'separation',
      tripDocumentId,
    },
  ])
  await database.db.insert(tripDocumentOccurrenceAttachments).values([
    {
      companyId,
      id: crypto.randomUUID(),
      occurrenceId,
      position: 1,
      storedObjectId: livePhotoObjectId,
      thumbnailObjectId: liveThumbnailObjectId,
    },
    {
      companyId,
      id: crypto.randomUUID(),
      occurrenceId: expiredOccurrenceId,
      position: 1,
      storedObjectId: expiredPhotoObjectId,
    },
  ])

  await database.db.insert(deliveryCharges).values([
    {
      amount: '135.0500',
      chargeType: 'returned_goods',
      chargedOn: '2026-09-10',
      companyId,
      contractorId,
      deliveryClientId,
      id: crypto.randomUUID(),
      occurrenceId,
      origin: 'occurrence',
      status: 'recorded',
      tripDocumentId,
    },
    {
      amount: '64.9500',
      chargeType: 'returned_goods',
      chargedOn: '2026-09-12',
      companyId,
      contractorId,
      deliveryClientId,
      id: crypto.randomUUID(),
      occurrenceId: expiredOccurrenceId,
      origin: 'occurrence',
      status: 'recorded',
      tripDocumentId,
    },
  ])

  return { companyId, context: { companyId, userId } as unknown as CompanyContext, contractorId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_164_${crypto.randomUUID().replaceAll('-', '')}`
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
