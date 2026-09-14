/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7 contra Postgres real: a fila de revisão das notas que não couberam. Tenant, despacho,
 * idempotência, troca e CT-e só se provam no banco — dublê passa com o `where` errado.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { and, eq, isNull } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  tripCargoLayouts,
  tripDocumentReviews,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, tripStops, trips } from '../../src/database/trip.schema.js'
import {
  buildCargoLayoutInput,
  buildStoredCargoLayoutInput,
  hashCargoLayoutInput,
} from '../../src/trips/domain/cargo-layout-hash.policy.js'
import {
  TripCargoLayoutOutdatedError,
  TripDocumentReviewDoesNotFitError,
  TripDocumentReviewNotFoundError,
  TripDocumentReviewTransitionError,
} from '../../src/trips/domain/trip-document-review.error.js'
import {
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
import { DrizzleTripDocumentReviewRepository } from '../../src/trips/infrastructure/drizzle-trip-document-review.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { readCargoLayoutInputParams } from '../../src/trips/infrastructure/trip-cargo-layout-input.support.js'
import { seedAuthorizedCte } from '../fixtures/authorized-cte.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe

const CORRELATION_ID = 'correlation-trip-review'

type TestDatabase = ReturnType<typeof createDatabaseProvider>
type SeededDocument = { readonly nfeDocumentId: string; readonly tripDocumentId: string }
type SeededTrip = {
  readonly companyId: string
  readonly documents: readonly SeededDocument[]
  readonly tripId: string
  readonly userId: string
}
type UnplacedLine = { readonly count: number; readonly documentId: string; readonly reason: string }

describeWithPostgres('fila de revisão das notas que não couberam (spec 148 T7)', () => {
  let database: TestDatabase
  let admin: SQL
  let databaseName: string
  let reviews: DrizzleTripDocumentReviewRepository

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    admin = new SQL(databaseUrl, { max: 1 })
    databaseName = `transportada_t148_${crypto.randomUUID().replaceAll('-', '')}`
    const disposableUrl = new URL(databaseUrl)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    /**
     * O cliente da API (`prepare: false`), não o `createDrizzleProvider` cru: a prévia e a leitura da
     * planta fazem consultas concorrentes na transação, e as instruções preparadas do Bun SQL 1.3.14
     * as deixam sem resolver para sempre (spec 137) — medido aqui de novo, a transação parava ociosa.
     */
    database = createDatabaseProvider({
      pool: { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 },
      url: disposableUrl.toString(),
    })
    reviews = new DrizzleTripDocumentReviewRepository(database.db)
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

  async function releaseFirst(seeded: SeededTrip) {
    const [first] = seeded.documents
    if (first === undefined) throw new Error('seed without documents')
    const layoutId = await insertCurrentLayout(database, seeded, [
      { count: 3, documentId: first.nfeDocumentId, reason: 'bedFull' },
    ])
    const result = await reviews.releaseUnplaced({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      layoutId,
      tripId: seeded.tripId,
      userId: seeded.userId,
    })
    return { first, layoutId, result }
  }

  test('soltar marca released_at, cria a entrada pendente com o motivo e audita', async () => {
    const seeded = await seedTrip(database)
    const { first, result } = await releaseFirst(seeded)

    expect(result.reviews).toHaveLength(1)
    expect(result.reviews[0]).toMatchObject({
      nfeDocumentId: first.nfeDocumentId,
      nfeNumber: '10',
      reason: 'bedFull',
      sourceTripId: seeded.tripId,
      status: 'pending',
    })
    const [link] = await database.db
      .select({ releasedAt: tripDocuments.releasedAt, stopId: tripDocuments.stopId })
      .from(tripDocuments)
      .where(eq(tripDocuments.id, first.tripDocumentId))
    expect(link?.releasedAt).not.toBeNull()
    expect(link?.stopId).toBeNull()
    const audits = await database.db
      .select({ action: auditLogs.action, actor: auditLogs.actorUserId })
      .from(auditLogs)
      .where(eq(auditLogs.companyId, seeded.companyId))
    expect(audits).toEqual([{ action: 'trip_document.released', actor: seeded.userId }])
  })

  test('repetir a saída pela mesma planta devolve as mesmas entradas, sem duplicar', async () => {
    const seeded = await seedTrip(database)
    const { layoutId, result } = await releaseFirst(seeded)

    const again = await reviews.releaseUnplaced({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      layoutId,
      tripId: seeded.tripId,
      userId: seeded.userId,
    })

    expect(again.reviews.map((review) => review.id)).toEqual(
      result.reviews.map((review) => review.id),
    )
    const rows = await database.db
      .select({ id: tripDocumentReviews.id })
      .from(tripDocumentReviews)
      .where(eq(tripDocumentReviews.companyId, seeded.companyId))
    expect(rows).toHaveLength(1)
  })

  test('outro tenant: a viagem, a fila e a entrada não existem (404)', async () => {
    const seeded = await seedTrip(database)
    const other = await seedTrip(database)
    const { layoutId, result } = await releaseFirst(seeded)
    const [review] = result.reviews

    await expect(
      reviews.releaseUnplaced({
        companyId: other.companyId,
        correlationId: CORRELATION_ID,
        layoutId,
        tripId: seeded.tripId,
        userId: other.userId,
      }),
    ).rejects.toBeInstanceOf(TripNotFoundError)
    expect(await reviews.list({ companyId: other.companyId, status: 'pending' })).toEqual([])
    await expect(
      reviews.listSwapSuggestions({ companyId: other.companyId, reviewId: review?.id ?? '' }),
    ).rejects.toBeInstanceOf(TripDocumentReviewNotFoundError)
    await expect(
      reviews.move({
        companyId: other.companyId,
        correlationId: CORRELATION_ID,
        reviewId: review?.id ?? '',
        targetTripId: other.tripId,
        userId: other.userId,
        validatedLayoutId: layoutId,
      }),
    ).rejects.toBeInstanceOf(TripDocumentReviewNotFoundError)
  })

  test('viagem despachada não solta nota (409)', async () => {
    const seeded = await seedTrip(database)
    const [first] = seeded.documents
    const layoutId = await insertCurrentLayout(database, seeded, [
      { count: 1, documentId: first?.nfeDocumentId ?? '', reason: 'bedFull' },
    ])
    await database.db.update(trips).set({ status: 'dispatched' }).where(eq(trips.id, seeded.tripId))

    await expect(
      reviews.releaseUnplaced({
        companyId: seeded.companyId,
        correlationId: CORRELATION_ID,
        layoutId,
        tripId: seeded.tripId,
        userId: seeded.userId,
      }),
    ).rejects.toBeInstanceOf(TripStateTransitionNotAllowedError)
  })

  test('planta com hash velho responde 409 e não solta nada', async () => {
    const seeded = await seedTrip(database)
    const [first] = seeded.documents
    const layoutId = await insertLayout(database, {
      companyId: seeded.companyId,
      inputHash: `old-${crypto.randomUUID()}`,
      tripId: seeded.tripId,
      unplaced: [{ count: 1, documentId: first?.nfeDocumentId ?? '', reason: 'bedFull' }],
    })

    await expect(
      reviews.releaseUnplaced({
        companyId: seeded.companyId,
        correlationId: CORRELATION_ID,
        layoutId,
        tripId: seeded.tripId,
        userId: seeded.userId,
      }),
    ).rejects.toBeInstanceOf(TripCargoLayoutOutdatedError)
  })

  test('time_budget e sem medida ficam na viagem', async () => {
    const seeded = await seedTrip(database)
    const [first, second] = seeded.documents
    const layoutId = await insertCurrentLayout(database, seeded, [
      { count: 1, documentId: first?.nfeDocumentId ?? '', reason: 'time_budget' },
      { count: 1, documentId: second?.nfeDocumentId ?? '', reason: 'notMeasured' },
    ])

    const result = await reviews.releaseUnplaced({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      layoutId,
      tripId: seeded.tripId,
      userId: seeded.userId,
    })

    expect(result.reviews).toEqual([])
    expect(result.kept.map((entry) => entry.reason).toSorted()).toEqual([
      'notMeasured',
      'time_budget',
    ])
  })

  test('CT-e autorizado não trava a saída nem a mudança (D13)', async () => {
    const seeded = await seedTrip(database)
    const [first] = seeded.documents
    await seedAuthorizedCte(database, {
      companyId: seeded.companyId,
      nfeDocumentId: first?.nfeDocumentId ?? '',
      userId: seeded.userId,
    })
    const { result } = await releaseFirst(seeded)
    const [review] = result.reviews
    const target = await seedTrip(database, { companyId: seeded.companyId, userId: seeded.userId })

    const preview = await reviews.previewChange({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      reviewId: review?.id ?? '',
      targetTripId: target.tripId,
    })
    await markLayoutReady(database, preview.layoutId, [])
    const moved = await reviews.move({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      reviewId: review?.id ?? '',
      targetTripId: target.tripId,
      userId: seeded.userId,
      validatedLayoutId: preview.layoutId ?? '',
    })

    expect(moved.status).toBe('moved')
  })

  test('mover: a nota entra no outro caminhão, repetir é 200, outro destino é 409', async () => {
    const seeded = await seedTrip(database)
    const { first, result } = await releaseFirst(seeded)
    const [review] = result.reviews
    const target = await seedTrip(database, { companyId: seeded.companyId, userId: seeded.userId })
    const preview = await reviews.previewChange({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      reviewId: review?.id ?? '',
      targetTripId: target.tripId,
    })
    await markLayoutReady(database, preview.layoutId, [])
    const body = {
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      reviewId: review?.id ?? '',
      targetTripId: target.tripId,
      userId: seeded.userId,
      validatedLayoutId: preview.layoutId ?? '',
    }

    const moved = await reviews.move(body)
    const repeated = await reviews.move(body)

    expect(moved).toMatchObject({ resolutionTripId: target.tripId, status: 'moved' })
    expect(repeated).toEqual(moved)
    const live = await liveLinks(database, first.nfeDocumentId)
    expect(live).toEqual([target.tripId])
    const third = await seedTrip(database, { companyId: seeded.companyId, userId: seeded.userId })
    await expect(reviews.move({ ...body, targetTripId: third.tripId })).rejects.toBeInstanceOf(
      TripDocumentReviewTransitionError,
    )
  })

  test('mover sem caber responde 409 e desfaz o vínculo', async () => {
    const seeded = await seedTrip(database)
    const { first, result } = await releaseFirst(seeded)
    const [review] = result.reviews
    const target = await seedTrip(database, { companyId: seeded.companyId, userId: seeded.userId })
    const preview = await reviews.previewChange({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      reviewId: review?.id ?? '',
      targetTripId: target.tripId,
    })
    await markLayoutReady(database, preview.layoutId, [
      { count: 1, documentId: first.nfeDocumentId, reason: 'bedFull' },
    ])

    await expect(
      reviews.move({
        companyId: seeded.companyId,
        correlationId: CORRELATION_ID,
        reviewId: review?.id ?? '',
        targetTripId: target.tripId,
        userId: seeded.userId,
        validatedLayoutId: preview.layoutId ?? '',
      }),
    ).rejects.toBeInstanceOf(TripDocumentReviewDoesNotFitError)
    expect(await liveLinks(database, first.nfeDocumentId)).toEqual([])
    const [stillPending] = await reviews.list({ companyId: seeded.companyId, status: 'pending' })
    expect(stillPending?.id).toBe(review?.id ?? '')
  })

  test('mover para viagem despachada responde 409 (a trava é só o despacho)', async () => {
    const seeded = await seedTrip(database)
    const { result } = await releaseFirst(seeded)
    const target = await seedTrip(database, { companyId: seeded.companyId, userId: seeded.userId })
    await database.db.update(trips).set({ status: 'dispatched' }).where(eq(trips.id, target.tripId))

    await expect(
      reviews.previewChange({
        companyId: seeded.companyId,
        correlationId: CORRELATION_ID,
        reviewId: result.reviews[0]?.id ?? '',
        targetTripId: target.tripId,
      }),
    ).rejects.toBeInstanceOf(TripStateTransitionNotAllowedError)
  })

  test('trocar: a nota entra no lugar da outra, e a outra volta para a fila como pendente', async () => {
    const seeded = await seedTrip(database)
    const { first, result } = await releaseFirst(seeded)
    const [review] = result.reviews
    const [, second] = seeded.documents
    if (second === undefined) throw new Error('seed without a second document')

    const suggestions = await reviews.listSwapSuggestions({
      companyId: seeded.companyId,
      reviewId: review?.id ?? '',
    })
    expect(suggestions.suggestions.map((suggestion) => suggestion.tripDocumentId)).toEqual([
      second.tripDocumentId,
    ])

    const preview = await reviews.previewChange({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      outTripDocumentId: second.tripDocumentId,
      reviewId: review?.id ?? '',
    })
    await markLayoutReady(database, preview.layoutId, [])
    const swapped = await reviews.swap({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      outTripDocumentId: second.tripDocumentId,
      reviewId: review?.id ?? '',
      userId: seeded.userId,
      validatedLayoutId: preview.layoutId ?? '',
    })

    expect(swapped.review).toMatchObject({ resolutionTripId: seeded.tripId, status: 'swapped_in' })
    expect(swapped.swappedOut).toMatchObject({
      nfeDocumentId: second.nfeDocumentId,
      reason: 'swapped_out',
      sourceTripId: seeded.tripId,
      status: 'pending',
    })
    expect(await liveLinks(database, first.nfeDocumentId)).toEqual([seeded.tripId])
    expect(await liveLinks(database, second.nfeDocumentId)).toEqual([])
    const audits = await database.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.companyId, seeded.companyId))
    expect(audits.map((audit) => audit.action).toSorted()).toEqual([
      'trip_document.released',
      'trip_document.swapped',
    ])
  })

  test('D12: a nota da fila vinculada por qualquer caminho fecha a entrada como relinked', async () => {
    const seeded = await seedTrip(database)
    const { first, result } = await releaseFirst(seeded)
    const target = await seedTrip(database, { companyId: seeded.companyId, userId: seeded.userId })

    await new DrizzleTripRepository(database.db).linkDocument({
      companyId: seeded.companyId,
      freightCalculationId: null,
      nfeDocumentId: first.nfeDocumentId,
      tripId: target.tripId,
    })

    const [entry] = await database.db
      .select({
        resolutionTripId: tripDocumentReviews.resolutionTripId,
        status: tripDocumentReviews.status,
      })
      .from(tripDocumentReviews)
      .where(eq(tripDocumentReviews.id, result.reviews[0]?.id ?? ''))
    expect(entry).toEqual({ resolutionTripId: target.tripId, status: 'relinked' })
  })

  test('o aceite da proposta vincula e solta na mesma transação', async () => {
    const seeded = await seedTrip(database)
    const target = await seedTrip(database, { companyId: seeded.companyId, userId: seeded.userId })
    const [first] = seeded.documents
    await database.db
      .update(tripDocuments)
      .set({ releasedAt: new Date(), stopId: null })
      .where(eq(tripDocuments.id, first?.tripDocumentId ?? ''))
    const layoutId = await insertLayout(database, {
      companyId: seeded.companyId,
      inputHash: `preview-${crypto.randomUUID()}`,
      tripId: null,
      unplaced: [{ count: 1, documentId: first?.nfeDocumentId ?? '', reason: 'bedFull' }],
    })

    const linked = await reviews.linkAndReleaseForReview({
      companyId: seeded.companyId,
      correlationId: CORRELATION_ID,
      layoutId,
      nfeDocumentId: first?.nfeDocumentId ?? '',
      reason: 'bedFull',
      tripId: target.tripId,
      userId: seeded.userId,
    })

    expect(linked).toBe(true)
    expect(await liveLinks(database, first?.nfeDocumentId ?? '')).toEqual([])
    const [entry] = await reviews.list({ companyId: seeded.companyId, tripId: target.tripId })
    expect(entry).toMatchObject({ reason: 'bedFull', status: 'pending' })
  })
})

