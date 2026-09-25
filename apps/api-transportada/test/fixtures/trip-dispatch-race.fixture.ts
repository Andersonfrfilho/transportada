/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 T4.3 (CA09): banco descartável com pool de verdade (`createDatabaseProvider`, mais de
 * uma conexão, `prepare: false`), viagem com roteiro planejado e os leitores do que a corrida deixa
 * no banco — uma viagem nova por iteração, cada uma numa empresa própria.
 */
import { SQL } from 'bun'
import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc, eq, inArray } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
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
import {
  tripDispatchSnapshots,
  tripDocuments,
  trips,
  tripStatusEvents,
  type TripStatus,
} from '../../src/database/trip.schema.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { DrizzleTripDocumentRepository } from '../../src/trips/infrastructure/drizzle-trip-document.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

export type RaceDatabase = {
  readonly database: DrizzleProvider
  /** Conexão à parte, fora do pool da aplicação, só para olhar `pg_stat_activity`. */
  readonly monitor: SQL
}

export type RaceTrip = {
  readonly companyId: string
  readonly tripDocumentIds: readonly string[]
  readonly tripId: string
  readonly userId: string
}

const RACE_POOL = { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 } as const
const LOCK_WAIT_DEADLINE_MS = 10_000

export async function withRaceDatabase(
  databaseUrl: string,
  operation: (race: RaceDatabase) => Promise<void>,
): Promise<void> {
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_s185t43_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: DrizzleProvider | undefined
  let monitor: SQL | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDatabaseProvider({ pool: RACE_POOL, url: disposableUrl.toString() })
    monitor = new SQL(disposableUrl.toString(), { max: 1 })
    await operation({ database, monitor })
  } finally {
    try {
      await monitor?.close({ timeout: 0 })
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

/**
 * Espera até `count` transações deste banco estarem **paradas num lock** — a prova de que as duas
 * escritas concorrentes chegaram à mesma trava ao mesmo tempo, sem depender de relógio.
 */
export async function waitForLockWaiters(monitor: SQL, count: number): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_DEADLINE_MS
  while (Date.now() < deadline) {
    const [row] = (await monitor`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
    `) as { waiting: number }[]
    if ((row?.waiting ?? 0) >= count) return
    await Bun.sleep(5)
  }
  throw new Error(`EXPECTED_${count}_LOCK_WAITERS`)
}

export async function seedRaceTrip(
  database: DrizzleProvider,
  input: { readonly documentCount: number },
): Promise<RaceTrip> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'ABC1D24',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db
    .insert(fleetDrivers)
    .values({ companyId, id: driverId, name: 'Motorista 185 T4.3', taxId: '22222222222' })

  const tripRepository = new DrizzleTripRepository(database.db)
  const trip = await tripRepository.create({
    actorUserId: userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId,
    crew: [{ driverId, driverName: 'Motorista 185 T4.3', driverTaxId: '22222222222', position: 1 }],
    vehicleId,
  })

  const tripDocumentIds: string[] = []
  for (let index = 1; index <= input.documentCount; index += 1) {
    const nfeDocumentId = await seedNfeDocument(database, { companyId, userId })
    const linked = await tripRepository.linkDocument({
      companyId,
      freightCalculationId: null,
      nfeDocumentId,
      tripId: trip.id,
    })
    tripDocumentIds.push(linked.id)
  }

  await planTripRoute({
    actorUserId: userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId,
    repository: new DrizzleTripRouteRepository(database.db),
    tripId: trip.id,
  })

  return { companyId, tripDocumentIds, tripId: trip.id, userId }
}

export async function moveRaceDocument(
  database: DrizzleProvider,
  input: {
    readonly actions: readonly ('load' | 'separate')[]
    readonly documentId: string
    readonly trip: RaceTrip
  },
): Promise<void> {
  const repository = new DrizzleTripDocumentRepository(database.db)
  for (const action of input.actions) {
    await transitionTripDocument({
      action,
      actorUserId: input.trip.userId,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: input.trip.companyId,
      documentId: input.documentId,
      repository,
      tripId: input.trip.tripId,
    })
  }
}

export type RaceOutcome = {
  readonly dispatchEventCount: number
  readonly documentStatuses: readonly string[]
  readonly snapshotCount: number
  readonly tripStatus: TripStatus
}

/** O que a corrida deixou: status da viagem, snapshots, eventos `→ dispatched` e as notas. */
export async function readRaceOutcome(
  database: DrizzleProvider,
  trip: RaceTrip,
): Promise<RaceOutcome> {
  const [tripRow] = await database.db
    .select({ status: trips.status })
    .from(trips)
    .where(eq(trips.id, trip.tripId))
  if (tripRow === undefined) throw new Error('EXPECTED_TRIP')

  const snapshots = await database.db
    .select({ id: tripDispatchSnapshots.id })
    .from(tripDispatchSnapshots)
    .where(eq(tripDispatchSnapshots.tripId, trip.tripId))
  const events = await database.db
    .select({ toStatus: tripStatusEvents.toStatus })
    .from(tripStatusEvents)
    .where(eq(tripStatusEvents.tripId, trip.tripId))
    .orderBy(asc(tripStatusEvents.occurredAt), asc(tripStatusEvents.id))
  const documents = await database.db
    .select({ id: tripDocuments.id, separationStatus: tripDocuments.separationStatus })
    .from(tripDocuments)
    .where(inArray(tripDocuments.id, [...trip.tripDocumentIds]))

  return {
    dispatchEventCount: events.filter((event) => event.toStatus === 'dispatched').length,
    documentStatuses: trip.tripDocumentIds.map(
      (id) => documents.find((document) => document.id === id)?.separationStatus ?? 'missing',
    ),
    snapshotCount: snapshots.length,
    tripStatus: tripRow.status,
  }
}

async function seedNfeDocument(
  database: DrizzleProvider,
  input: { readonly companyId: string; readonly userId: string },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const token = crypto.randomUUID().replaceAll('-', '')
  const sha = token.repeat(2)
  const accessKey = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('')

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/185-t43-${token}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-185-t43-${token}`,
    id: importId,
    idempotencyKey: `spec-185-t43-${token}`,
    requestFingerprint: `fingerprint-185-t43-${token}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey,
    authorizationProtocol: `protocol-185-t43-${token}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-24T12:00:00.000Z'),
    model: '55',
    number: accessKey.slice(0, 9),
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

  const participantId = crypto.randomUUID()
  await database.db.insert(nfeParticipants).values({
    companyId: input.companyId,
    documentId,
    id: participantId,
    role: 'recipient',
    taxId: '12345678000188',
  })
  await database.db.insert(nfeAddresses).values({
    city: 'Ribeirao Preto',
    cityCode: '3543402',
    companyId: input.companyId,
    number: '100',
    participantId,
    postalCode: '14010100',
    state: 'SP',
    street: 'Rua da Corrida do Despacho',
  })

  return documentId
}
