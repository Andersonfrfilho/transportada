/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { resolveCargoLayout } from '@adatechnology/cargo-placement'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  tripCargoLayoutOutbox,
  tripCargoLayouts,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../src/database/trip.schema.js'
import { createRequestCargoLayoutUseCase } from '../../src/trips/application/request-cargo-layout.use-case.js'
import {
  buildCargoLayoutInput,
  buildStoredCargoLayoutInput,
  hashCargoLayoutInput,
} from '../../src/trips/domain/cargo-layout-hash.policy.js'
import type { BuildCargoLayoutInputParams } from '../../src/trips/domain/cargo-layout-hash.types.js'
import { DrizzleCargoLayoutRequestRepository } from '../../src/trips/infrastructure/drizzle-cargo-layout-request.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { readCargoLayoutInputParams } from '../../src/trips/infrastructure/trip-cargo-layout-input.support.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe

const CORRELATION_ID = 'correlation-cargo-layout-read'
const FAILED_CODE = 'CARGO_LAYOUT_FAILED'

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type SeededTrip = { readonly companyId: string; readonly tripId: string }

function hashOf(params: BuildCargoLayoutInputParams): string {
  return hashCargoLayoutInput(buildCargoLayoutInput(params))
}

function layoutWithUnplaced(reason: string): object {
  return {
    placement: { layers: [], source: 'measured', unplaced: [{ count: 1, label: 'Caixa', reason }] },
  }
}

/**
 * Spec 145 T10 contra Postgres real: o detalhe da viagem para de empacotar e lê `trip_cargo_layouts`
 * pelo hash da entrada que ele mesmo montou — e esse hash tem de ser o mesmo do gatilho eager, senão
 * toda leitura enfileiraria de novo uma planta que o worker já desenhou.
 */
