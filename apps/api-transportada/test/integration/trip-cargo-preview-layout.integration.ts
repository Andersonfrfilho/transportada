/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetVehicles,
  tripCargoLayoutOutbox,
  tripCargoLayouts,
} from '../../src/database/database.schema.js'
import { trips } from '../../src/database/trip.schema.js'
import {
  previewTripCargo,
  type TripCargoPreviewContext,
} from '../../src/trips/application/preview-trip-cargo.use-case.js'
import { createReadCargoLayoutUseCase } from '../../src/trips/application/read-cargo-layout.use-case.js'
import { createRequestCargoLayoutUseCase } from '../../src/trips/application/request-cargo-layout.use-case.js'
import type { BuildCargoLayoutInputParams } from '../../src/trips/domain/cargo-layout-hash.types.js'
import { DEFAULT_CARGO_LAYOUT_LEASE_MS } from '../../src/trips/domain/cargo-layout-lease.policy.js'
import { DrizzleCargoLayoutLookupRepository } from '../../src/trips/infrastructure/drizzle-cargo-layout-lookup.repository.js'
import { DrizzleCargoLayoutRequestRepository } from '../../src/trips/infrastructure/drizzle-cargo-layout-request.repository.js'
import { createRequestCargoLayoutForTrip } from '../../src/trips/infrastructure/eager-cargo-layout-request.support.js'
import { readCargoLayoutInputParams } from '../../src/trips/infrastructure/trip-cargo-layout-input.support.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe

const CORRELATION_ID = 'correlation-cargo-preview-layout'
const STORED_LAYOUT = { placement: { layers: [], source: 'measured', unplaced: [] }, stops: [] }

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type SeededTrip = { readonly companyId: string; readonly tripId: string }

/**
 * O contexto que a prévia teria lido para esta viagem: o mesmo retrato que o gatilho eager monta,
 * sem paradas. É o que faz o hash da prévia e o da viagem nascida dela coincidirem (D3).
 */
function previewContextOf(input: BuildCargoLayoutInputParams): TripCargoPreviewContext {
  return {
    bedDimensions: input.bedDimensions ?? null,
    boxesByDocument: new Map(),
    capacityM3: input.capacityM3,
    cargoWeight:
      input.payloadRatio === null || input.payloadRatio === undefined
        ? null
        : ({ payloadRatio: input.payloadRatio } as TripCargoPreviewContext['cargoWeight']),
    documents: [],
    fallbackBoxVolumeM3: input.fallbackBoxVolumeM3 ?? null,
    loadingAccess: input.loadingAccess ?? 'rear',
    measuredShapes: input.measuredShapes ?? [],
    occupancy: null,
    securesCargo: input.securesCargo ?? false,
  }
}

/**
 * Spec 145 T11 contra Postgres real: a prévia não empacota — ela lê `trip_cargo_layouts` pelo hash e
 * enfileira com `tripId null`; a viagem que nasce com a mesma entrada reaproveita a linha (D3).
 */
