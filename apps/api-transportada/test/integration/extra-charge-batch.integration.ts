/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 060 T010–T012 — o repasse contra Postgres de verdade. Três coisas que só o banco prova: a
 * soma do lote em `numeric` (centavo a centavo), o recorte do que entra no fechamento, e o índice
 * parcial que impede a segunda sugestão da mesma nota e tipo.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  contractors,
  deliveryCharges,
  deliveryClients,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, trips } from '../../src/database/trip.schema.js'
import { createExtraChargeBatchesUseCase } from '../../src/delivery-clients/application/extra-charge-batches.use-case.js'
import { DrizzleDeliveryChargeRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { DrizzleExtraChargeBatchRepository } from '../../src/delivery-clients/infrastructure/drizzle-extra-charge-batch.repository.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const TOKEN = 'token-opaco-de-trinta-e-dois-bytes-ou-mais'

describe('o repasse contra Postgres (spec 060 T010–T012)', () => {
  testWithPostgres('fecha o período, soma em numeric e prende só o que foi conferido', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedCharges(database)
      const useCase = buildUseCase(database)

      const batch = await useCase.close({
        context: world.context,
        contractorId: world.contractorId,
        periodEnd: '2026-08-31',
        periodStart: '2026-08-01',
      })

      /** 45,30 + 89,75 = 135,05 — a soma é do Postgres, e centavo não some. */
      expect(batch.totalAmount).toBe('135.0500')

      const rows = await database.db
        .select()
        .from(deliveryCharges)
        .where(eq(deliveryCharges.companyId, world.companyId))
      const byId = new Map(rows.map((row) => [row.id, row]))

      expect(byId.get(world.recordedIds[0] ?? '')?.status).toBe('submitted')
      expect(byId.get(world.recordedIds[1] ?? '')?.status).toBe('submitted')
      expect(byId.get(world.recordedIds[0] ?? '')?.batchId).toBe(batch.id)
      /** Sugestão não confirmada fica fora do lote — e continua na fila, visível como pendência. */
      expect(byId.get(world.suggestedId)?.status).toBe('suggested')
      expect(byId.get(world.suggestedId)?.batchId).toBeNull()
      /** Lançamento fora da janela pertence ao período seguinte. */
      expect(byId.get(world.outOfPeriodId)?.batchId).toBeNull()
      /** Taxa de outro contratante vai para outro lote — uma viagem mistura contratantes. */
      expect(byId.get(world.otherContractorId)?.batchId).toBeNull()
    })
  })

  testWithPostgres('o relatório confere o próprio total, e a decisão por token grava o token', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedCharges(database)
      const useCase = buildUseCase(database)
      const batch = await useCase.close({
        context: world.context,
        contractorId: world.contractorId,
        periodEnd: '2026-08-31',
        periodStart: '2026-08-01',
      })

      const report = await useCase.readReport({ batchId: batch.id, context: world.context })
      expect(report.itemsTotal).toBe(batch.totalAmount)
      expect(report.items).toHaveLength(2)
      expect(report.contractorName).toBe('Spani Atacadista')

      const decided = await useCase.decideByToken({
        accessToken: TOKEN,
        decisions: [
          { chargeId: world.recordedIds[0] ?? '', decision: 'approved', reason: '' },
          { chargeId: world.recordedIds[1] ?? '', decision: 'rejected', reason: 'sem comprovante' },
        ],
      })

      const statuses = decided.items.map((item) => item.status).toSorted()
      expect(statuses).toEqual(['approved', 'rejected'])
      /** Cada lançamento tem estado próprio: o lote fica parcialmente aprovado, nunca travado. */
      expect(decided.itemsTotal).toBe('135.0500')

      const events = (await database.db.execute(
        `select event_name, actor_user_id, decided_by_token from delivery_charge_events
         where charge_id = '${world.recordedIds[0] ?? ''}' order by occurred_at desc limit 1`,
      )) as unknown as ReadonlyArray<{
        readonly actor_user_id: string | null
        readonly decided_by_token: string | null
        readonly event_name: string
      }>

      expect(events[0]?.event_name).toBe('approved')
      expect(events[0]?.actor_user_id).toBeNull()
      expect(events[0]?.decided_by_token).toBe(TOKEN)
    })
  })

  /**
   * Spec 060 D4c: a regra recorrente e a ocorrência do motorista propõem a mesma taxa pelo mesmo
   * motivo. Sem o índice parcial, o operador conferiria duas linhas que são a mesma cobrança.
   */
  testWithPostgres('recusa a segunda sugestão da mesma nota e tipo', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedCharges(database)
      const repository = new DrizzleDeliveryChargeRepository(database.db)
      const parties = {
        contractorId: world.contractorId,
        deliveryClientId: world.deliveryClientId,
        tripId: null,
      }
      const suggestion = {
        amount: '45.0000',
        chargeType: 'unloading' as const,
        chargedOn: '2026-08-10',
        notes: '',
        origin: 'recurring' as const,
        parties,
        status: 'suggested' as const,
        tripDocumentId: world.tripDocumentId,
      }

      const first = await repository.insert({
        actorUserId: null,
        charge: suggestion,
        companyId: world.companyId,
      })
      const second = await repository.insert({
        actorUserId: null,
        charge: { ...suggestion, origin: 'occurrence' },
        companyId: world.companyId,
      })

      expect(first).not.toBeNull()
      expect(second).toBeNull()

      /**
       * E a trava só é completa porque **toda sugestão carrega a nota**: no Postgres dois `null` não
       * colidem, então sugestão sem nota escaparia do índice em silêncio. O banco a recusa.
       */
      await expect(
        repository.insert({
          actorUserId: null,
          charge: { ...suggestion, tripDocumentId: null },
          companyId: world.companyId,
        }),
      ).rejects.toThrow()
    })
  })
})

