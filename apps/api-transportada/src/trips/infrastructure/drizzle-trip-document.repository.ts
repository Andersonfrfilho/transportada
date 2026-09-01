/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, or, sql } from 'drizzle-orm'

import {
  tripDocumentEvents,
  tripDocuments,
  trips,
  type TripStatus,
} from '../../database/trip.schema.js'
import { cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments } from '../../database/cte-issuance.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { violatedForeignKeyConstraint } from '../../database/postgres-error.support.js'
import type {
  ApplyTripDocumentTransitionInput,
  TripDocumentTransitionOutcome,
  TripDocumentTransitionPort,
  TripDocumentTransitionSnapshot,
} from '../application/transition-trip-document.use-case.js'
import type {
  ListReturnedWithActiveCtePort,
  ReturnedWithActiveCteEntry,
} from '../application/list-returned-with-active-cte.use-case.js'
import { deriveTripStatus, tallyTripDocuments } from '../domain/trip-state.policy.js'
import { TripActorNotAMemberError } from '../domain/trip.error.js'
import { mapTripDocument } from './trip.mapper.js'
import type { TripDatabase, TripQueryable, TripTransaction } from './trip-queryable.type.js'

/** `cte_fiscal_documents.status` — só este valor conta como CT-e "ativo" (mesmo padrão de
 * `cteAuthorizedExpression()` em `trip.query.ts`). */
const AUTHORIZED_CTE_DOCUMENT_STATUS = 'authorized'

export class DrizzleTripDocumentRepository
  implements TripDocumentTransitionPort, ListReturnedWithActiveCtePort
{
  public constructor(private readonly database: TripDatabase) {}

  public async listReturnedWithActiveCte(input: {
    readonly companyId: string
  }): Promise<readonly ReturnedWithActiveCteEntry[]> {
    const rows = await this.database
      .select({
        accessKey: cteFiscalDocuments.accessKey,
        returnReason: tripDocuments.returnReason,
        returnedAt: tripDocuments.returnedAt,
        tripDocumentId: tripDocuments.id,
        tripId: tripDocuments.tripId,
      })
      .from(tripDocuments)
      .leftJoin(
        freightCalculations,
        and(
          eq(freightCalculations.companyId, tripDocuments.companyId),
          eq(freightCalculations.id, tripDocuments.freightCalculationId),
        ),
      )
      .innerJoin(
        cteBatchItems,
        and(
          eq(cteBatchItems.companyId, tripDocuments.companyId),
          or(
            eq(cteBatchItems.nfeDocumentId, tripDocuments.nfeDocumentId),
            eq(cteBatchItems.nfeDocumentId, freightCalculations.nfeDocumentId),
          ),
        ),
      )
      .innerJoin(
        cteFiscalDocuments,
        and(
          eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
          eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
          eq(cteFiscalDocuments.status, AUTHORIZED_CTE_DOCUMENT_STATUS),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.separationStatus, 'returned'),
        ),
      )

    return rows.map((row) => ({
      cteAccessKey: row.accessKey,
      returnedAt: (row.returnedAt ?? new Date()).toISOString(),
      returnReason: row.returnReason ?? '',
      tripDocumentId: row.tripDocumentId,
      tripId: row.tripId,
    }))
  }

  public async findSnapshot(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocumentTransitionSnapshot | null> {
    return readSnapshot(this.database, input)
  }

  public async applyTransition(
    input: ApplyTripDocumentTransitionInput,
  ): Promise<TripDocumentTransitionOutcome> {
    return this.database.transaction((transaction) => applyTransition(transaction, input))
  }
}

async function readSnapshot(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly documentId: string; readonly tripId: string },
): Promise<TripDocumentTransitionSnapshot | null> {
  const [record] = await queryable
    .select({ document: tripDocuments, tripStatus: trips.status })
    .from(tripDocuments)
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        eq(tripDocuments.tripId, input.tripId),
      ),
    )
    .limit(1)
  if (record === undefined) return null

  return {
    document: mapTripDocument(record.document),
    documentStatus: record.document.separationStatus,
    tripStatus: record.tripStatus,
  }
}

/**
 * `toStatus` nunca é `pending` — nenhuma ação da T006 devolve `pending` como alvo — então a coluna
 * de timestamp está sempre determinada.
 */
function timestampPatchFor(toStatus: ApplyTripDocumentTransitionInput['toStatus']) {
  if (toStatus === 'separated') return { separatedAt: sql`now()` }
  if (toStatus === 'loaded') return { loadedAt: sql`now()` }
  if (toStatus === 'delivered') return { deliveredAt: sql`now()` }

  return { returnedAt: sql`now()` }
}

async function applyTransition(
  transaction: TripTransaction,
  input: ApplyTripDocumentTransitionInput,
): Promise<TripDocumentTransitionOutcome> {
  const [updated] = await transaction
    .update(tripDocuments)
    .set({
      returnReason: input.toStatus === 'returned' ? input.returnReason : null,
      separationStatus: input.toStatus,
      updatedAt: sql`now()`,
      ...timestampPatchFor(input.toStatus),
    })
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        eq(tripDocuments.tripId, input.tripId),
        eq(tripDocuments.separationStatus, input.fromStatus),
      ),
    )
    .returning()

  if (updated === undefined) {
    // ADR-0043 §4: outra transação já mudou a nota — quem chamou decide se re-tenta com o
    // estado fresco (T008: transitionTripDocument re-checa e converge em unchanged/blocked/applied).
    const current = await readSnapshot(transaction, input)
    if (current === null) throw new Error('TRIP_DOCUMENT_TRANSITION_TARGET_DISAPPEARED')
    return { document: current.document, raced: true, tripStatus: current.tripStatus }
  }

  await insertEvent(transaction, input)

  const nextTripStatus = await recalculateTripStatus(transaction, input)

  return { document: mapTripDocument(updated), raced: false, tripStatus: nextTripStatus }
}

async function insertEvent(
  transaction: TripTransaction,
  input: ApplyTripDocumentTransitionInput,
): Promise<void> {
  try {
    await transaction.insert(tripDocumentEvents).values({
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      fromStatus: input.fromStatus,
      note: input.note,
      toStatus: input.toStatus,
      tripDocumentId: input.documentId,
    })
  } catch (error) {
    const violated = violatedForeignKeyConstraint(error)
    if (violated === 'trip_document_events_actor_membership_fk') {
      throw new TripActorNotAMemberError()
    }
    throw error
  }
}

/**
 * ADR-0043 §1: consequência aritmética do estado das notas, calculada na mesma transação da
 * escrita da nota. Um `UPDATE` só acontece quando a derivação muda algo.
 */
async function recalculateTripStatus(
  transaction: TripTransaction,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<TripStatus> {
  const documentRows = await transaction
    .select({ status: tripDocuments.separationStatus })
    .from(tripDocuments)
    .where(
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.tripId, input.tripId)),
    )
  const tally = tallyTripDocuments(documentRows.map((row) => row.status))

  const [tripRecord] = await transaction
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (tripRecord === undefined) throw new Error('TRIP_DOCUMENT_TRANSITION_TRIP_MISSING')

  const nextStatus = deriveTripStatus({ tally, tripStatus: tripRecord.status })
  if (nextStatus === tripRecord.status) return tripRecord.status

  await transaction
    .update(trips)
    .set({ status: nextStatus, updatedAt: sql`now()` })
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))

  return nextStatus
}
