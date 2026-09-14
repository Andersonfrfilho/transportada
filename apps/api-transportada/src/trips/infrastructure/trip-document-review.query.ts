/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7: as leituras e escritas curtas da fila de revisão. Todo `where` leva a empresa do
 * contexto — o id vem da URL, e sem ela abriria entrada alheia (BOLA).
 */
import { and, asc, eq, sql, type SQL } from 'drizzle-orm'

import type { ResolvedCargoLayout, UnplacedBox } from '@adatechnology/cargo-placement'

import { auditLogs, nfeDocuments, tripCargoLayouts } from '../../database/database.schema.js'
import {
  tripDocumentReviews,
  type TripDocumentReviewReason,
  type TripDocumentReviewStatus,
} from '../../database/trip-document-review.schema.js'
import { trips } from '../../database/trip.schema.js'
import type { TripDocumentReviewView } from '../application/trip-document-review.port.js'
import { canRequestCargoLayout } from '../domain/cargo-layout-availability.policy.js'
import { buildCargoLayoutInput, hashCargoLayoutInput } from '../domain/cargo-layout-hash.policy.js'
import {
  TripCargoLayoutNotReadyError,
  TripDocumentReviewNotFoundError,
} from '../domain/trip-document-review.error.js'
import {
  TripCargoLayoutNotFoundError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
import { checkTripAcceptsLinkage } from '../domain/trip-state.policy.js'
import {
  NFE_DOCUMENT_TARGET_TYPE,
  TRIP_DOCUMENT_REVIEW_AUDIT_PERMISSION,
  TRIP_DOCUMENT_REVIEW_ENTITY_TYPE,
  TRIP_DOCUMENT_REVIEW_LIST_LIMIT,
  type TripDocumentReviewAuditAction,
} from './trip-document-review.constant.js'
import { readCargoLayoutInputParams } from './trip-cargo-layout-input.support.js'
import type { TripQueryable, TripTransaction } from './trip-queryable.type.js'

export type TripDocumentReviewRecord = TripDocumentReviewView & {
  readonly layoutId: string | null
  readonly sourceTripDocumentId: string
}

export type StoredLayoutRow = {
  readonly id: string
  readonly input: unknown
  readonly inputHash: string
  readonly layout: ResolvedCargoLayout | null
  readonly status: string
  readonly tripId: string | null
}

const REVIEW_COLUMNS = {
  createdAt: tripDocumentReviews.createdAt,
  id: tripDocumentReviews.id,
  layoutId: tripDocumentReviews.layoutId,
  nfeDocumentId: tripDocumentReviews.nfeDocumentId,
  nfeNumber: nfeDocuments.number,
  reason: tripDocumentReviews.reason,
  resolutionTripId: tripDocumentReviews.resolutionTripId,
  resolvedAt: tripDocumentReviews.resolvedAt,
  sourceTripDocumentId: tripDocumentReviews.sourceTripDocumentId,
  sourceTripId: tripDocumentReviews.sourceTripId,
  status: tripDocumentReviews.status,
  swappedReviewId: tripDocumentReviews.swappedReviewId,
}

type ReviewRow = Omit<TripDocumentReviewRecord, 'createdAt' | 'nfeNumber' | 'resolvedAt'> & {
  readonly createdAt: Date
  readonly nfeNumber: string | null
  readonly resolvedAt: Date | null
}

function toRecord(row: ReviewRow): TripDocumentReviewRecord {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  }
}

export function toReviewView(record: TripDocumentReviewRecord): TripDocumentReviewView {
  return {
    createdAt: record.createdAt,
    id: record.id,
    nfeDocumentId: record.nfeDocumentId,
    nfeNumber: record.nfeNumber,
    reason: record.reason,
    resolutionTripId: record.resolutionTripId,
    resolvedAt: record.resolvedAt,
    sourceTripId: record.sourceTripId,
    status: record.status,
    swappedReviewId: record.swappedReviewId,
  }
}

function selectReviews(queryable: TripQueryable, where: SQL | undefined) {
  return queryable
    .select(REVIEW_COLUMNS)
    .from(tripDocumentReviews)
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocumentReviews.companyId),
        eq(nfeDocuments.id, tripDocumentReviews.nfeDocumentId),
      ),
    )
    .where(where)
}

export async function readReviewRecord(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly forUpdate?: boolean; readonly reviewId: string },
): Promise<TripDocumentReviewRecord | undefined> {
  const where = and(
    eq(tripDocumentReviews.companyId, params.companyId),
    eq(tripDocumentReviews.id, params.reviewId),
  )
  const query = selectReviews(queryable, where).limit(1)
  const [row] =
    params.forUpdate === true ? await query.for('update', { of: tripDocumentReviews }) : await query
  return row === undefined ? undefined : toRecord(row)
}

export async function requireReviewRecord(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly forUpdate?: boolean; readonly reviewId: string },
): Promise<TripDocumentReviewRecord> {
  const record = await readReviewRecord(queryable, params)
  if (record === undefined) throw new TripDocumentReviewNotFoundError()
  return record
}