describeWithPostgres('trip detail reads the stored cargo layout (spec 145 T10)', () => {
  let database: TestDatabase
  let admin: SQL
  let databaseName: string

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    admin = new SQL(databaseUrl, { max: 1 })
    databaseName = `transportada_t145_${crypto.randomUUID().replaceAll('-', '')}`
    const disposableUrl = new URL(databaseUrl)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
  }, 60_000)

  afterAll(async () => {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  })

  test('the detail hashes the same input as the eager trigger, label included', async () => {
    const seeded = await seedTrip(database, { measured: true })
    const detail = await new DrizzleTripRepository(database.db).findById(seeded)
    const eager = await readCargoLayoutInputParams(database.db, seeded)

    expect(eager).not.toBeNull()
    expect(detail?.pendingCargoLayoutInput).toBeDefined()
    const detailInput = detail?.pendingCargoLayoutInput as BuildCargoLayoutInputParams
    const eagerInput = eager as BuildCargoLayoutInputParams
    expect(detailInput.stops).toHaveLength(2)
    expect(hashOf(detailInput)).toBe(hashOf(eagerInput))
    expect(buildStoredCargoLayoutInput(detailInput)).toEqual(
      buildStoredCargoLayoutInput(eagerInput),
    )
  })

  test('nothing stored yet: pending, no layout, and the lazy request queues it once', async () => {
    const seeded = await seedTrip(database, { measured: true })
    const repository = new DrizzleTripRepository(database.db)
    const first = await repository.findById(seeded)

    expect(first?.cargoLayout).toBeNull()
    expect(first?.cargoLayoutState).toEqual({
      computedAt: null,
      errorCode: null,
      stale: false,
      status: 'pending',
      truncated: false,
    })

    const result = await requestLazily(database, {
      detailInput: first?.pendingCargoLayoutInput,
      seeded,
    })
    expect(result.enqueued).toBe(true)

    const second = await repository.findById(seeded)
    expect(second?.cargoLayoutState.status).toBe('pending')
    expect(second?.pendingCargoLayoutInput).toBeUndefined()
    const outbox = await database.db
      .select({ correlationId: tripCargoLayoutOutbox.correlationId })
      .from(tripCargoLayoutOutbox)
      .where(eq(tripCargoLayoutOutbox.companyId, seeded.companyId))
    expect(outbox).toEqual([{ correlationId: CORRELATION_ID }])
  })

  test('ready with the current hash serves it fresh, truncated derived from time_budget', async () => {
    const seeded = await seedTrip(database, { measured: true })
    const repository = new DrizzleTripRepository(database.db)
    const first = await repository.findById(seeded)
    await requestLazily(database, { detailInput: first?.pendingCargoLayoutInput, seeded })
    const layout = layoutWithUnplaced('time_budget')
    await database.db
      .update(tripCargoLayouts)
      .set({ computedAt: new Date('2026-09-12T10:00:00.000Z'), layout, status: 'ready' })
      .where(eq(tripCargoLayouts.companyId, seeded.companyId))

    const detail = await repository.findById(seeded)

    expect(detail?.cargoLayout as unknown).toEqual(layout)
    expect(detail?.cargoLayoutState).toEqual({
      computedAt: '2026-09-12T10:00:00.000Z',
      errorCode: null,
      stale: false,
      status: 'ready',
      truncated: true,
    })
    expect(detail?.pendingCargoLayoutInput).toBeUndefined()
  })

  test('failed carries its code, keeps the last ready as stale, and asks again', async () => {
    const seeded = await seedTrip(database, { measured: true })
    const repository = new DrizzleTripRepository(database.db)
    const first = await repository.findById(seeded)
    await requestLazily(database, { detailInput: first?.pendingCargoLayoutInput, seeded })
    await database.db
      .update(tripCargoLayouts)
      .set({ errorCode: FAILED_CODE, status: 'failed' })
      .where(eq(tripCargoLayouts.companyId, seeded.companyId))
    const oldLayout = layoutWithUnplaced('bedFull')
    await insertReadyLayout(database, {
      ...seeded,
      computedAt: '2026-09-11T10:00:00.000Z',
      layout: oldLayout,
    })

    const detail = await repository.findById(seeded)

    expect(detail?.cargoLayout as unknown).toEqual(oldLayout)
    expect(detail?.cargoLayoutState).toEqual({
      computedAt: '2026-09-11T10:00:00.000Z',
      errorCode: FAILED_CODE,
      stale: true,
      status: 'failed',
      truncated: false,
    })
    expect(detail?.pendingCargoLayoutInput).toBeDefined()
  })

  test('the newest ready of the trip is the stale one served', async () => {
    const seeded = await seedTrip(database, { measured: true })
    const newest = layoutWithUnplaced('tooMany')
    await insertReadyLayout(database, {
      ...seeded,
      computedAt: '2026-09-10T10:00:00.000Z',
      layout: layoutWithUnplaced('bedFull'),
    })
    await insertReadyLayout(database, {
      ...seeded,
      computedAt: '2026-09-11T10:00:00.000Z',
      layout: newest,
    })

    const detail = await new DrizzleTripRepository(database.db).findById(seeded)

    expect(detail?.cargoLayout as unknown).toEqual(newest)
    expect(detail?.cargoLayoutState.status).toBe('pending')
    expect(detail?.cargoLayoutState.stale).toBe(true)
  })

  test('a queued request past the lease is asked again, and the upsert reopens it (D14/D16)', async () => {
    const seeded = await seedTrip(database, { measured: true })
    const repository = new DrizzleTripRepository(database.db)
    const first = await repository.findById(seeded)
    await requestLazily(database, { detailInput: first?.pendingCargoLayoutInput, seeded })
    await database.db
      .update(tripCargoLayouts)
      .set({ updatedAt: sql`now() - interval '1 hour'` })
      .where(eq(tripCargoLayouts.companyId, seeded.companyId))

    const detail = await repository.findById(seeded)
    expect(detail?.cargoLayoutState.status).toBe('pending')
    expect(detail?.pendingCargoLayoutInput).toBeDefined()

    const reopened = await requestLazily(database, {
      detailInput: detail?.pendingCargoLayoutInput,
      seeded,
    })
    expect(reopened.enqueued).toBe(true)
  })

  test('never reads another company layout, even with the same input hash', async () => {
    const seeded = await seedTrip(database, { measured: true })
    const first = await new DrizzleTripRepository(database.db).findById(seeded)
    const other = await seedTrip(database, { measured: true })
    const detailInput = first?.pendingCargoLayoutInput as BuildCargoLayoutInputParams
    await database.db.insert(tripCargoLayouts).values({
      companyId: other.companyId,
      computedAt: new Date('2026-09-12T10:00:00.000Z'),
      input: buildStoredCargoLayoutInput(detailInput),
      inputHash: hashOf(detailInput),
      layout: layoutWithUnplaced('bedFull'),
      policyVersion: buildStoredCargoLayoutInput(detailInput).policyVersion,
      status: 'ready',
    })

    const detail = await new DrizzleTripRepository(database.db).findById(seeded)

    expect(detail?.cargoLayout).toBeNull()
    expect(detail?.cargoLayoutState.status).toBe('pending')
  })

  /**
   * D10: sem baú a planta leve sai na hora, como antes — o empacotador nem entra em cena
   * (`placement: null`) e a lista do que falta medir (spec 144) continua na tela.
   */
  test('without capacity nor bed: the light layout of before, unavailable, nothing to ask', async () => {
    const seeded = await seedTrip(database, { measured: false })

    const detail = await new DrizzleTripRepository(database.db).findById(seeded)
    const eager = (await readCargoLayoutInputParams(
      database.db,
      seeded,
    )) as BuildCargoLayoutInputParams

    expect(detail?.cargoLayout as unknown).toEqual(resolveCargoLayout(eager))
    expect(detail?.cargoLayout?.pendingMeasurements).toBeArray()
    expect((detail?.cargoLayout as { placement: unknown } | null)?.placement).toBeNull()
    expect(detail?.cargoLayoutState).toEqual({
      computedAt: null,
      errorCode: null,
      stale: false,
      status: 'unavailable',
      truncated: false,
    })
    expect(detail?.pendingCargoLayoutInput).toBeUndefined()
    const rows = await database.db
      .select({ id: tripCargoLayouts.id })
      .from(tripCargoLayouts)
      .where(and(eq(tripCargoLayouts.companyId, seeded.companyId)))
    expect(rows).toEqual([])
  })
})

