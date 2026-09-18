/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 157 T7, ADR-0068 §5-6 — a nota do motorista contra Postgres de verdade. A regra de pontos é
 * provada em `test/driver-score/*` sem banco; aqui se prova o **SQL**: o último evento por nota, o
 * recorte de canal e de janela, a ligação do motorista pelo vínculo, a exceção por CNPJ e o tenant
 * em todas as tabelas do join. Contrato com dublê passa com `where` errado — este não.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../src/database/company-delivery-proof-settings.schema.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
  tripStops,
  trips,
  type TripDeliveryProofPunctuality,
  type TripFieldChannel,
} from '../../src/database/trip.schema.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-09-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const OVERRIDE_TAX_ID = '12345678000199'

type Driver = { readonly driverId: string; readonly userId: string }

type Company = {
  readonly companyId: string
  readonly stopId: string
  readonly tripId: string
  readonly userId: string
}

type DeliveryInput = {
  readonly company: Company
  readonly actorUserId: string
  readonly deliveredAgo: number
  readonly channel?: TripFieldChannel
  readonly onBehalfOfDriverId?: string
  readonly photo?: TripDeliveryProofPunctuality
  readonly recipientTaxId?: string
  readonly returned?: boolean
}

describe('a nota do motorista lida do banco (spec 157 T7)', () => {
  testWithPostgres('aceite 5: late (5) + ausente há 25h (10) = 85; o resto não pesa', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const driver = await seedDriver(database, company.companyId)
      const office = company.userId
      const delivery = { actorUserId: driver.userId, company }

      const late = await seedDelivery(database, {
        ...delivery,
        deliveredAgo: 3 * DAY,
        photo: 'late',
      })
      const missing = await seedDelivery(database, {
        ...delivery,
        channel: 'whatsapp',
        deliveredAgo: 25 * HOUR,
      })
      await seedDelivery(database, { ...delivery, deliveredAgo: 3 * HOUR })
      await seedDelivery(database, { ...delivery, deliveredAgo: 91 * DAY })
      await seedDelivery(database, { ...delivery, deliveredAgo: 30 * HOUR, returned: true })
      await seedDelivery(database, {
        ...delivery,
        actorUserId: office,
        channel: 'office',
        deliveredAgo: 30 * HOUR,
        onBehalfOfDriverId: driver.driverId,
      })
      await seedDelivery(database, {
        ...delivery,
        deliveredAgo: 30 * HOUR,
        recipientTaxId: OVERRIDE_TAX_ID,
      })

      const result = await new DrizzleDriverScoreRepository(database.db).readPenalties({
        companyId: company.companyId,
        driverId: driver.driverId,
        now: NOW,
      })

      expect(result.score).toBe(85)
      expect(result.penalties.map((penalty) => [penalty.tripDocumentId, penalty.reason])).toEqual([
        [missing.tripDocumentId, 'missing_proof'],
        [late.tripDocumentId, 'late_proof'],
      ])
      expect(result.penalties[1]).toMatchObject({
        documentNumber: late.documentNumber,
        expiresAt: new Date(NOW.getTime() - 3 * DAY + 90 * DAY),
        points: 5,
      })
    })
  })

  testWithPostgres('só o último evento delivered da nota conta', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const driver = await seedDriver(database, company.companyId)
      const first = await seedDelivery(database, {
        actorUserId: driver.userId,
        company,
        deliveredAgo: 50 * HOUR,
      })
      await seedEvent(database, {
        actorUserId: driver.userId,
        company,
        deliveredAgo: 40 * HOUR,
        photo: 'on_time',
        tripDocumentId: first.tripDocumentId,
      })

      const scores = await new DrizzleDriverScoreRepository(database.db).readScores({
        companyId: company.companyId,
        driverIds: [driver.driverId],
        now: NOW,
      })

      expect(scores.get(driver.driverId)).toBe(100)
    })
  })

  testWithPostgres('vários motoristas numa chamada só, sem histórico é null', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const [penalized, punctual, idle] = await Promise.all([
        seedDriver(database, company.companyId),
        seedDriver(database, company.companyId),
        seedDriver(database, company.companyId),
      ])
      await seedDelivery(database, {
        actorUserId: penalized.userId,
        company,
        deliveredAgo: 2 * DAY,
      })
      await seedDelivery(database, {
        actorUserId: punctual.userId,
        company,
        deliveredAgo: 2 * DAY,
        photo: 'on_time',
      })

      const scores = await new DrizzleDriverScoreRepository(database.db).readScores({
        companyId: company.companyId,
        driverIds: [penalized.driverId, punctual.driverId, idle.driverId],
        now: NOW,
      })

      expect(Object.fromEntries(scores)).toEqual({
        [idle.driverId]: null,
        [penalized.driverId]: 90,
        [punctual.driverId]: 100,
      })
    })
  })

  testWithPostgres('tenant: motorista de outra empresa não é lido', async () => {
    await withDisposableDatabase(async (database) => {
      const own = await seedCompany(database)
      const other = await seedCompany(database)
      const ownDriver = await seedDriver(database, own.companyId)
      const otherDriver = await seedDriver(database, other.companyId)
      await seedDelivery(database, {
        actorUserId: ownDriver.userId,
        company: own,
        deliveredAgo: DAY * 2,
      })
      await seedDelivery(database, {
        actorUserId: otherDriver.userId,
        company: other,
        deliveredAgo: DAY * 2,
      })
      const repository = new DrizzleDriverScoreRepository(database.db)

      const scores = await repository.readScores({
        companyId: own.companyId,
        driverIds: [ownDriver.driverId, otherDriver.driverId],
        now: NOW,
      })
      const crossed = await repository.readPenalties({
        companyId: other.companyId,
        driverId: ownDriver.driverId,
        now: NOW,
      })

      expect(scores.get(ownDriver.driverId)).toBe(90)
      expect(scores.get(otherDriver.driverId)).toBeNull()
      expect(crossed).toEqual({ penalties: [], score: null })
    })
  })
})

