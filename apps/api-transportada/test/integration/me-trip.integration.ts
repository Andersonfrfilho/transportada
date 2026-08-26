/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 057, T017 — **a prova da D2**. A viagem inteira é executada pelos casos de uso e pelos
 * repositórios que as rotas expõem, contra Postgres de verdade, e **sem browser nenhum**. Se um dia
 * esta suíte precisar de um para passar, a regra de viagem vazou para a tela e a decisão está
 * quebrada.
 *
 * É também a única verificação que exercita o SQL: contrato com dublê passa com `where` errado, e
 * `where` errado num filtro de tenant é o defeito que ninguém vê até alguém ver a viagem de outra
 * empresa.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

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
  tripDocuments,
  tripDrivers,
  tripStopEvents,
  tripStopOccurrences,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-08-26T13:00:00.000Z')
const LOCATION = {
  accuracyMeters: '12.50',
  capturedAt: '2026-08-26T12:59:58.000Z',
  latitude: '-23.5505199',
  longitude: '-46.6333094',
} as const

type World = {
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly driverId: string
  readonly membershipId: string
  readonly stopIds: readonly string[]
  readonly tripId: string
  readonly userId: string
}

describe('a viagem no bolso do motorista (spec 057 T017)', () => {
  testWithPostgres('executa a viagem inteira pelas rotas de domínio, sem browser', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDispatchedTrip(database)
      const reads = new DrizzleCurrentDriverTripRepository(database.db)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)
      const context = {
        actorUserId: world.userId,
        companyId: world.companyId,
        driverId: world.driverId,
      }

      // 1. O motorista abre o app e o servidor diz qual é a viagem dele
      const opened = await findCurrentDriverTrip({
        companyId: world.companyId,
        membershipId: world.membershipId,
        repository: reads,
      })
      expect(opened.isRegisteredDriver).toBe(true)
      expect(opened.trips).toHaveLength(1)
      expect(opened.trips[0]?.vehiclePlate).toBe('GCQ8E47')
      expect(opened.trips[0]?.stops.map((stop) => stop.sequence)).toEqual([1, 2])
      expect(opened.trips[0]?.stops[0]?.documents).toHaveLength(2)
      /**
       * Spec 065 D1b: a entrega urbana não tem CT-e nem MDF-e, então a NF-e é o único documento
       * daquela carga — e é com a chave que a portaria confere e o fiscal consulta.
       */
      expect(opened.trips[0]?.stops[0]?.documents[0]).toMatchObject({
        accessKey: `1${'1'.repeat(43)}`,
        number: '1',
        recipientName: 'Destinatario 1',
        series: '1',
      })

      // 2. Cheguei na primeira parada — e a viagem sai de `dispatched` sozinha
      await reportStopArrival({
        ...context,
        idempotencyKey: 'chegada-1',
        location: LOCATION,
        now: NOW,
        stopId: world.stopIds[0] ?? '',
        unitOfWork,
      })
      expect(await readTripStatus(database, world.tripId)).toBe('in_transit')

      // 3. Entreguei as duas notas: a última fecha a parada, e só ela
      const firstDelivery = await reportDocumentDelivery({
        ...context,
        documentId: world.documentIds[0] ?? '',
        idempotencyKey: 'entrega-1',
        location: LOCATION,
        now: NOW,
        unitOfWork,
      })
      expect(firstDelivery).toMatchObject({ stopCompleted: false, tripCompleted: false })

      const secondDelivery = await reportDocumentDelivery({
        ...context,
        documentId: world.documentIds[1] ?? '',
        idempotencyKey: 'entrega-2',
        location: null,
        now: NOW,
        unitOfWork,
      })
      expect(secondDelivery).toMatchObject({ stopCompleted: true, tripCompleted: false })

      // 4. Deu problema na segunda parada, e a ocorrência não impede nada
      await reportStopArrival({
        ...context,
        idempotencyKey: 'chegada-2',
        location: null,
        now: NOW,
        stopId: world.stopIds[1] ?? '',
        unitOfWork,
      })
      await reportStopOccurrence({
        ...context,
        attachmentObjectId: null,
        description: 'Duas horas na fila da doca',
        documentId: world.documentIds[2] ?? '',
        idempotencyKey: 'ocorrencia-1',
        kind: 'long_wait',
        stopId: world.stopIds[1] ?? '',
        unitOfWork,
      })

      // 5. Não entreguei a última: a parada fecha do mesmo jeito, e a viagem fecha atrás dela
      const returned = await reportDocumentReturn({
        ...context,
        documentId: world.documentIds[2] ?? '',
        idempotencyKey: 'retorno-1',
        location: null,
        now: NOW,
        reason: 'establishment_closed',
        unitOfWork,
      })
      expect(returned).toMatchObject({ stopCompleted: true, tripCompleted: true })
      expect(await readTripStatus(database, world.tripId)).toBe('completed')

      // 6. O que ficou gravado: a coordenada onde havia, e nada onde não havia
      const events = await database.db
        .select()
        .from(tripStopEvents)
        .where(eq(tripStopEvents.companyId, world.companyId))
      // Duas chegadas, duas entregas e um retorno — um evento por confirmação, nem um a mais
      expect(events).toHaveLength(5)
      expect(events.filter((event) => event.latitude !== null)).toHaveLength(2)
      expect(events.filter((event) => event.kind === 'returned')).toHaveLength(1)

      const occurrences = await database.db
        .select()
        .from(tripStopOccurrences)
        .where(eq(tripStopOccurrences.companyId, world.companyId))
      expect(occurrences).toHaveLength(1)
      expect(occurrences[0]?.kind).toBe('long_wait')

      // A nota da ocorrência foi **devolvida**, e a ocorrência continua lá: os dois fatos convivem
      const [returnedDocument] = await database.db
        .select()
        .from(tripDocuments)
        .where(eq(tripDocuments.id, world.documentIds[2] ?? ''))
      expect(returnedDocument?.separationStatus).toBe('returned')
      expect(returnedDocument?.returnReason).toBe('establishment_closed')
    })
  })

  /** A garantia inteira do modo offline, contra o banco: o reenvio não vira uma segunda chegada. */
  testWithPostgres('o reenvio da fila offline não duplica o que já foi reportado', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDispatchedTrip(database)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)
      const input = {
        actorUserId: world.userId,
        companyId: world.companyId,
        driverId: world.driverId,
        idempotencyKey: 'a-mesma-chave-do-aparelho',
        location: LOCATION,
        now: NOW,
        stopId: world.stopIds[0] ?? '',
        unitOfWork,
      }

      const first = await reportStopArrival(input)
      const second = await reportStopArrival(input)
      const third = await reportStopArrival(input)

      expect(second.id).toBe(first.id)
      expect(third.id).toBe(first.id)
      const events = await database.db
        .select()
        .from(tripStopEvents)
        .where(eq(tripStopEvents.companyId, world.companyId))
      expect(events).toHaveLength(1)
    })
  })

  /**
   * O filtro de tenant, exercitado: o motorista da outra empresa **não** enxerga esta viagem, e a
   * parada dela não é alcançável por ele. Contrato com dublê passaria com o `where` errado.
   */
  testWithPostgres('a viagem de uma empresa não alcança o motorista de outra', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDispatchedTrip(database)
      const stranger = await seedDriverOnly(database)
      const reads = new DrizzleCurrentDriverTripRepository(database.db)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)

      const opened = await findCurrentDriverTrip({
        companyId: stranger.companyId,
        membershipId: stranger.membershipId,
        repository: reads,
      })
      expect(opened).toEqual({ isRegisteredDriver: true, trips: [] })

      const attempt = reportStopArrival({
        actorUserId: stranger.userId,
        companyId: stranger.companyId,
        driverId: stranger.driverId,
        idempotencyKey: 'tentativa',
        location: null,
        now: NOW,
        stopId: world.stopIds[0] ?? '',
        unitOfWork,
      })

      await expect(attempt).rejects.toThrow()
    })
  })

  /** Conta com papel de motorista e sem cadastro na frota: problema de configuração, não de viagem. */
  testWithPostgres('conta sem cadastro de motorista se anuncia como tal', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      const userId = crypto.randomUUID()
      const membershipId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: companyId, status: 'active' })
      await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
      await database.db
        .insert(userCompanyMemberships)
        .values({ companyId, id: membershipId, status: 'active', userId })

      const opened = await findCurrentDriverTrip({
        companyId,
        membershipId,
        repository: new DrizzleCurrentDriverTripRepository(database.db),
      })

      expect(opened).toEqual({ isRegisteredDriver: false, trips: [] })
    })
  })
})

