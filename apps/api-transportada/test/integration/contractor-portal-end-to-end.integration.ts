/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 063 T011 — o portal do contratante de ponta a ponta, contra Postgres, pelos **use cases de
 * verdade**: listar, agendar, ver a posição, conferir o repasse e decidir linha a linha. E, ao lado
 * disso, a pergunta que a spec chamou de enumeração: o que o contratante consegue descobrir sobre o
 * que não é dele. A resposta tem de ser: nada — e a prova é que a recusa é **idêntica** à ausência.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  contractorPortalBindings,
  contractors,
  deliveryChargeEvents,
  deliveryCharges,
  deliveryClients,
  extraChargeBatches,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  membershipRoles,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../src/database/trip.schema.js'
import { createContractorExtraChargesUseCase } from '../../src/contractor-portal/application/contractor-extra-charges.use-case.js'
import { createReadContractorDeliveriesUseCase } from '../../src/contractor-portal/application/read-contractor-deliveries.use-case.js'
import { createReadContractorDeliveryLocationUseCase } from '../../src/contractor-portal/application/read-contractor-delivery-location.use-case.js'
import { createScheduleContractorDeliveryUseCase } from '../../src/contractor-portal/application/schedule-contractor-delivery.use-case.js'
import {
  ContractorBatchNotFoundError,
  ContractorDeliveryNotFoundError,
} from '../../src/contractor-portal/domain/contractor-portal.error.js'
import { DrizzleContractorPortalRepository } from '../../src/contractor-portal/infrastructure/drizzle-contractor-portal.repository.js'
import { createExtraChargeBatchesUseCase } from '../../src/delivery-clients/application/extra-charge-batches.use-case.js'
import { DrizzleExtraChargeBatchRepository } from '../../src/delivery-clients/infrastructure/drizzle-extra-charge-batch.repository.js'
import { DrizzleDeliveryChargeRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { createTripStopSchedulesUseCase } from '../../src/delivery-clients/application/trip-stop-schedule.use-case.js'
import { DrizzleTripStopScheduleRepository } from '../../src/delivery-clients/infrastructure/drizzle-trip-stop-schedule.repository.js'
import { createRecordTripLocationUseCase } from '../../src/trips/application/record-trip-location.use-case.js'
import { DrizzleTripLocationRepository } from '../../src/trips/infrastructure/drizzle-trip-location.repository.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const OWN_TAX_ID = '30290856000160'
const OTHER_TAX_ID = '12345678000190'
const OWN_ACCESS_KEY = `9${'1'.repeat(43)}`
const OTHER_ACCESS_KEY = `8${'2'.repeat(43)}`
const UNKNOWN_ACCESS_KEY = `7${'3'.repeat(43)}`
const UNKNOWN_BATCH_ID = '00000000-0000-4000-8000-000000000999'
/** O token é único no banco inteiro: dois mundos semeados na mesma base precisam de tokens diferentes. */
function disposableToken(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}${crypto.randomUUID()}`
}

describe('o portal do contratante de ponta a ponta (spec 063 T011)', () => {
  testWithPostgres('lista, agenda, acompanha e decide o repasse', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedWorld(database)
      const portal = buildPortal(database)

      /** 1. A lista: a nota dele aparece; a do vizinho, que existe na mesma empresa, não. */
      const deliveries = await portal.readDeliveries({ context: world.context })
      expect(deliveries.map((delivery) => delivery.accessKey)).toEqual([OWN_ACCESS_KEY])

      /** 2. O agendamento entra pela máquina da 060 — e é lá que ele fica gravado. */
      const schedule = await portal.schedule({
        accessKey: OWN_ACCESS_KEY,
        context: world.context,
        values: {
          notes: 'Doca 3',
          protocol: 'AG-2026-88',
          scheduledAt: '2026-08-28T13:00:00.000Z',
          status: 'confirmed',
        },
      })
      expect(schedule.status).toBe('confirmed')
      expect(schedule.protocol).toBe('AG-2026-88')

      /** 3. A posição: sem consentimento não há rastro; com ele, o portal vê coordenada e hora. */
      expect(
        await portal.readLocation({ accessKey: OWN_ACCESS_KEY, context: world.context }),
      ).toBeNull()

      await portal.locations.setConsent({
        accepted: true,
        companyId: world.companyId,
        driverId: world.driverId,
      })
      const recorded = await portal.recordLocation({
        companyId: world.companyId,
        driverId: world.driverId,
        latitude: '-21.1767000',
        longitude: '-47.8208000',
      })
      expect(recorded.outcome).toBe('recorded')

      const position = await portal.readLocation({
        accessKey: OWN_ACCESS_KEY,
        context: world.context,
      })
      expect(Object.keys(position ?? {}).sort()).toEqual(['latitude', 'longitude', 'recordedAt'])

      /** 4. O repasse: o lote dele aparece, e o total do relatório confere com a soma das linhas. */
      const batches = await portal.charges.list({ context: world.context })
      expect(batches).toHaveLength(1)
      expect(batches[0]?.itemsTotal).toBe('135.0500')

      /** 5. A decisão é linha a linha, e a recusa carrega o motivo daquela cobrança. */
      const report = await portal.charges.decide({
        batchId: world.batchId,
        context: world.context,
        decisions: [
          { chargeId: world.approvedChargeId, decision: 'approved', reason: '' },
          { chargeId: world.rejectedChargeId, decision: 'rejected', reason: 'Não houve descarga' },
        ],
      })
      const byId = new Map(report.items.map((item) => [item.id, item]))
      expect(byId.get(world.approvedChargeId)?.status).toBe('approved')
      expect(byId.get(world.rejectedChargeId)?.status).toBe('rejected')
      expect(byId.get(world.rejectedChargeId)?.rejectionReason).toBe('Não houve descarga')

      /**
       * A trilha guarda **quem** decidiu, e aqui quem decidiu é a conta do contratante — não um
       * token, como na página pública da 060. É essa a razão de o portal ter conta em vez de link.
       */
      const [decided] = await database.db
        .select({
          actorUserId: deliveryChargeEvents.actorUserId,
          decidedByToken: deliveryChargeEvents.decidedByToken,
        })
        .from(deliveryChargeEvents)
        .where(
          and(
            eq(deliveryChargeEvents.companyId, world.companyId),
            eq(deliveryChargeEvents.chargeId, world.approvedChargeId),
            eq(deliveryChargeEvents.eventName, 'approved'),
          ),
        )
      expect(decided?.actorUserId).toBe(world.userId)
      expect(decided?.decidedByToken).toBeNull()
    })
  })

  /**
   * A enumeração, no desenho de conta: o contratante autenticado tenta descobrir o que não é dele.
   * **A recusa tem de ser indistinguível da ausência** — se "não é sua" respondesse diferente de
   * "não existe", bastaria varrer chaves de acesso para mapear a carteira da transportadora.
   */
  testWithPostgres('não distingue "não é sua" de "não existe", em nenhuma das rotas', async () => {
    await withSharedDatabase(async (database) => {
      const world = await seedWorld(database)
      const portal = buildPortal(database)

      const neighbourKey = portal
        .readLocation({ accessKey: OTHER_ACCESS_KEY, context: world.context })
        .catch((error: unknown) => error)
      const inventedKey = portal
        .readLocation({ accessKey: UNKNOWN_ACCESS_KEY, context: world.context })
        .catch((error: unknown) => error)

      const [neighbour, invented] = await Promise.all([neighbourKey, inventedKey])
      expect(neighbour).toBeInstanceOf(ContractorDeliveryNotFoundError)
      expect(serializeError(neighbour)).toEqual(serializeError(invented))

      const neighbourSchedule = await portal
        .schedule({
          accessKey: OTHER_ACCESS_KEY,
          context: world.context,
          values: { notes: '', protocol: '', scheduledAt: null, status: 'refused' },
        })
        .catch((error: unknown) => error)
      const inventedSchedule = await portal
        .schedule({
          accessKey: UNKNOWN_ACCESS_KEY,
          context: world.context,
          values: { notes: '', protocol: '', scheduledAt: null, status: 'refused' },
        })
        .catch((error: unknown) => error)
      expect(serializeError(neighbourSchedule)).toEqual(serializeError(inventedSchedule))

      const neighbourBatch = await portal.charges
        .decide({ batchId: world.otherBatchId, context: world.context, decisions: [] })
        .catch((error: unknown) => error)
      const inventedBatch = await portal.charges
        .decide({ batchId: UNKNOWN_BATCH_ID, context: world.context, decisions: [] })
        .catch((error: unknown) => error)
      expect(neighbourBatch).toBeInstanceOf(ContractorBatchNotFoundError)
      expect(serializeError(neighbourBatch)).toEqual(serializeError(inventedBatch))

      /** E a recusa não escreve nada: a tentativa no lote do vizinho não decide lançamento dele. */
      const [untouched] = await database.db
        .select({ status: deliveryCharges.status })
        .from(deliveryCharges)
        .where(
          and(
            eq(deliveryCharges.companyId, world.companyId),
            eq(deliveryCharges.id, world.otherChargeId),
          ),
        )
      expect(untouched?.status).toBe('submitted')
    })
  })
})

function serializeError(error: unknown): { code: string; status: number } {
  const record = error as { code?: unknown; status?: unknown }

  return {
    code: typeof record.code === 'string' ? record.code : 'UNKNOWN',
    status: typeof record.status === 'number' ? record.status : 0,
  }
}

function buildPortal(database: TestDatabase) {
  const repository = new DrizzleContractorPortalRepository(database.db)
  const locations = new DrizzleTripLocationRepository(database.db)
  const schedules = createTripStopSchedulesUseCase({
    repository: new DrizzleTripStopScheduleRepository(database.db),
  })
  const batches = createExtraChargeBatchesUseCase({
    batches: new DrizzleExtraChargeBatchRepository(database.db),
    charges: new DrizzleDeliveryChargeRepository(database.db),
    createToken: () => `token-de-teste-${crypto.randomUUID()}`,
  })

  return {
    charges: createContractorExtraChargesUseCase({ batches, repository }),
    locations,
    readDeliveries: createReadContractorDeliveriesUseCase({ repository }),
    readLocation: createReadContractorDeliveryLocationUseCase({ locations, repository }),
    recordLocation: createRecordTripLocationUseCase({ repository: locations }),
    schedule: createScheduleContractorDeliveryUseCase({ repository, schedules }),
  }
}

type World = {
  readonly approvedChargeId: string
  readonly batchId: string
  readonly companyId: string
  readonly context: CompanyContext
  readonly driverId: string
  readonly otherBatchId: string
  readonly otherChargeId: string
  readonly rejectedChargeId: string
  readonly userId: string
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const otherContractorId = crypto.randomUUID()
  const deliveryClientId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const importId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(membershipRoles).values({ membershipId, role: 'contractor' })
  await database.db.insert(contractors).values([
    { companyId, displayName: 'Spani Atacadista', id: contractorId, taxId: OWN_TAX_ID },
    { companyId, displayName: 'Outro embarcador', id: otherContractorId, taxId: OTHER_TAX_ID },
  ])
  await database.db
    .insert(contractorPortalBindings)
    .values({ companyId, contractorId, id: crypto.randomUUID(), membershipId })
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
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    name: 'Motorista da carga',
    taxId: '12345678909',
  })
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'dispatched', vehicleId })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Motorista da carga',
    driverTaxId: '12345678909',
    id: crypto.randomUUID(),
    position: 1n,
    tripId,
  })
  await database.db.insert(tripStops).values({
    addressKey: '14020000|100|3543402',
    companyId,
    id: stopId,
    label: 'Loja Central',
    sequence: 1n,
    tripId,
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-e2e',
    id: importId,
    idempotencyKey: 'e2e',
    requestFingerprint: 'fingerprint-e2e',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })

  const documents = [
    { accessKey: OWN_ACCESS_KEY, linked: true, number: '900001', taxId: OWN_TAX_ID },
    { accessKey: OTHER_ACCESS_KEY, linked: true, number: '900002', taxId: OTHER_TAX_ID },
  ]

  for (const [index, document] of documents.entries()) {
    const documentId = crypto.randomUUID()
    const xmlObjectId = crypto.randomUUID()
    await database.db.insert(storedObjects).values({
      bucket: 'integration',
      companyId,
      id: xmlObjectId,
      mimeType: 'application/xml',
      objectKey: `nfe/e2e-${document.number}.xml`,
      provider: 's3',
      purpose: 'nfe_document',
      sha256: String(index + 1).repeat(64),
      sizeBytes: 100n,
      status: 'final',
    })
    await database.db.insert(nfeDocuments).values({
      accessKey: document.accessKey,
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
    const participantId = crypto.randomUUID()
    await database.db.insert(nfeParticipants).values({
      companyId,
      documentId,
      id: participantId,
      legalName: 'Participante',
      role: 'recipient',
      taxId: document.taxId,
    })
    await database.db.insert(nfeAddresses).values({
      city: 'Ribeirão Preto',
      cityCode: '3543402',
      companyId,
      district: 'Centro',
      id: crypto.randomUUID(),
      number: '100',
      participantId,
      postalCode: '14020000',
      state: 'SP',
      street: 'Rua Um',
    })
    await database.db.insert(tripDocuments).values({
      companyId,
      id: crypto.randomUUID(),
      nfeDocumentId: documentId,
      separationStatus: 'loaded',
      stopId,
      tripId,
    })
  }

  const approvedChargeId = crypto.randomUUID()
  const rejectedChargeId = crypto.randomUUID()
  const otherChargeId = crypto.randomUUID()
  const batchId = crypto.randomUUID()
  const otherBatchId = crypto.randomUUID()

  await database.db.insert(extraChargeBatches).values([
    {
      accessToken: disposableToken('token-do-lote-do-contratante'),
      closedByUserId: userId,
      companyId,
      contractorId,
      id: batchId,
      periodEnd: '2026-08-31',
      periodStart: '2026-08-01',
    },
    {
      accessToken: disposableToken('token-do-lote-do-vizinho'),
      closedByUserId: userId,
      companyId,
      contractorId: otherContractorId,
      id: otherBatchId,
      periodEnd: '2026-08-31',
      periodStart: '2026-08-01',
    },
  ])
  await database.db.insert(deliveryCharges).values([
    {
      amount: '45.3000',
      batchId,
      chargedOn: '2026-08-10',
      chargeType: 'unloading',
      companyId,
      contractorId,
      deliveryClientId,
      id: approvedChargeId,
      origin: 'manual',
      status: 'submitted',
    },
    {
      amount: '89.7500',
      batchId,
      chargedOn: '2026-08-20',
      chargeType: 'scheduling',
      companyId,
      contractorId,
      deliveryClientId,
      id: rejectedChargeId,
      origin: 'manual',
      status: 'submitted',
    },
    {
      amount: '30.0000',
      batchId: otherBatchId,
      chargedOn: '2026-08-11',
      chargeType: 'unloading',
      companyId,
      contractorId: otherContractorId,
      deliveryClientId,
      id: otherChargeId,
      origin: 'manual',
      status: 'submitted',
    },
  ])

  return {
    approvedChargeId,
    batchId,
    companyId,
    context: { companyId, membershipId, userId } as unknown as CompanyContext,
    driverId,
    otherBatchId,
    otherChargeId,
    rejectedChargeId,
    userId,
  }
}

let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_063_e2e_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${name}"`)
    await runDatabaseMigrations({ connectionString: url.toString() })
    shared = { database: createDrizzleProvider({ connection: url.toString() }), name }
  } finally {
    await admin.close({ timeout: 0 })
  }
})

afterAll(async () => {
  if (databaseUrl === undefined || shared === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    await shared.database.close()
    await admin.unsafe(`drop database if exists "${shared.name}" with (force)`)
  } finally {
    await admin.close({ timeout: 0 })
  }
})

async function withSharedDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (shared === undefined) throw new Error('A PostgreSQL test URL is required')
  await operation(shared.database)
}
