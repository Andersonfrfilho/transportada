/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 063 T003 — o recorte do contratante contra Postgres de verdade. Três coisas que só o banco
 * prova: a nota do vizinho não aparece, a nota que ainda não entrou em viagem aparece, e a nota
 * desvinculada da viagem volta a ser nota sem viagem em vez de nota entregue por ela.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  contractorPortalBindings,
  contractors,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, trips } from '../../src/database/trip.schema.js'
import { createReadContractorDeliveriesUseCase } from '../../src/contractor-portal/application/read-contractor-deliveries.use-case.js'
import { ContractorNotBoundError } from '../../src/contractor-portal/domain/contractor-portal.error.js'
import { DrizzleContractorPortalRepository } from '../../src/contractor-portal/infrastructure/drizzle-contractor-portal.repository.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const OWN_TAX_ID = '30290856000160'
const OTHER_TAX_ID = '12345678000190'

describe('o portal do contratante contra Postgres (spec 063 T003)', () => {
  testWithPostgres('mostra só as notas dos documentos amarrados à conta', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedPortal(database)
      const useCase = createReadContractorDeliveriesUseCase({
        repository: new DrizzleContractorPortalRepository(database.db),
      })

      const deliveries = await useCase({ context: world.context })
      const byNumber = new Map(deliveries.map((delivery) => [delivery.number, delivery]))

      /** A nota do vizinho existe na mesma empresa, e não aparece. É o teste que importa. */
      expect(byNumber.has('900003')).toBe(false)

      /** Nota em viagem: o estado da separação e o da viagem chegam ao portal. */
      expect(byNumber.get('900001')?.separationStatus).toBe('loaded')
      expect(byNumber.get('900001')?.tripStatus).toBe('dispatched')

      /** Nota importada e ainda parada é "recebida", não ausência. */
      expect(byNumber.get('900002')?.separationStatus).toBeNull()
      expect(byNumber.get('900002')?.tripStatus).toBeNull()

      /** Nota desvinculada volta a ser nota sem viagem, não nota entregue por aquela. */
      expect(byNumber.get('900004')?.separationStatus).toBeNull()
      expect(byNumber.get('900004')?.tripStatus).toBeNull()

      expect(deliveries).toHaveLength(3)
    })
  })

  testWithPostgres(
    'a conta sem vínculo é recusada, e a de outro contratante não empresta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedPortal(database)
        const useCase = createReadContractorDeliveriesUseCase({
          repository: new DrizzleContractorPortalRepository(database.db),
        })

        await expect(useCase({ context: world.unboundContext })).rejects.toBeInstanceOf(
          ContractorNotBoundError,
        )
      })
    },
  )

  testWithPostgres('contratante inativado fecha o portal da conta dele', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedPortal(database)
      const repository = new DrizzleContractorPortalRepository(database.db)
      const useCase = createReadContractorDeliveriesUseCase({ repository })

      await database.db.update(contractors).set({ status: 'inactive' })

      await expect(useCase({ context: world.context })).rejects.toBeInstanceOf(
        ContractorNotBoundError,
      )
    })
  })
})

type World = {
  readonly context: CompanyContext
  readonly unboundContext: CompanyContext
}

async function seedPortal(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const unboundUserId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const unboundMembershipId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const otherContractorId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values([
    { id: userId, status: 'active' },
    { id: unboundUserId, status: 'active' },
  ])
  await database.db.insert(userCompanyMemberships).values([
    { companyId, id: membershipId, status: 'active', userId },
    { companyId, id: unboundMembershipId, status: 'active', userId: unboundUserId },
  ])
  await database.db.insert(contractors).values([
    { companyId, displayName: 'Spani Atacadista', id: contractorId, taxId: OWN_TAX_ID },
    { companyId, displayName: 'Outro embarcador', id: otherContractorId, taxId: OTHER_TAX_ID },
  ])
  await database.db
    .insert(contractorPortalBindings)
    .values({ companyId, contractorId, id: crypto.randomUUID(), membershipId })

  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'dispatched', vehicleId })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-portal',
    id: importId,
    idempotencyKey: 'portal',
    requestFingerprint: 'fingerprint-portal',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })

  const documents = [
    { number: '900001', taxId: OWN_TAX_ID, trip: 'linked' as const },
    { number: '900002', taxId: OWN_TAX_ID, trip: 'none' as const },
    { number: '900003', taxId: OTHER_TAX_ID, trip: 'none' as const },
    { number: '900004', taxId: OWN_TAX_ID, trip: 'released' as const },
  ]

  for (const [index, document] of documents.entries()) {
    const documentId = crypto.randomUUID()
    const xmlObjectId = crypto.randomUUID()
    await database.db.insert(storedObjects).values({
      bucket: 'integration',
      companyId,
      id: xmlObjectId,
      mimeType: 'application/xml',
      objectKey: `nfe/portal-${document.number}.xml`,
      provider: 's3',
      purpose: 'nfe_document',
      sha256: String(index + 1).repeat(64),
      sizeBytes: 100n,
      status: 'final',
    })
    await database.db.insert(nfeDocuments).values({
      accessKey: `${9 - index}${'1'.repeat(43)}`,
      authorizationProtocol: `protocol-${document.number}`,
      companyId,
      createdByUserId: userId,
      freightValue: '0.0000',
      id: documentId,
      importId,
      issuedAt: new Date(`2026-08-1${index}T06:00:00.000Z`),
      model: '55',
      number: document.number,
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '1000.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: '1000.0000',
      xmlObjectId,
      xmlSha256: String(index + 1).repeat(64),
    })
    await database.db.insert(nfeParticipants).values({
      companyId,
      documentId,
      id: crypto.randomUUID(),
      legalName: 'Participante',
      role: 'recipient',
      taxId: document.taxId,
    })

    if (document.trip === 'none') continue

    await database.db.insert(tripDocuments).values({
      companyId,
      id: crypto.randomUUID(),
      nfeDocumentId: documentId,
      separationStatus: 'loaded',
      tripId,
      ...(document.trip === 'released' ? { releasedAt: new Date() } : {}),
    })
  }

  return {
    context: { companyId, membershipId, userId } as unknown as CompanyContext,
    unboundContext: {
      companyId,
      membershipId: unboundMembershipId,
      userId: unboundUserId,
    } as unknown as CompanyContext,
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_063_${crypto.randomUUID().replaceAll('-', '')}`
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
