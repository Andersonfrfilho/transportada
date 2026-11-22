/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D9/RF10: escritor único do "mover o canhoto para a NF certa". Trava, valida, move e
 * grava a trilha na mesma `database.transaction` — em chamadas separadas, dois operadores movendo
 * a mesma foto ao mesmo tempo a levariam a dois destinos.
 *
 * ⚠️ Toda consulta leva o `companyId` do contexto, e a viagem entra no filtro (não só na
 * assinatura): nota de outra viagem ou de outra empresa não se distingue de inexistente.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  TRIP_DELIVERY_PROOF_CANHOTO_KIND,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
} from '../../database/trip.schema.js'
import type {
  CanhotoMoveAuditEntry,
  CanhotoMoveTransaction,
  CanhotoMoveUnitOfWork,
  LockedCanhotoMoveSource,
} from '../application/canhoto-move.port.js'
import type { CanhotoMoveTarget } from '../domain/canhoto-move.policy.js'
import { CANHOTO_MOVED_AUDIT_ACTION } from '../domain/canhoto-move.policy.js'
import { DELIVERED_EVENT_KIND } from '../domain/delivery-event.constant.js'
import { deriveCanhotoMismatches } from './canhoto-mismatch.query.js'
import { readCanhotoReviewView } from './drizzle-canhoto-review.repository.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const MOVE_ENTITY_TYPE = 'trip_delivery_proof'
const MOVE_TARGET_TYPE = 'trip'

export class DrizzleCanhotoMoveUnitOfWork implements CanhotoMoveUnitOfWork {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: CanhotoMoveTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(createCanhotoMoveTransaction(transaction)),
    )
  }
}

function createCanhotoMoveTransaction(queryable: TripQueryable): CanhotoMoveTransaction {
  return {
    deriveMismatch: async (input) => {
      const [mismatch] = await deriveCanhotoMismatches(queryable, {
        companyId: input.companyId,
        subjects: [
          {
            expectedAccessKey: input.source.expectedAccessKey,
            expectedNfeDocumentId: input.source.expectedNfeDocumentId,
            expectedNumber: input.source.expectedNumber,
            expectedSeries: input.source.expectedSeries,
            readNumber: input.source.readNumber,
            readSeries: input.source.readSeries,
            review: input.source.review,
          },
        ],
        tripId: input.tripId,
      })
      return mismatch ?? null
    },
    findAlreadyMovedProof: (input) => findAlreadyMovedProof(queryable, input),
    findTarget: (input) => findMoveTarget(queryable, input),
    insertAudit: (entry) => insertMoveAudit(queryable, entry),
    lockSourceProof: (input) => lockMoveSource(queryable, input),
    moveProof: (input) => moveProof(queryable, input),
    readReviewView: (input) => readCanhotoReviewView(queryable, input),
  }
}

/**
 * Duas consultas de propósito (mesmo molde de `lockCanhotoProof`): a junção localiza, e o
 * `FOR NO KEY UPDATE` trava só a linha do comprovante, sem derrubar a FK composta.
 */
async function lockMoveSource(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly documentId: string; readonly tripId: string },
): Promise<LockedCanhotoMoveSource | null> {
  const [located] = await queryable
    .select({
      expectedAccessKey: nfeDocuments.accessKey,
      expectedNfeDocumentId: nfeDocuments.id,
      expectedNumber: nfeDocuments.number,
      expectedSeries: nfeDocuments.series,
      id: tripDeliveryProofs.id,
    })
    .from(tripDeliveryProofs)
    .innerJoin(
      tripStopEvents,
      and(
        eq(tripStopEvents.companyId, tripDeliveryProofs.companyId),
        eq(tripStopEvents.id, tripDeliveryProofs.stopEventId),
      ),
    )
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDeliveryProofs.companyId),
        eq(tripDocuments.id, tripStopEvents.tripDocumentId),
      ),
    )
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .where(
      and(
        eq(tripDeliveryProofs.companyId, input.companyId),
        eq(tripDeliveryProofs.kind, TRIP_DELIVERY_PROOF_CANHOTO_KIND),
        eq(tripStopEvents.tripDocumentId, input.documentId),
        eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
        eq(tripDocuments.tripId, input.tripId),
      ),
    )
    .orderBy(desc(tripStopEvents.createdAt), desc(tripDeliveryProofs.id))
    .limit(1)
  if (located === undefined) return null

  const [row] = await queryable
    .select({
      id: tripDeliveryProofs.id,
      readNumber: tripDeliveryProofs.canhotoReadNumber,
      readSeries: tripDeliveryProofs.canhotoReadSeries,
      review: tripDeliveryProofs.canhotoReview,
      reviewOrigin: tripDeliveryProofs.canhotoReviewOrigin,
    })
    .from(tripDeliveryProofs)
    .where(
      and(eq(tripDeliveryProofs.companyId, input.companyId), eq(tripDeliveryProofs.id, located.id)),
    )
    .for('no key update')
    .limit(1)
  if (row === undefined) return null

  return {
    expectedAccessKey: located.expectedAccessKey ?? null,
    expectedNfeDocumentId: located.expectedNfeDocumentId ?? null,
    expectedNumber: located.expectedNumber ?? null,
    expectedSeries: located.expectedSeries ?? null,
    proofId: row.id,
    readNumber: row.readNumber ?? null,
    readSeries: row.readSeries ?? null,
    review: row.review,
    reviewOrigin: row.reviewOrigin ?? null,
  }
}

