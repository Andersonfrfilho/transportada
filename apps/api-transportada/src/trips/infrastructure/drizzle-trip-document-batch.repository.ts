/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { tripDocumentEvents, tripDocuments, trips, type TripStatus } from '../../database/trip.schema.js'
import { violatedForeignKeyConstraint } from '../../database/postgres-error.support.js'
import type {
  TripDocumentBatchTransitionPort,
  TripDocumentBatchWriteInput,
  TripDocumentBatchWriteResult,
  TripDocumentSnapshotById,
} from '../application/transition-trip-documents-batch.use-case.js'
import { deriveTripStatus, tallyTripDocuments } from '../domain/trip-state.policy.js'
import { TripActorNotAMemberError } from '../domain/trip.error.js'
import { mapTripDocument } from './trip.mapper.js'
import type { TripDatabase, TripTransaction } from './trip-queryable.type.js'

export class DrizzleTripDocumentBatchRepository implements TripDocumentBatchTransitionPort {
  public constructor(private readonly database: TripDatabase) {}

  public async findSnapshots(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
    readonly tripId: string
  }): Promise<{ readonly snapshots: TripDocumentSnapshotById; readonly tripStatus: TripStatus } | null> {
    // Ida 1/2 (tabela trips): confirma a viagem e pega o estado dela, independente de quantos ids
    // vieram no lote.
    const [tripRecord] = await this.database
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (tripRecord === undefined) return null

    // Ida 2/2 (tabela trip_documents): todo o lote de uma vez — nunca um select por documento.
    const documentRecords =
      input.documentIds.length === 0
        ? []
        : await this.database
            .select()
            .from(tripDocuments)
            .where(
              and(
                eq(tripDocuments.companyId, input.companyId),
                eq(tripDocuments.tripId, input.tripId),
                inArray(tripDocuments.id, [...input.documentIds]),
              ),
            )

    const snapshots: [string, { document: ReturnType<typeof mapTripDocument>; documentStatus: (typeof documentRecords)[number]['separationStatus'] }][] =
      documentRecords.map((record) => [
        record.id,
        { document: mapTripDocument(record), documentStatus: record.separationStatus },
      ])

    return { snapshots: new Map(snapshots), tripStatus: tripRecord.status }
  }

  public async writeBatch(
    input: TripDocumentBatchWriteInput,
  ): Promise<TripDocumentBatchWriteResult> {
    return this.database.transaction((transaction) => writeBatch(transaction, input))
  }
}

async function writeBatch(
  transaction: TripTransaction,
  input: TripDocumentBatchWriteInput,
): Promise<TripDocumentBatchWriteResult> {
  const toStatus = input.items[0]?.toStatus
  if (toStatus === undefined) {
    throw new Error('TRIP_DOCUMENT_BATCH_EMPTY')
  }
  const timestampPatch = timestampPatchFor(toStatus)

  // 1/4: um UPDATE só, com o par (id, from_status) de cada nota como guarda de corrida — não um
  // UPDATE por documento.
  const guardRows = sql.join(
    input.items.map((item) => sql`(${item.documentId}::uuid, ${item.fromStatus}::text)`),
    sql`, `,
  )
  const updated = await transaction
    .update(tripDocuments)
    .set({
      returnReason: toStatus === 'returned' ? input.returnReason : null,
      separationStatus: toStatus,
      updatedAt: sql`now()`,
      ...timestampPatch,
    })
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        sql`(${tripDocuments.id}, ${tripDocuments.separationStatus}) in (${guardRows})`,
      ),
    )
    .returning()

  const updatedIds = new Set(updated.map((record) => record.id))
  const racedDocumentIds = input.items
    .map((item) => item.documentId)
    .filter((documentId) => !updatedIds.has(documentId))

  if (updated.length > 0) {
    // 2/4: um INSERT só, uma linha de evento por nota escrita — nunca um insert por documento.
    await insertEvents(transaction, input, updated.map((record) => record.id))
  }

  // 3/4 e 4/4: uma leitura da contagem + um UPDATE condicional em trips, independente do tamanho
  // do lote.
  const tripStatus = await recalculateTripStatus(transaction, input)

  return {
    racedDocumentIds,
    tripStatus,
    updatedDocuments: updated.map(mapTripDocument),
  }
}

async function insertEvents(
  transaction: TripTransaction,
  input: TripDocumentBatchWriteInput,
  writtenDocumentIds: readonly string[],
): Promise<void> {
  const fromStatusByDocumentId = new Map(input.items.map((item) => [item.documentId, item.fromStatus]))
  const toStatus = input.items[0]?.toStatus
  if (toStatus === undefined) return

  try {
    await transaction.insert(tripDocumentEvents).values(
      writtenDocumentIds.map((documentId) => ({
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        fromStatus: fromStatusByDocumentId.get(documentId) ?? null,
        note: input.note,
        toStatus,
        tripDocumentId: documentId,
      })),
    )
  } catch (error) {
    const violated = violatedForeignKeyConstraint(error)
    if (violated === 'trip_document_events_actor_membership_fk') {
      throw new TripActorNotAMemberError()
    }
    throw error
  }
}

function timestampPatchFor(toStatus: TripDocumentBatchWriteInput['items'][number]['toStatus']) {
  if (toStatus === 'separated') return { separatedAt: sql`now()` }
  if (toStatus === 'loaded') return { loadedAt: sql`now()` }
  if (toStatus === 'delivered') return { deliveredAt: sql`now()` }

  return { returnedAt: sql`now()` }
}

async function recalculateTripStatus(
  transaction: TripTransaction,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<TripStatus> {
  const documentRows = await transaction
    .select({ status: tripDocuments.separationStatus })
    .from(tripDocuments)
    .where(and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.tripId, input.tripId)))
  const tally = tallyTripDocuments(documentRows.map((row) => row.status))

  const [tripRecord] = await transaction
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (tripRecord === undefined) throw new Error('TRIP_DOCUMENT_BATCH_TRIP_MISSING')

  const nextStatus = deriveTripStatus({ tally, tripStatus: tripRecord.status })
  if (nextStatus === tripRecord.status) return tripRecord.status

  await transaction
    .update(trips)
    .set({ status: nextStatus, updatedAt: sql`now()` })
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))

  return nextStatus
}