export async function listReviewRecords(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly layoutId?: string
    readonly status?: TripDocumentReviewStatus
    readonly tripId?: string
  },
): Promise<readonly TripDocumentReviewRecord[]> {
  const where = and(
    eq(tripDocumentReviews.companyId, params.companyId),
    params.status === undefined ? undefined : eq(tripDocumentReviews.status, params.status),
    params.tripId === undefined ? undefined : eq(tripDocumentReviews.sourceTripId, params.tripId),
    params.layoutId === undefined ? undefined : eq(tripDocumentReviews.layoutId, params.layoutId),
  )
  const rows = await selectReviews(queryable, where)
    .orderBy(asc(tripDocumentReviews.createdAt), asc(tripDocumentReviews.id))
    .limit(TRIP_DOCUMENT_REVIEW_LIST_LIMIT)
  return rows.map(toRecord)
}

export async function insertReview(
  transaction: TripTransaction,
  params: {
    readonly companyId: string
    readonly createdBy: string
    readonly inputHash: string | null
    readonly layoutId: string | null
    readonly nfeDocumentId: string
    readonly reason: TripDocumentReviewReason
    readonly sourceTripDocumentId: string
    readonly sourceTripId: string
  },
): Promise<string> {
  const [created] = await transaction
    .insert(tripDocumentReviews)
    .values(params)
    .returning({ id: tripDocumentReviews.id })
  if (created === undefined) throw new Error('TRIP_DOCUMENT_REVIEW_CREATE_FAILED')
  return created.id
}

/** Condicional a `pending`: a corrida perdida volta como `false`, e quem chama decide. */
export async function resolveReview(
  transaction: TripTransaction,
  params: {
    readonly companyId: string
    readonly resolutionTripDocumentId: string
    readonly resolutionTripId: string
    readonly resolvedBy: string
    readonly reviewId: string
    readonly status: Exclude<TripDocumentReviewStatus, 'pending'>
    readonly swappedReviewId: string | null
  },
): Promise<boolean> {
  const [resolved] = await transaction
    .update(tripDocumentReviews)
    .set({
      resolutionTripDocumentId: params.resolutionTripDocumentId,
      resolutionTripId: params.resolutionTripId,
      resolvedAt: sql`now()`,
      resolvedBy: params.resolvedBy,
      status: params.status,
      swappedReviewId: params.swappedReviewId,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(tripDocumentReviews.companyId, params.companyId),
        eq(tripDocumentReviews.id, params.reviewId),
        eq(tripDocumentReviews.status, 'pending'),
      ),
    )
    .returning({ id: tripDocumentReviews.id })
  return resolved !== undefined
}

export async function readLayoutRow(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly layoutId: string },
): Promise<StoredLayoutRow | undefined> {
  const [row] = await queryable
    .select({
      id: tripCargoLayouts.id,
      input: tripCargoLayouts.input,
      inputHash: tripCargoLayouts.inputHash,
      layout: tripCargoLayouts.layout,
      status: tripCargoLayouts.status,
      tripId: tripCargoLayouts.tripId,
    })
    .from(tripCargoLayouts)
    .where(
      and(
        eq(tripCargoLayouts.companyId, params.companyId),
        eq(tripCargoLayouts.id, params.layoutId),
      ),
    )
    .limit(1)
  // `layout` só é escrito pelo worker, com o `ResolvedCargoLayout` que o pacote devolveu
  return row === undefined
    ? undefined
    : { ...row, layout: row.layout as ResolvedCargoLayout | null }
}

/** D10: move e troca só decidem sobre planta pronta. */
export async function requireReadyLayout(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly layoutId: string },
): Promise<StoredLayoutRow & { readonly layout: ResolvedCargoLayout }> {
  const row = await readLayoutRow(queryable, params)
  if (row === undefined) throw new TripCargoLayoutNotFoundError()
  if (row.status !== 'ready' || row.layout === null) throw new TripCargoLayoutNotReadyError()
  return { ...row, layout: row.layout }
}

export function unplacedOf(layout: ResolvedCargoLayout | null): readonly UnplacedBox[] {
  return layout?.placement?.unplaced ?? []
}

/** O mesmo `SELECT … FOR UPDATE` do vínculo: despacho concorrente espera, ou chega depois e vê a trava. */
export async function lockOpenTrip(
  transaction: TripTransaction,
  params: { readonly companyId: string; readonly tripId: string },
): Promise<void> {
  const [row] = await transaction
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, params.companyId), eq(trips.id, params.tripId)))
    .for('update')
    .limit(1)
  if (row === undefined) throw new TripNotFoundError()
  const block = checkTripAcceptsLinkage(row.status)
  if (block !== null) throw new TripStateTransitionNotAllowedError(block)
}

/** O hash que o gatilho eager calcularia agora; `null` sem baú (planta impossível). */
export async function readCurrentInputHash(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly tripId: string },
): Promise<string | null> {
  const input = await readCargoLayoutInputParams(queryable, params)
  if (input === null || !canRequestCargoLayout(input)) return null
  return hashCargoLayoutInput(buildCargoLayoutInput(input))
}

export async function appendReviewAudit(
  transaction: TripTransaction,
  params: {
    readonly action: TripDocumentReviewAuditAction
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
    readonly metadata: Readonly<Record<string, string | null>>
    readonly nfeDocumentId: string
    readonly reviewId: string
  },
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: params.action,
    actorUserId: params.actorUserId,
    companyId: params.companyId,
    correlationId: params.correlationId,
    entityId: params.reviewId,
    entityType: TRIP_DOCUMENT_REVIEW_ENTITY_TYPE,
    metadata: params.metadata,
    permission: TRIP_DOCUMENT_REVIEW_AUDIT_PERMISSION,
    targetId: params.nfeDocumentId,
    targetType: NFE_DOCUMENT_TARGET_TYPE,
  })
}