async function readTripStatus(database: TestDatabase, tripId: string): Promise<string> {
  const [trip] = await database.db.select().from(trips).where(eq(trips.id, tripId))

  return trip?.status ?? 'unknown'
}

async function seedDriverOnly(database: TestDatabase): Promise<{
  readonly companyId: string
  readonly driverId: string
  readonly membershipId: string
  readonly userId: string
}> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista de Outra Empresa',
    taxId: '22222222222',
  })

  return { companyId, driverId, membershipId, userId }
}

/** Viagem já despachada, com duas paradas e três notas carregadas — o estado em que a rua começa. */
async function seedDispatchedTrip(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopIds = [crypto.randomUUID(), crypto.randomUUID()]

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
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista de Campo',
    taxId: '11111111111',
  })
  await database.db
    .insert(trips)
    .values({ companyId, id: tripId, status: 'dispatched', vehicleId })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Motorista de Campo',
    driverTaxId: '11111111111',
    position: 1n,
    tripId,
  })
  await database.db.insert(tripStops).values([
    {
      addressKey: '3550308|01001000|100',
      companyId,
      id: stopIds[0] ?? '',
      label: 'Centro, 100',
      sequence: 1n,
      tripId,
    },
    {
      addressKey: '3550308|04538133|200',
      companyId,
      id: stopIds[1] ?? '',
      label: 'Faria Lima, 200',
      sequence: 2n,
      tripId,
    },
  ])

  const documentIds: string[] = []
  for (const [index, stopId] of [stopIds[0], stopIds[0], stopIds[1]].entries()) {
    const nfeDocumentId = await seedNfeDocument(database, {
      companyId,
      suffix: String(index + 1),
      userId,
    })
    const tripDocumentId = crypto.randomUUID()
    await database.db.insert(tripDocuments).values({
      companyId,
      id: tripDocumentId,
      loadedAt: new Date('2026-08-26T08:00:00.000Z'),
      nfeDocumentId,
      separatedAt: new Date('2026-08-26T07:00:00.000Z'),
      separationStatus: 'loaded',
      stopId: stopId ?? '',
      tripId,
    })
    documentIds.push(tripDocumentId)
  }

  return { companyId, documentIds, driverId, membershipId, stopIds, tripId, userId }
}

async function seedNfeDocument(
  database: TestDatabase,
  input: { readonly companyId: string; readonly suffix: string; readonly userId: string },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = input.suffix.repeat(64)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/me-trip-${input.suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-me-trip-${input.suffix}`,
    id: importId,
    idempotencyKey: `me-trip-${input.suffix}`,
    requestFingerprint: `fingerprint-me-trip-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.suffix}${'1'.repeat(43)}`,
    authorizationProtocol: `protocol-me-trip-${input.suffix}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-08-26T06:00:00.000Z'),
    model: '55',
    number: input.suffix,
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
    legalName: `Destinatario ${input.suffix}`,
    role: 'recipient',
  })
  await database.db.insert(nfeAddresses).values({
    city: 'Sao Paulo',
    cityCode: '3550308',
    companyId: input.companyId,
    number: '100',
    participantId,
    postalCode: '01001000',
    state: 'SP',
    street: 'Rua da Rua',
  })

  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_057_${crypto.randomUUID().replaceAll('-', '')}`
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
