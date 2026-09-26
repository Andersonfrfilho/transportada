/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7 (D7, D10–D13): a fila de revisão das notas que não couberam. Cada ação é uma transação;
 * as regras são da política de domínio, e a trava é a mesma do vínculo (`checkTripAcceptsLinkage`).
 */
import { and, eq, isNull } from 'drizzle-orm'

import { nfeDocuments } from '../../database/database.schema.js'
import {
  SWAPPED_OUT_REASON,
  type TripDocumentReviewReason,
} from '../../database/trip-document-review.schema.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import type { CargoLayoutLeaseOptions } from '../application/cargo-layout-request.types.js'
import type { PlanTripRouteTollFreezer } from '../application/plan-trip-route.use-case.js'
import type {
  ListTripDocumentReviewsParams,
  MoveReviewParams,
  PreviewChangeParams,
  PreviewChangeResult,
  ReleaseUnplacedParams,
  ReleaseUnplacedResult,
  SwapReviewParams,
  SwapReviewResult,
  SwapSuggestionsParams,
  SwapSuggestionsResult,
  TripDocumentReviewPort,
  TripDocumentReviewView,
} from '../application/trip-document-review.port.js'
import { canRequestCargoLayout } from '../domain/cargo-layout-availability.policy.js'
import {
  buildCargoLayoutInput,
  buildStoredCargoLayoutInput,
  hashCargoLayoutInput,
} from '../domain/cargo-layout-hash.policy.js'
import { DEFAULT_CARGO_LAYOUT_LEASE_MS } from '../domain/cargo-layout-lease.policy.js'
import type { StoredCargoLayoutInput } from '../domain/cargo-layout-hash.types.js'
import {
  buildSwapSuggestions,
  checkTripDocumentReviewTransition,
  selectReleasableDocuments,
  type ReleasableDocument,
} from '../domain/trip-document-review.policy.js'
import { TripDocumentReviewTransitionError } from '../domain/trip-document-review.error.js'
import { TripCargoLayoutNotFoundError } from '../domain/trip.error.js'
import { upsertCargoLayoutRequest } from './cargo-layout-request.support.js'
import {
  createRequestCargoLayoutForTrip,
  type RequestCargoLayoutForTrip,
} from './eager-cargo-layout-request.support.js'
import { TRIP_DOCUMENT_REVIEW_AUDIT_ACTION } from './trip-document-review.constant.js'
import {
  applyReviewChange,
  assertChangeFits,
  simulateReviewChange,
  type ReviewChange,
} from './trip-document-review-change.support.js'
import { hasLiveLink, insertReleasedLink } from './trip-document-review-link.support.js'
import { releaseUnplacedFromLayout } from './trip-document-review-release.support.js'
import { closePendingReviewOfDocument } from './trip-document-review-relink.support.js'
import {
  appendReviewAudit,
  insertReview,
  listReviewRecords,
  lockOpenTrip,
  readLayoutRow,
  requireReadyLayout,
  requireReviewRecord,
  resolveReview,
  toReviewView,
  unplacedOf,
} from './trip-document-review.query.js'
import { loadTripCargoWeight } from './trip-cargo-weight.support.js'
import { loadTripOccupancy } from './trip-occupancy.support.js'
import type { TripDatabase, TripTransaction } from './trip-queryable.type.js'

function toNumber(value: string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function sumKnown(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null)
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0)
}

export class DrizzleTripDocumentReviewRepository implements TripDocumentReviewPort {
  private readonly requestCargoLayoutForTrip: RequestCargoLayoutForTrip
  private readonly leaseMs: number

  public constructor(
    private readonly database: TripDatabase,
    options: CargoLayoutLeaseOptions = { cargoLayoutLeaseMs: DEFAULT_CARGO_LAYOUT_LEASE_MS },
    private readonly routeFreezer?: PlanTripRouteTollFreezer,
  ) {
    this.requestCargoLayoutForTrip = createRequestCargoLayoutForTrip(options)
    this.leaseMs = options.cargoLayoutLeaseMs
  }

  /** RF12/D6: origem e destino recalculam com `cheapest` sempre — nunca reafirmam a escolha antiga. */
  private async freezeRoutesGracefully(
    companyId: string,
    tripIds: readonly string[],
  ): Promise<void> {
    if (this.routeFreezer === undefined) return
    const freezer = this.routeFreezer
    await Promise.all(
      [...new Set(tripIds)].map(async (tripId) => {
        try {
          await freezer.freeze({ companyId, tripId })
        } catch {
          /* a mudança já está gravada; a rota recalcula no próximo replanejamento (D5) */
        }
      }),
    )
  }