async function requestLazily(
  database: TestDatabase,
  params: {
    readonly detailInput: BuildCargoLayoutInputParams | undefined
    readonly seeded: SeededTrip
  },
): Promise<{ readonly enqueued: boolean }> {
  if (params.detailInput === undefined) throw new Error('Expected a pending cargo layout input')
  const useCase = createRequestCargoLayoutUseCase({
    repository: new DrizzleCargoLayoutRequestRepository(database.db),
  })
  return useCase.execute({
    ...params.detailInput,
    companyId: params.seeded.companyId,
    correlationId: CORRELATION_ID,
    tripId: params.seeded.tripId,
  })
}

async function insertReadyLayout(
  database: TestDatabase,
  params: SeededTrip & { readonly computedAt: string; readonly layout: object },
): Promise<void> {
  await database.db.insert(tripCargoLayouts).values({
    companyId: params.companyId,
    computedAt: new Date(params.computedAt),
    input: {},
    inputHash: `old-${crypto.randomUUID()}`,
    layout: params.layout,
    policyVersion: 'old',
    status: 'ready',
    tripId: params.tripId,
  })
}

async function seedTrip(
  database: TestDatabase,
  params: { readonly measured: boolean },
): Promise<SeededTrip> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const driverId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'ABC1D23',
    role: 'traction',
    state: 'SP',
    ...(params.measured
      ? {
          capacityM3: '48.000',
          cargoHeightM: '2.500',
          cargoLengthM: '8.000',
          cargoWidthM: '2.400',
          vehicleType: 'three_quarter',
        }
      : { vehicleType: 'tractor_unit' }),
  })
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'draft', vehicleId })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    name: 'Motorista de teste',
    securesCargo: true,
    taxId: '12345678909',
  })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Motorista de teste',
    driverTaxId: '12345678909',
    id: crypto.randomUUID(),
    position: 1n,
    tripId,
  })

  for (const sequence of [1, 2]) {
    const stopId = crypto.randomUUID()
    await database.db.insert(tripStops).values({
      addressKey: `${tripId.slice(0, 8)}-${sequence}`,
      companyId,
      id: stopId,
      label: `Parada ${sequence}`,
      sequence: BigInt(sequence),
      tripId,
    })
    const nfeDocumentId = await seedNfeDocument(database, {
      companyId,
      number: `${sequence}0`,
      userId,
    })
    await database.db.insert(tripDocuments).values({ companyId, nfeDocumentId, stopId, tripId })
  }

  return { companyId, tripId }
}

async function seedNfeDocument(
  database: TestDatabase,
  input: { readonly companyId: string; readonly number: string; readonly userId: string },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = 'b'.repeat(64)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/cargo-layout-read-${documentId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-${importId}`,
    id: importId,
    idempotencyKey: `import-${importId}`,
    requestFingerprint: `fingerprint-${importId}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `9${String(Math.floor(Math.random() * 1e15)).padStart(15, '0')}${'1'.repeat(28)}`,
    authorizationProtocol: `protocol-${documentId}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-07-22T12:00:00.000Z'),
    model: '55',
    number: input.number,
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
  return documentId
}
