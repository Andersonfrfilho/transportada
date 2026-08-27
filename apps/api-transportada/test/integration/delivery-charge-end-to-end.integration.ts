/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 060 T016 — **o ciclo inteiro contra Postgres**: cliente com hora e taxa → nota na viagem →
 * agendamento → despacho → entrega → sugestão → conferência → lote → aprovação por link → relatório
 * que fecha.
 *
 * Cada pedaço tem contrato próprio. O que só este teste prova é a costura, e ela atravessa dois
 * portões que não se veem de fora: o despacho recusando por agendamento pendente, e a entrega
 * propondo a taxa sozinha.
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
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createDeliveryChargesUseCase } from '../../src/delivery-clients/application/delivery-charges.use-case.js'
import { createDeliveryClientsUseCase } from '../../src/delivery-clients/application/delivery-clients.use-case.js'
import { createExtraChargeBatchesUseCase } from '../../src/delivery-clients/application/extra-charge-batches.use-case.js'
import { createSuggestDeliveryCharges } from '../../src/delivery-clients/application/suggest-delivery-charges.use-case.js'
import { createTripStopSchedulesUseCase } from '../../src/delivery-clients/application/trip-stop-schedule.use-case.js'
import {
  DrizzleDeliveryChargeRepository,
  DrizzleDeliveryChargeRuleRepository,
} from '../../src/delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { DrizzleDeliveryClientRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-client.repository.js'
import { DrizzleExtraChargeBatchRepository } from '../../src/delivery-clients/infrastructure/drizzle-extra-charge-batch.repository.js'
import { DrizzleTripStopScheduleRepository } from '../../src/delivery-clients/infrastructure/drizzle-trip-stop-schedule.repository.js'
import { dispatchTrip } from '../../src/trips/application/dispatch-trip.use-case.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import { DrizzleTripDocumentRepository } from '../../src/trips/infrastructure/drizzle-trip-document.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const TOKEN = 'token-opaco-de-trinta-e-dois-bytes-ou-mais'
const CLIENT_TAX_ID = '98765432000109'
const CONTRACTOR_TAX_ID = '30290856000160'

describe('do cliente com hora ao relatório aprovado (spec 060 T016)', () => {
  testWithPostgres(
    'o agendamento segura o caminhão, a entrega propõe a taxa, e o lote fecha com o total certo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const { companyId, context } = world

        const clients = createDeliveryClientsUseCase({
          repository: new DrizzleDeliveryClientRepository(database.db),
        })
        const chargeRepository = new DrizzleDeliveryChargeRepository(database.db)
        const ruleRepository = new DrizzleDeliveryChargeRuleRepository(database.db)
        const charges = createDeliveryChargesUseCase({ repository: chargeRepository })
        const schedules = createTripStopSchedulesUseCase({
          repository: new DrizzleTripStopScheduleRepository(database.db),
        })

        // 1. O cliente ganha hora e taxa esperada — o cadastro já existia, vindo da nota.
        await clients.update({
          context,
          id: world.deliveryClientId,
          values: { deliveryFeeAmount: '45.0000', requiresScheduling: true },
        })
        await clients.replaceWindows({
          context,
          id: world.deliveryClientId,
          windows: [{ closesAt: '11:00', opensAt: '08:00', weekday: 4 }],
        })
        // E a taxa que se repete vira regra: dali em diante ela propõe sozinha.
        await ruleRepository.upsert({
          actorUserId: world.userId,
          chargeType: 'unloading',
          companyId,
          deliveryClientId: world.deliveryClientId,
          expectedAmount: '45.0000',
        })

        // 2. A nota entra na viagem, e a parada nasce do endereço do destinatário.
        const tripRepository = new DrizzleTripRepository(database.db)
        const routeRepository = new DrizzleTripRouteRepository(database.db)
        const documentRepository = new DrizzleTripDocumentRepository(database.db)
        const trip = await tripRepository.create({
          companyId,
          crew: [
            {
              driverId: world.driverId,
              driverName: 'Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: world.vehicleId,
        })
        const linked = await tripRepository.linkDocument({
          companyId,
          freightCalculationId: null,
          nfeDocumentId: world.nfeDocumentId,
          tripId: trip.id,
        })
        expect(linked.stopId).not.toBeNull()

        await planTripRoute({ companyId, repository: routeRepository, tripId: trip.id })
        for (const action of ['separate', 'load'] as const) {
          await transitionTripDocument({
            action,
            actorUserId: world.userId,
            companyId,
            documentId: linked.id,
            repository: documentRepository,
            tripId: trip.id,
          })
        }

        // 3. O portão: a viagem não sai sem o agendamento do cliente que o exige.
        const refused = await dispatchTrip({
          actorUserId: world.userId,
          companyId,
          repository: routeRepository,
          tripId: trip.id,
        }).catch((error: unknown) => error)
        expect(refused).toMatchObject({ code: 'TRIP_HAS_UNSCHEDULED_STOPS', status: 409 })

        await schedules.save({
          context,
          stopId: linked.stopId ?? '',
          tripId: trip.id,
          values: {
            notes: '',
            protocol: 'AG-4471',
            scheduledAt: '2026-08-27T11:00:00.000Z',
            status: 'confirmed',
          },
        })

        const dispatched = await dispatchTrip({
          actorUserId: world.userId,
          companyId,
          repository: routeRepository,
          tripId: trip.id,
        })
        expect(dispatched.tripStatus).toBe('dispatched')

        // 4. A entrega concluída **propõe** a taxa: a regra recorrente age sozinha.
        await transitionTripDocument({
          action: 'deliver',
          actorUserId: world.userId,
          companyId,
          documentId: linked.id,
          repository: documentRepository,
          suggestCharges: createSuggestDeliveryCharges({
            charges: chargeRepository,
            logger: { warn() {} },
            rules: ruleRepository,
          }),
          tripId: trip.id,
        })

        const suggested = await charges.list({
          context,
          filters: { limit: 50, status: 'suggested' },
        })
        expect(suggested.items).toHaveLength(1)
        expect(suggested.items[0]?.amount).toBe('45.0000')
        expect(suggested.items[0]?.contractorId).toBe(world.contractorId)

        // 5. A conferência corrige o valor — o CD reajustou a taxa.
        const confirmed = await charges.confirm({
          charges: [{ amount: '52.3000', id: suggested.items[0]?.id ?? '' }],
          context,
        })
        expect(confirmed[0]?.status).toBe('recorded')

        // 6. O período fecha, e o relatório confere o próprio total.
        const batches = createExtraChargeBatchesUseCase({
          batches: new DrizzleExtraChargeBatchRepository(database.db),
          charges: chargeRepository,
          createToken: () => TOKEN,
        })
        const batch = await batches.close({
          context,
          contractorId: world.contractorId,
          periodEnd: '2026-12-31',
          periodStart: '2026-01-01',
        })
        expect(batch.totalAmount).toBe('52.3000')

        // 7. O contratante aprova pelo link, e a trilha guarda o token — nunca um usuário inventado.
        const decided = await batches.decideByToken({
          accessToken: TOKEN,
          decisions: [
            { chargeId: suggested.items[0]?.id ?? '', decision: 'approved', reason: '' },
          ],
        })
        expect(decided.items[0]?.status).toBe('approved')
        expect(decided.itemsTotal).toBe(batch.totalAmount)

        const [finalCharge] = await database.db
          .select()
          .from(deliveryCharges)
          .where(eq(deliveryCharges.companyId, companyId))
        expect(finalCharge?.status).toBe('approved')
        expect(finalCharge?.batchId).toBe(batch.id)
      })
    },
    60_000,
  )
})