function buildUseCase(database: TestDatabase) {
  return createExtraChargeBatchesUseCase({
    batches: new DrizzleExtraChargeBatchRepository(database.db),
    charges: new DrizzleDeliveryChargeRepository(database.db),
    createToken: () => TOKEN,
  })
}

type World = {
  readonly companyId: string
  readonly context: CompanyContext
  readonly contractorId: string
  readonly deliveryClientId: string
  readonly otherContractorId: string
  readonly outOfPeriodId: string
  readonly recordedIds: readonly string[]
  readonly suggestedId: string
  readonly tripDocumentId: string
}

async function seedCharges(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const otherContractorRowId = crypto.randomUUID()
  const deliveryClientId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const nfeDocumentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const tripDocumentId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(contractors).values([
    { companyId, displayName: 'Spani Atacadista', id: contractorId, taxId: '30290856000160' },
    { companyId, displayName: 'Outro embarcador', id: otherContractorRowId, taxId: '12345678000190' },
  ])
  await database.db
    .insert(deliveryClients)
    .values({ companyId, displayName: 'Loja Central', id: deliveryClientId, taxId: '98765432000109' })

  /**
   * A nota da viagem existe porque **a sugestão exige nota**: o índice parcial de dedupe é por
   * `(empresa, nota, tipo)`, e sem a nota ele não dedupe nada (dois `null` não colidem).
   */
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'dispatched', vehicleId })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'nfe/charge.xml',
    provider: 's3',
    purpose: 'nfe_document',
    sha256: '1'.repeat(64),
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-charge',
    id: importId,
    idempotencyKey: 'charge',
    requestFingerprint: 'fingerprint-charge',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `9${'1'.repeat(43)}`,
    authorizationProtocol: 'protocol-charge',
    companyId,
    createdByUserId: userId,
    freightValue: '0.0000',
    id: nfeDocumentId,
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
    xmlSha256: '1'.repeat(64),
  })
  await database.db
    .insert(tripDocuments)
    .values({ companyId, id: tripDocumentId, nfeDocumentId, tripId })

  const recordedIds = [crypto.randomUUID(), crypto.randomUUID()]
  const suggestedId = crypto.randomUUID()
  const outOfPeriodId = crypto.randomUUID()
  const otherContractorChargeId = crypto.randomUUID()

  await database.db.insert(deliveryCharges).values([
    {
      amount: '45.3000',
      chargeType: 'unloading',
      chargedOn: '2026-08-10',
      companyId,
      contractorId,
      deliveryClientId,
      id: recordedIds[0] as string,
      origin: 'manual',
      status: 'recorded',
    },
    {
      amount: '89.7500',
      chargeType: 'scheduling',
      chargedOn: '2026-08-20',
      companyId,
      contractorId,
      deliveryClientId,
      id: recordedIds[1] as string,
      origin: 'manual',
      status: 'recorded',
    },
    {
      amount: '10.0000',
      chargeType: 'platform',
      chargedOn: '2026-08-15',
      companyId,
      contractorId,
      deliveryClientId,
      id: suggestedId,
      origin: 'recurring',
      status: 'suggested',
      tripDocumentId,
    },
    {
      amount: '20.0000',
      chargeType: 'unloading',
      chargedOn: '2026-09-02',
      companyId,
      contractorId,
      deliveryClientId,
      id: outOfPeriodId,
      origin: 'manual',
      status: 'recorded',
    },
    {
      amount: '30.0000',
      chargeType: 'unloading',
      chargedOn: '2026-08-11',
      companyId,
      contractorId: otherContractorRowId,
      deliveryClientId,
      id: otherContractorChargeId,
      origin: 'manual',
      status: 'recorded',
    },
  ])

  return {
    companyId,
    context: { companyId, userId } as unknown as CompanyContext,
    contractorId,
    deliveryClientId,
    otherContractorId: otherContractorChargeId,
    outOfPeriodId,
    recordedIds,
    suggestedId,
    tripDocumentId,
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_060_${crypto.randomUUID().replaceAll('-', '')}`
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