  public async releaseUnplaced(params: ReleaseUnplacedParams): Promise<ReleaseUnplacedResult> {
    return this.database.transaction((transaction) =>
      releaseUnplacedFromLayout(transaction, {
        ...params,
        requestCargoLayoutForTrip: this.requestCargoLayoutForTrip,
      }),
    )
  }

  public async list(
    params: ListTripDocumentReviewsParams,
  ): Promise<readonly TripDocumentReviewView[]> {
    return (await listReviewRecords(this.database, params)).map(toReviewView)
  }

  /** D10: as notas vivas do mesmo caminhão, com o Δ% de peso (NF-e) e de espaço (caixas). */
  public async listSwapSuggestions(params: SwapSuggestionsParams): Promise<SwapSuggestionsResult> {
    const review = await requireReviewRecord(this.database, params)
    const [trip] = await this.database
      .select({ vehicleId: trips.vehicleId })
      .from(trips)
      .where(and(eq(trips.companyId, params.companyId), eq(trips.id, review.sourceTripId)))
      .limit(1)
    const candidates = await this.database
      .select({
        nfeDocumentId: nfeDocuments.id,
        nfeNumber: nfeDocuments.number,
        tripDocumentId: tripDocuments.id,
      })
      .from(tripDocuments)
      .innerJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, tripDocuments.companyId),
          eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, params.companyId),
          eq(tripDocuments.tripId, review.sourceTripId),
          isNull(tripDocuments.releasedAt),
          isNull(tripDocuments.deliveredAt),
        ),
      )

    const nfeDocumentIds = [
      ...candidates.map((candidate) => candidate.nfeDocumentId),
      review.nfeDocumentId,
    ]
    const [weight, occupancy] = await Promise.all([
      loadTripCargoWeight(this.database, { companyId: params.companyId, nfeDocumentIds }),
      // Spec 216: sem veículo vinculado (`awaiting_crew`), a ocupação é a mesma lacuna de "viagem
      // não encontrada" — não há ficha de veículo para medir o baú.
      trip === undefined || trip.vehicleId === null
        ? undefined
        : loadTripOccupancy(this.database, {
            companyId: params.companyId,
            nfeDocumentIds,
            vehicleId: trip.vehicleId,
          }),
    ])
    const volumeOf = (id: string) => toNumber(occupancy?.volumeByDocument.get(id))
    const weightOf = (id: string) => toNumber(weight.weightByDocument.get(id))
    const loads = candidates.map((candidate) => ({
      ...candidate,
      volumeM3: volumeOf(candidate.nfeDocumentId),
      weightKilograms: weightOf(candidate.nfeDocumentId),
    }))
    const incoming = {
      volumeM3: volumeOf(review.nfeDocumentId),
      weightKilograms: weightOf(review.nfeDocumentId),
    }

    return {
      incoming,
      reviewId: review.id,
      suggestions: buildSwapSuggestions({
        candidates: loads,
        incoming,
        truck: {
          volumeM3: sumKnown(loads.map((load) => load.volumeM3)),
          weightKilograms: sumKnown(loads.map((load) => load.weightKilograms)),
        },
      }),
    }
  }

  /**
   * A planta do destino **com** a nota (mover) ou do caminhão com a troca (trocar). Nasce como a
   * prévia da montagem, sem viagem (D3), e o polling reaproveita `GET /trips/cargo-layouts/:layoutId`.
   */
  public async previewChange(params: PreviewChangeParams): Promise<PreviewChangeResult> {
    const review = await requireReviewRecord(this.database, params)
    const change: ReviewChange =
      params.targetTripId === undefined
        ? { kind: 'swap', outTripDocumentId: params.outTripDocumentId }
        : { kind: 'move', targetTripId: params.targetTripId }
    if (review.status !== 'pending') {
      throw new TripDocumentReviewTransitionError({
        from: review.status,
        to: change.kind === 'move' ? 'moved' : 'swapped_in',
      })
    }

    const input = await simulateReviewChange(this.database, {
      change,
      companyId: params.companyId,
      review,
    })
    if (input === null || !canRequestCargoLayout(input)) return { layoutId: null }

    const stored = buildStoredCargoLayoutInput(input)
    const requested = await this.database.transaction((transaction) =>
      upsertCargoLayoutRequest(transaction, {
        companyId: params.companyId,
        correlationId: params.correlationId,
        input: stored,
        inputHash: hashCargoLayoutInput(buildCargoLayoutInput(input)),
        leaseMs: this.leaseMs,
        policyVersion: stored.policyVersion,
        tripId: null,
      }),
    )
    return { layoutId: requested.layoutId }
  }

  public async move(params: MoveReviewParams): Promise<TripDocumentReviewView> {
    const changedTripIds: string[] = []
    const view = await this.database.transaction(async (transaction) => {
      const review = await requireReviewRecord(transaction, { ...params, forUpdate: true })
      const transition = checkTripDocumentReviewTransition({ from: review.status, to: 'moved' })
      if (transition === 'unchanged') {
        if (review.resolutionTripId === params.targetTripId) return toReviewView(review)
        throw new TripDocumentReviewTransitionError({ from: review.status, to: 'moved' })
      }

      const layout = await requireReadyLayout(transaction, {
        companyId: params.companyId,
        layoutId: params.validatedLayoutId,
      })
      const applied = await applyReviewChange(transaction, {
        change: { kind: 'move', targetTripId: params.targetTripId },
        companyId: params.companyId,
        review,
      })
      await assertChangeFits(transaction, {
        companyId: params.companyId,
        layout,
        nfeDocumentId: review.nfeDocumentId,
        tripId: applied.tripId,
      })
      await this.resolveOrThrow(transaction, {
        companyId: params.companyId,
        resolutionTripDocumentId: applied.linkedTripDocumentId,
        resolutionTripId: applied.tripId,
        resolvedBy: params.userId,
        reviewId: review.id,
        status: 'moved',
        swappedReviewId: null,
      })
      await appendReviewAudit(transaction, {
        action: TRIP_DOCUMENT_REVIEW_AUDIT_ACTION.moved,
        actorUserId: params.userId,
        companyId: params.companyId,
        correlationId: params.correlationId,
        metadata: {
          layoutId: layout.id,
          sourceTripId: review.sourceTripId,
          targetTripId: applied.tripId,
        },
        nfeDocumentId: review.nfeDocumentId,
        reviewId: review.id,
      })
      await this.requestCargoLayoutForTrip(transaction, {
        companyId: params.companyId,
        correlationId: params.correlationId,
        tripId: applied.tripId,
      })
      changedTripIds.push(review.sourceTripId, applied.tripId)
      return toReviewView(await requireReviewRecord(transaction, params))
    })
    await this.freezeRoutesGracefully(params.companyId, changedTripIds)
    return view
  }

  public async swap(params: SwapReviewParams): Promise<SwapReviewResult> {
    const changedTripIds: string[] = []
    const result = await this.database.transaction(async (transaction) => {
      const review = await requireReviewRecord(transaction, { ...params, forUpdate: true })
      const transition = checkTripDocumentReviewTransition({
        from: review.status,
        to: 'swapped_in',
      })
      if (transition === 'unchanged') return this.repeatedSwap(transaction, { params, review })

      const layout = await requireReadyLayout(transaction, {
        companyId: params.companyId,
        layoutId: params.validatedLayoutId,
      })
      const applied = await applyReviewChange(transaction, {
        change: { kind: 'swap', outTripDocumentId: params.outTripDocumentId },
        companyId: params.companyId,
        review,
      })
      const swappedOut = applied.swappedOut
      if (swappedOut === null) throw new Error('TRIP_DOCUMENT_REVIEW_SWAP_WITHOUT_OUTGOING')
      await assertChangeFits(transaction, {
        companyId: params.companyId,
        layout,
        nfeDocumentId: review.nfeDocumentId,
        tripId: applied.tripId,
      })

      const outReviewId = await insertReview(transaction, {
        companyId: params.companyId,
        createdBy: params.userId,
        inputHash: null,
        layoutId: null,
        nfeDocumentId: swappedOut.nfeDocumentId,
        reason: SWAPPED_OUT_REASON,
        sourceTripDocumentId: swappedOut.tripDocumentId,
        sourceTripId: review.sourceTripId,
      })
      await this.resolveOrThrow(transaction, {
        companyId: params.companyId,
        resolutionTripDocumentId: applied.linkedTripDocumentId,
        resolutionTripId: applied.tripId,
        resolvedBy: params.userId,
        reviewId: review.id,
        status: 'swapped_in',
        swappedReviewId: outReviewId,
      })
      await appendReviewAudit(transaction, {
        action: TRIP_DOCUMENT_REVIEW_AUDIT_ACTION.swapped,
        actorUserId: params.userId,
        companyId: params.companyId,
        correlationId: params.correlationId,
        metadata: {
          layoutId: layout.id,
          outNfeDocumentId: swappedOut.nfeDocumentId,
          outReviewId,
          sourceTripId: review.sourceTripId,
        },
        nfeDocumentId: review.nfeDocumentId,
        reviewId: review.id,
      })
      await this.requestCargoLayoutForTrip(transaction, {
        companyId: params.companyId,
        correlationId: params.correlationId,
        tripId: applied.tripId,
      })
      changedTripIds.push(applied.tripId)
      return this.readSwap(transaction, { companyId: params.companyId, reviewId: review.id })
    })
    await this.freezeRoutesGracefully(params.companyId, changedTripIds)
    return result
  }

  /**
   * O aceite da proposta que vincula e solta (T7): a nota nasce na viagem nova já solta, com a entrada
   * pendente apontando para a planta da prévia. `false` é a nota viva em outra viagem, como no vínculo.
   */
  public async linkAndReleaseForReview(params: {
    readonly companyId: string
    readonly correlationId: string
    readonly layoutId: string
    readonly nfeDocumentId: string
    readonly reason: TripDocumentReviewReason
    readonly tripId: string
    readonly userId: string
  }): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      await lockOpenTrip(transaction, params)
      const layout = await readLayoutRow(transaction, params)
      if (layout === undefined) throw new TripCargoLayoutNotFoundError()
      if (await hasLiveLink(transaction, params)) return false

      const tripDocumentId = await insertReleasedLink(transaction, params)
      await closePendingReviewOfDocument(transaction, { ...params, tripDocumentId })
      const reviewId = await insertReview(transaction, {
        companyId: params.companyId,
        createdBy: params.userId,
        inputHash: layout.inputHash,
        layoutId: layout.id,
        nfeDocumentId: params.nfeDocumentId,
        reason: params.reason,
        sourceTripDocumentId: tripDocumentId,
        sourceTripId: params.tripId,
      })
      await appendReviewAudit(transaction, {
        action: TRIP_DOCUMENT_REVIEW_AUDIT_ACTION.released,
        actorUserId: params.userId,
        companyId: params.companyId,
        correlationId: params.correlationId,
        metadata: { layoutId: layout.id, reason: params.reason, sourceTripId: params.tripId },
        nfeDocumentId: params.nfeDocumentId,
        reviewId,
      })
      return true
    })
  }

  /** A planta da prévia, lida para o aceite: as notas que ela desenhou e as que ela deixou de fora. */
  public async readReleasePlan(params: {
    readonly companyId: string
    readonly layoutId: string
  }): Promise<{
    readonly documentIds: readonly string[]
    readonly released: readonly ReleasableDocument[]
  }> {
    const layout = await requireReadyLayout(this.database, params)
    // `input` só é escrito pelo upsert, com `buildStoredCargoLayoutInput`
    const stops = (layout.input as Partial<StoredCargoLayoutInput>).stops ?? []
    const documentIds = [
      ...new Set(
        stops.flatMap((stop) =>
          (stop.boxes ?? []).flatMap((box) =>
            box.documentId === undefined || box.documentId === null ? [] : [box.documentId],
          ),
        ),
      ),
    ]
    return { documentIds, released: selectReleasableDocuments(unplacedOf(layout.layout)).released }
  }

  private async resolveOrThrow(
    transaction: TripTransaction,
    params: Parameters<typeof resolveReview>[1],
  ): Promise<void> {
    if (await resolveReview(transaction, params)) return
    throw new TripDocumentReviewTransitionError({ from: 'resolved', to: params.status })
  }

  private async repeatedSwap(
    transaction: TripTransaction,
    input: {
      readonly params: SwapReviewParams
      readonly review: Awaited<ReturnType<typeof requireReviewRecord>>
    },
  ): Promise<SwapReviewResult> {
    const { params, review } = input
    const result =
      review.swappedReviewId === null
        ? undefined
        : await this.readSwap(transaction, { companyId: params.companyId, reviewId: review.id })
    const outgoing =
      review.swappedReviewId === null
        ? undefined
        : await requireReviewRecord(transaction, {
            companyId: params.companyId,
            reviewId: review.swappedReviewId,
          })
    if (result !== undefined && outgoing?.sourceTripDocumentId === params.outTripDocumentId) {
      return result
    }
    throw new TripDocumentReviewTransitionError({ from: review.status, to: 'swapped_in' })
  }

  private async readSwap(
    transaction: TripTransaction,
    params: { readonly companyId: string; readonly reviewId: string },
  ): Promise<SwapReviewResult> {
    const review = await requireReviewRecord(transaction, params)
    if (review.swappedReviewId === null) throw new Error('TRIP_DOCUMENT_REVIEW_SWAP_MISSING')
    const swappedOut = await requireReviewRecord(transaction, {
      companyId: params.companyId,
      reviewId: review.swappedReviewId,
    })
    return { review: toReviewView(review), swappedOut: toReviewView(swappedOut) }
  }
}