async function liveLinks(database: TestDatabase, nfeDocumentId: string): Promise<string[]> {
  const rows = await database.db
    .select({ tripId: tripDocuments.tripId })
    .from(tripDocuments)
    .where(and(eq(tripDocuments.nfeDocumentId, nfeDocumentId), isNull(tripDocuments.releasedAt)))
  return rows.map((row) => row.tripId)
}

function layoutWith(unplaced: readonly UnplacedLine[]): object {
  return {
    pendingMeasurements: [],
    placement: {
      layers: [],
      source: 'measured',
      unplaced: unplaced.map((line) => ({ ...line, label: 'Caixa' })),
    },
    rows: [],
    slices: [],
    stopsWithoutVolume: [],
  }
}

async function insertLayout(
  database: TestDatabase,
  params: {
    readonly companyId: string
    readonly inputHash: string
    readonly tripId: string | null
    readonly unplaced: readonly UnplacedLine[]
  },
): Promise<string> {
  const [row] = await database.db
    .insert(tripCargoLayouts)
    .values({
      companyId: params.companyId,
      computedAt: new Date(),
      input: {},
      inputHash: params.inputHash,
      layout: layoutWith(params.unplaced),
      policyVersion: 'test',
      status: 'ready',
      tripId: params.tripId,
    })
    .returning({ id: tripCargoLayouts.id })
  if (row === undefined) throw new Error('layout not inserted')
  return row.id
}