async function seedCompany(database: TestDatabase): Promise<Company> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({ companyId, status: 'active', userId })
  await database.db.insert(companyDeliveryProofSettings).values({ companyId, photo: 'required' })
  await database.db
    .insert(deliveryProofSettingOverrides)
    .values({ companyId, photo: 'optional', taxId: OVERRIDE_TAX_ID })
  const vehicleId = crypto.randomUUID()
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'dispatched', vehicleId })
  await database.db.insert(tripStops).values({
    addressKey: '3550308|01001000|100',
    companyId,
    id: stopId,
    label: 'Centro, 100',
    sequence: 1n,
    tripId,
  })

  return { companyId, stopId, tripId, userId }
}

async function seedDriver(database: TestDatabase, companyId: string): Promise<Driver> {
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()

  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista',
    taxId: String(Math.floor(Math.random() * 1e11)).padStart(11, '0'),
  })

  return { driverId, userId }
}

/** Uma nota vinculada e entregue — o evento `delivered` e, se pedida, a foto com a pontualidade. */
async function seedDelivery(
  database: TestDatabase,
  input: DeliveryInput,
): Promise<{ readonly documentNumber: string; readonly tripDocumentId: string }> {
  const { companyId, tripId, stopId } = input.company
  const documentNumber = String(Math.floor(Math.random() * 1e8))
  const nfeDocumentId = await seedNfeDocument(database, {
    company: input.company,
    documentNumber,
    recipientTaxId: input.recipientTaxId ?? '',
  })
  const tripDocumentId = crypto.randomUUID()
  await database.db.insert(tripDocuments).values({
    companyId,
    deliveredAt: new Date(NOW.getTime() - input.deliveredAgo),
    id: tripDocumentId,
    nfeDocumentId,
    returnReason: input.returned === true ? 'recusada' : null,
    separationStatus: input.returned === true ? 'returned' : 'delivered',
    stopId,
    tripId,
  })
  await seedEvent(database, { ...input, tripDocumentId })

  return { documentNumber, tripDocumentId }
}

async function seedEvent(
  database: TestDatabase,
  input: DeliveryInput & { readonly tripDocumentId: string },
): Promise<void> {
  const eventId = crypto.randomUUID()
  const at = new Date(NOW.getTime() - input.deliveredAgo)
  await database.db.insert(tripStopEvents).values({
    actorUserId: input.actorUserId,
    channel: input.channel ?? 'driver_app',
    companyId: input.company.companyId,
    createdAt: at,
    id: eventId,
    kind: 'delivered',
    onBehalfOfDriverId: input.onBehalfOfDriverId ?? null,
    recordedAt: at,
    stopId: input.company.stopId,
    tripDocumentId: input.tripDocumentId,
  })
  if (input.photo === undefined) return

  const objectId = await seedStoredObject(database, input.company.companyId)
  await database.db.insert(tripDeliveryProofs).values({
    actorUserId: input.actorUserId,
    companyId: input.company.companyId,
    kind: 'photo',
    objectId,
    punctuality: input.photo,
    stopEventId: eventId,
  })
}

async function seedStoredObject(database: TestDatabase, companyId: string): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id,
    mimeType: 'image/jpeg',
    objectKey: `proof/${id}.jpg`,
    provider: 's3',
    purpose: 'delivery_proof',
    sha256: id.replaceAll('-', '').padEnd(64, '0'),
    sizeBytes: 100n,
    status: 'final',
  })

  return id
}

async function seedNfeDocument(
  database: TestDatabase,
  input: {
    readonly company: Company
    readonly documentNumber: string
    readonly recipientTaxId: string
  },
): Promise<string> {
  const { companyId, userId } = input.company
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = documentId.replaceAll('-', '').padEnd(64, '0')

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/driver-score-${documentId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-${documentId}`,
    id: importId,
    idempotencyKey: `driver-score-${documentId}`,
    requestFingerprint: `fingerprint-${documentId}`,
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.documentNumber}`.padStart(44, '3'),
    authorizationProtocol: `protocol-${documentId}`,
    companyId,
    createdByUserId: userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-06-01T06:00:00.000Z'),
    model: '55',
    number: input.documentNumber,
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
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId,
    legalName: 'Destinatario',
    role: 'recipient',
    taxId: input.recipientTaxId === '' ? null : input.recipientTaxId,
  })

  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_157_${crypto.randomUUID().replaceAll('-', '')}`
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