/** A nota de destino é do vínculo **vivo** desta viagem; liberada ou de outra viagem é "não é daqui". */
async function findMoveTarget(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly documentId: string; readonly tripId: string },
): Promise<CanhotoMoveTarget | null> {
  const [link] = await queryable
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        eq(tripDocuments.tripId, input.tripId),
        isNull(tripDocuments.releasedAt),
      ),
    )
    .limit(1)
  if (link === undefined) return null

  const events = await queryable
    .select({
      eventId: tripStopEvents.id,
      proofId: tripDeliveryProofs.id,
    })
    .from(tripStopEvents)
    .leftJoin(
      tripDeliveryProofs,
      and(
        eq(tripDeliveryProofs.companyId, tripStopEvents.companyId),
        eq(tripDeliveryProofs.stopEventId, tripStopEvents.id),
        eq(tripDeliveryProofs.kind, TRIP_DELIVERY_PROOF_CANHOTO_KIND),
      ),
    )
    .where(
      and(
        eq(tripStopEvents.companyId, input.companyId),
        eq(tripStopEvents.tripDocumentId, input.documentId),
        eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
      ),
    )
    .orderBy(desc(tripStopEvents.createdAt), desc(tripStopEvents.id))

  // O mesmo evento de entrega que `lockCanhotoProof` lê: o mais recente.
  const [latest] = events
  return {
    deliveredEventId: latest?.eventId ?? null,
    hasCanhotoProof: events.some((event) => event.proofId !== null),
  }
}

async function moveProof(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly proofId: string
    readonly targetEventId: string
  },
): Promise<void> {
  await queryable
    .update(tripDeliveryProofs)
    .set({
      canhotoReadDocumentId: null,
      canhotoReview: 'pending',
      canhotoReviewAt: null,
      canhotoReviewByUserId: null,
      canhotoReviewNote: null,
      canhotoReviewOrigin: null,
      canhotoReviewReason: null,
      stopEventId: input.targetEventId,
    })
    .where(
      and(
        eq(tripDeliveryProofs.companyId, input.companyId),
        eq(tripDeliveryProofs.id, input.proofId),
      ),
    )
}

async function findAlreadyMovedProof(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly fromDocumentId: string
    readonly toDocumentId: string
    readonly tripId: string
  },
): Promise<null | string> {
  const [row] = await queryable
    .select({ proofId: tripDeliveryProofs.id })
    .from(auditLogs)
    .innerJoin(
      tripDeliveryProofs,
      and(
        eq(tripDeliveryProofs.companyId, auditLogs.companyId),
        eq(tripDeliveryProofs.id, auditLogs.entityId),
      ),
    )
    .innerJoin(
      tripStopEvents,
      and(
        eq(tripStopEvents.companyId, tripDeliveryProofs.companyId),
        eq(tripStopEvents.id, tripDeliveryProofs.stopEventId),
      ),
    )
    .where(
      and(
        eq(auditLogs.companyId, input.companyId),
        eq(auditLogs.action, CANHOTO_MOVED_AUDIT_ACTION),
        eq(auditLogs.targetId, input.tripId),
        sql`${auditLogs.metadata}->>'fromDocumentId' = ${input.fromDocumentId}`,
        sql`${auditLogs.metadata}->>'toDocumentId' = ${input.toDocumentId}`,
        eq(tripStopEvents.tripDocumentId, input.toDocumentId),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1)
  return row?.proofId ?? null
}

/** `security.md` §10: ator, alvo, IP e instante. Ids e código de motivo — nunca número, série ou texto. */
async function insertMoveAudit(
  queryable: TripQueryable,
  entry: CanhotoMoveAuditEntry,
): Promise<void> {
  await queryable.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId,
    companyId: entry.companyId,
    correlationId: entry.correlationId,
    entityId: entry.proofId,
    entityType: MOVE_ENTITY_TYPE,
    metadata: {
      fromDocumentId: entry.fromDocumentId,
      ipAddress: entry.ipAddress,
      reason: entry.reason,
      toDocumentId: entry.toDocumentId,
    },
    permission: entry.permission,
    reason: entry.reason,
    targetId: entry.tripId,
    targetType: MOVE_TARGET_TYPE,
  })
}