async function insertCurrentLayout(
  database: TestDatabase,
  seeded: SeededTrip,
  unplaced: readonly UnplacedLine[],
): Promise<string> {
  const params = await readCargoLayoutInputParams(database.db, seeded)
  if (params === null) throw new Error('trip without cargo input')
  const input = buildStoredCargoLayoutInput(params)
  const inputHash = hashCargoLayoutInput(buildCargoLayoutInput(params))
  const [row] = await database.db
    .insert(tripCargoLayouts)
    .values({
      companyId: seeded.companyId,
      computedAt: new Date(),
      input,
      inputHash,
      layout: layoutWith(unplaced),
      policyVersion: input.policyVersion,
      status: 'ready',
      tripId: seeded.tripId,
    })
    .onConflictDoUpdate({
      set: { layout: layoutWith(unplaced), status: 'ready', tripId: seeded.tripId },
      target: [tripCargoLayouts.companyId, tripCargoLayouts.inputHash],
    })
    .returning({ id: tripCargoLayouts.id })
  if (row === undefined) throw new Error('layout not inserted')
  return row.id
}

/** O worker, na mão: a prévia enfileirou; aqui a planta termina com o `unplaced` pedido. */
async function markLayoutReady(
  database: TestDatabase,
  layoutId: string | null,
  unplaced: readonly UnplacedLine[],
): Promise<void> {
  if (layoutId === null) throw new Error('preview without layout')
  await database.db
    .update(tripCargoLayouts)
    .set({ computedAt: new Date(), errorCode: '', layout: layoutWith(unplaced), status: 'ready' })
    .where(eq(tripCargoLayouts.id, layoutId))
}