type World = {
  readonly companyId: string
  readonly context: CompanyContext
  readonly contractorId: string
  readonly deliveryClientId: string
  readonly driverId: string
  readonly nfeDocumentId: string
  readonly userId: string
  readonly vehicleId: string
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const nfeDocumentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const deliveryClientId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db
    .insert(fleetDrivers)
    .values({ companyId, id: driverId, name: 'Motorista', taxId: '11111111111' })

  /**
   * Cliente e contratante já existem porque **a importação os cria** (T006, no worker). Aqui eles
   * entram prontos: o que este teste investiga começa depois disso.
   */
  await database.db
    .insert(deliveryClients)
    .values({ companyId, displayName: 'Loja Central', id: deliveryClientId, taxId: CLIENT_TAX_ID })
  await database.db.insert(contractors).values({
    companyId,
    displayName: 'Spani Atacadista',
    id: contractorId,
    taxId: CONTRACTOR_TAX_ID,
  })

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'nfe/e2e.xml',
    provider: 's3',
    purpose: 'nfe_document',
    sha256: '1'.repeat(64),
    sizeBytes: 100n,
    status: 'final',
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
  await database.db.insert(nfeDocuments).values({
    accessKey: `8${'1'.repeat(43)}`,
    authorizationProtocol: 'protocol-e2e',
    companyId,
    createdByUserId: userId,
    freightValue: '0.0000',
    id: nfeDocumentId,
    importId,
    issuedAt: new Date('2026-08-26T06:00:00.000Z'),
    model: '55',
    number: '800001',
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

  for (const [role, taxId] of [
    ['emitter', CONTRACTOR_TAX_ID],
    ['recipient', CLIENT_TAX_ID],
  ] as const) {
    const participantId = crypto.randomUUID()
    await database.db.insert(nfeParticipants).values({
      companyId,
      documentId: nfeDocumentId,
      id: participantId,
      legalName: role,
      role,
      taxId,
    })
    await database.db.insert(nfeAddresses).values({
      city: 'Sertaozinho',
      cityCode: '3551702',
      companyId,
      number: '100',
      participantId,
      postalCode: '14160000',
      state: 'SP',
      street: 'Rua da Entrega',
    })
  }

  return {
    companyId,
    context: { companyId, userId } as unknown as CompanyContext,
    contractorId,
    deliveryClientId,
    driverId,
    nfeDocumentId,
    userId,
    vehicleId,
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_060_e2e_${crypto.randomUUID().replaceAll('-', '')}`
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