describeWithPostgres('cargo preview asks for the layout by hash (spec 145 T11)', () => {
  let database: TestDatabase
  let admin: SQL
  let databaseName: string

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    admin = new SQL(databaseUrl, { max: 1 })
    databaseName = `transportada_t145p_${crypto.randomUUID().replaceAll('-', '')}`
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

  function preview(seeded: SeededTrip, context: TripCargoPreviewContext) {
    return previewTripCargo({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      driverIds: [],
      layouts: new DrizzleCargoLayoutLookupRepository(database.db),
      nfeDocumentIds: [],
      repository: { readCargoPreviewContext: async () => context },
      requestCargoLayout: createRequestCargoLayoutUseCase({
        repository: new DrizzleCargoLayoutRequestRepository(database.db),
      }),
      stopOrder: [],
      vehicleId: 'vehicle',
    })
  }

  async function outboxOf(companyId: string) {
    return database.db
      .select({
        correlationId: tripCargoLayoutOutbox.correlationId,
        layoutId: tripCargoLayoutOutbox.layoutId,
      })
      .from(tripCargoLayoutOutbox)
      .where(eq(tripCargoLayoutOutbox.companyId, companyId))
  }

  async function layoutRowsOf(companyId: string) {
    return database.db
      .select({
        id: tripCargoLayouts.id,
        status: tripCargoLayouts.status,
        tripId: tripCargoLayouts.tripId,
      })
      .from(tripCargoLayouts)
      .where(eq(tripCargoLayouts.companyId, companyId))
  }

  async function eagerContextOf(seeded: SeededTrip): Promise<TripCargoPreviewContext> {
    const eager = await readCargoLayoutInputParams(database.db, seeded)
    if (eager === null) throw new Error('Expected the trip cargo layout input')
    return previewContextOf(eager)
  }

  test('pending: queues once with tripId null and the request correlation id; the trip reuses it (D3)', async () => {
    const seeded = await seedTrip(database)
    const context = await eagerContextOf(seeded)

    const first = await preview(seeded, context)
    expect(first.cargoLayout).toBeNull()
    expect(first.state.status).toBe('pending')
    expect(first.layoutId).toBeString()
    expect(await layoutRowsOf(seeded.companyId)).toEqual([
      { id: first.layoutId as string, status: 'queued', tripId: null },
    ])

    const again = await preview(seeded, context)
    expect(again.layoutId).toBe(first.layoutId)
    expect(await outboxOf(seeded.companyId)).toEqual([
      { correlationId: CORRELATION_ID, layoutId: first.layoutId as string },
    ])

    const eager = await database.db.transaction((transaction) =>
      createRequestCargoLayoutForTrip({ cargoLayoutLeaseMs: DEFAULT_CARGO_LAYOUT_LEASE_MS })(
        transaction,
        seeded,
      ),
    )
    expect(eager).toEqual({ enqueued: false, layoutId: first.layoutId as string, status: 'queued' })
    expect(await layoutRowsOf(seeded.companyId)).toEqual([
      { id: first.layoutId as string, status: 'queued', tripId: seeded.tripId },
    ])
    expect(await outboxOf(seeded.companyId)).toHaveLength(1)
  })

  test('ready: the preview and the polling serve the stored layout, never packing', async () => {
    const seeded = await seedTrip(database)
    const context = await eagerContextOf(seeded)
    const { layoutId } = await preview(seeded, context)
    await database.db
      .update(tripCargoLayouts)
      .set({
        computedAt: new Date('2026-09-12T10:00:00.000Z'),
        layout: STORED_LAYOUT,
        status: 'ready',
      })
      .where(eq(tripCargoLayouts.id, layoutId as string))

    const ready = await preview(seeded, context)
    const polled = await createReadCargoLayoutUseCase({
      repository: new DrizzleCargoLayoutLookupRepository(database.db),
    }).execute({ companyId: seeded.companyId, layoutId: layoutId as string })

    const readyState = {
      computedAt: '2026-09-12T10:00:00.000Z',
      errorCode: null,
      stale: false,
      status: 'ready',
      truncated: false,
    } as const
    expect(ready.cargoLayout as unknown).toEqual(STORED_LAYOUT)
    expect(ready.layoutId).toBe(layoutId)
    expect(ready.state).toEqual(readyState)
    expect(polled).toEqual({
      cargoLayout: STORED_LAYOUT as never,
      layoutId: layoutId as string,
      shouldRequest: false,
      state: readyState as never,
    })
    expect(await outboxOf(seeded.companyId)).toHaveLength(1)
  })

  async function failLayout(layoutId: string, options: { readonly old: boolean }) {
    await database.db
      .update(tripCargoLayouts)
      .set({
        errorCode: 'CARGO_LAYOUT_FAILED',
        status: 'failed',
        updatedAt: options.old ? sql`now() - interval '1 hour'` : sql`now()`,
      })
      .where(eq(tripCargoLayouts.id, layoutId))
  }

  /** D18: `failed` recente é resposta — reabrir a cada leitura repetiria a mesma falha sem teto. */
  test('failed within the wait: the preview serves the code and asks nothing', async () => {
    const seeded = await seedTrip(database)
    const context = await eagerContextOf(seeded)
    const { layoutId } = await preview(seeded, context)
    await failLayout(layoutId as string, { old: false })

    const failed = await preview(seeded, context)

    expect(failed.state).toMatchObject({ errorCode: 'CARGO_LAYOUT_FAILED', status: 'failed' })
    expect(failed.layoutId).toBe(layoutId)
    expect(await layoutRowsOf(seeded.companyId)).toEqual([
      { id: layoutId as string, status: 'failed', tripId: null },
    ])
    expect(await outboxOf(seeded.companyId)).toHaveLength(1)
  })

  test('failed past the wait: the upsert reopens it and the preview answers pending (D18)', async () => {
    const seeded = await seedTrip(database)
    const context = await eagerContextOf(seeded)
    const { layoutId } = await preview(seeded, context)
    await failLayout(layoutId as string, { old: true })

    const reopened = await preview(seeded, context)

    expect(reopened.state).toMatchObject({ errorCode: null, status: 'pending' })
    expect(reopened.layoutId).toBe(layoutId)
    expect(await layoutRowsOf(seeded.companyId)).toEqual([
      { id: layoutId as string, status: 'queued', tripId: null },
    ])
    expect(await outboxOf(seeded.companyId)).toHaveLength(2)
  })

  /**
   * D16/D18: o polling reabre pela linha guardada — a entrada, o hash, a versão e o `tripId` dela —,
   * com o correlation id da pergunta. Recente é no-op; de outra empresa, nada.
   */
  test('the polling reopens a stored row past the wait, from its own input', async () => {
    const seeded = await seedTrip(database)
    const intruder = await seedTrip(database)
    const { layoutId } = await preview(seeded, await eagerContextOf(seeded))
    const repository = new DrizzleCargoLayoutRequestRepository(database.db)
    const reopen = (companyId: string) =>
      repository.reopenStoredLayout({
        companyId,
        correlationId: 'correlation-polling',
        layoutId: layoutId as string,
      })

    expect(await reopen(seeded.companyId)).toEqual({
      enqueued: false,
      layoutId: layoutId as string,
      status: 'queued',
    })
    await failLayout(layoutId as string, { old: true })
    expect(await reopen(intruder.companyId)).toBeUndefined()
    const [before] = await database.db
      .select({ input: tripCargoLayouts.input, inputHash: tripCargoLayouts.inputHash })
      .from(tripCargoLayouts)
      .where(eq(tripCargoLayouts.id, layoutId as string))

    expect(await reopen(seeded.companyId)).toEqual({
      enqueued: true,
      layoutId: layoutId as string,
      status: 'queued',
    })
    const [after] = await database.db
      .select({ input: tripCargoLayouts.input, inputHash: tripCargoLayouts.inputHash })
      .from(tripCargoLayouts)
      .where(eq(tripCargoLayouts.id, layoutId as string))
    expect(after).toEqual(before as never)
    expect(await outboxOf(seeded.companyId)).toEqual([
      { correlationId: CORRELATION_ID, layoutId: layoutId as string },
      { correlationId: 'correlation-polling', layoutId: layoutId as string },
    ])
    expect(await outboxOf(intruder.companyId)).toEqual([])
  })

  test('the polling of another company answers 404, never the layout', async () => {
    const seeded = await seedTrip(database)
    const intruder = await seedTrip(database)
    const { layoutId } = await preview(seeded, await eagerContextOf(seeded))

    const failure = await createReadCargoLayoutUseCase({
      repository: new DrizzleCargoLayoutLookupRepository(database.db),
    })
      .execute({ companyId: intruder.companyId, layoutId: layoutId as string })
      .catch((error: unknown) => error)

    expect(failure).toMatchObject({ code: 'TRIP_CARGO_LAYOUT_NOT_FOUND', status: 404 })
  })
})

async function seedTrip(database: TestDatabase): Promise<SeededTrip> {
  const companyId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(fleetVehicles).values({
    capacityM3: '48.000',
    cargoHeightM: '2.500',
    cargoLengthM: '8.000',
    cargoWidthM: '2.400',
    companyId,
    id: vehicleId,
    plate: 'ABC1D23',
    role: 'traction',
    state: 'SP',
    vehicleType: 'three_quarter',
  })
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'draft', vehicleId })

  return { companyId, tripId }
}