/** Placa Mercosul (`ABC1D23`); o mesmo tenant ganha vários caminhões. */
function randomPlate(): string {
  const value = Math.floor(Math.random() * 10_000)
  const letter = 'ABCDEFGHIJ'[Math.floor(value / 10) % 10] ?? 'A'
  return `RVW${value % 10}${letter}${String(Math.floor(value / 100) % 100).padStart(2, '0')}`
}

async function seedTrip(
  database: TestDatabase,
  owner?: { readonly companyId: string; readonly userId: string },
): Promise<SeededTrip> {
  const companyId = owner?.companyId ?? crypto.randomUUID()
  const userId = owner?.userId ?? crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()

  if (owner === undefined) {
    await database.db.insert(companies).values({ id: companyId, status: 'active' })
    await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
    await database.db
      .insert(userCompanyMemberships)
      .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  }
  await database.db.insert(fleetVehicles).values({
    capacityM3: '48.000',
    cargoHeightM: '2.500',
    cargoLengthM: '8.000',
    cargoWidthM: '2.400',
    companyId,
    id: vehicleId,
    plate: randomPlate(),
    role: 'traction',
    state: 'SP',
    vehicleType: 'three_quarter',
  })
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'draft', vehicleId })

  const documents: SeededDocument[] = []
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
    const tripDocumentId = crypto.randomUUID()
    await database.db
      .insert(tripDocuments)
      .values({ companyId, id: tripDocumentId, nfeDocumentId, stopId, tripId })
    documents.push({ nfeDocumentId, tripDocumentId })
  }

  return { companyId, documents, tripId, userId }
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
    objectKey: `nfe/trip-review-${documentId}.xml`,
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
