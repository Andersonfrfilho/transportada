/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T6.8: escritor único das dez colunas de conferência de `trip_delivery_proofs`. A leitura
 * do estado, a escrita do veredito e a trilha acontecem sempre dentro da mesma
 * `database.transaction` — em duas chamadas separadas, dois operadores decidindo ao mesmo tempo
 * gravariam um veredito por cima do outro sem que nada falhasse.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  TRIP_DELIVERY_PROOF_CANHOTO_KIND,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
} from '../../database/trip.schema.js'
import type {
  CanhotoReviewAuditEntry,
  CanhotoReviewTransaction,
  CanhotoReviewUnitOfWork,
  CanhotoReviewView,
  LockedCanhotoProof,
} from '../application/canhoto-review.port.js'
import { DELIVERED_EVENT_KIND } from '../domain/delivery-event.constant.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const CANHOTO_REVIEW_ENTITY_TYPE = 'trip_delivery_proof'
const CANHOTO_REVIEW_TARGET_TYPE = 'trip'

export class DrizzleCanhotoReviewUnitOfWork implements CanhotoReviewUnitOfWork {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: CanhotoReviewTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(createCanhotoReviewTransaction(transaction)),
    )
  }
}

function createCanhotoReviewTransaction(queryable: TripQueryable): CanhotoReviewTransaction {
  return {
    applyReview: (input) => applyCanhotoReview(queryable, input),
    insertAudit: (entry) => insertCanhotoReviewAudit(queryable, entry),
    lockCanhotoProof: (input) => lockCanhotoProof(queryable, input),
    readReviewView: (input) => readCanhotoReviewView(queryable, input),
  }
}

/**
 * ⚠️ Duas consultas de propósito: a junção **localiza** o canhoto e o `FOR NO KEY UPDATE` trava
 * **só a linha do comprovante**. Travar na junção derrubaria a FK composta que outra escrita pega
 * com `FOR KEY SHARE` — é o padrão que o CLAUDE.md da app recusa.
 *
 * A viagem entra no filtro, não só na assinatura: sem ela, uma nota de outra viagem da mesma
 * empresa devolveria o canhoto dela por um id que o chamador já tinha em mãos.
 */
async function lockCanhotoProof(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  },
): Promise<LockedCanhotoProof | null> {
  const [located] = await queryable
    .select({ documentNumber: nfeDocuments.number, id: tripDeliveryProofs.id })
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
    /** `leftJoin`: vínculo sem NF-e existe, e ele só significa "não há número contra o que conferir". */
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
      review: tripDeliveryProofs.canhotoReview,
      reviewOrigin: tripDeliveryProofs.canhotoReviewOrigin,
    })
    .from(tripDeliveryProofs)
    .where(
      and(eq(tripDeliveryProofs.companyId, input.companyId), eq(tripDeliveryProofs.id, located.id)),
    )
    .for('no key update')
    .limit(1)

  return row === undefined
    ? null
    : {
        ...row,
        documentNumber: located.documentNumber ?? null,
        reviewOrigin: row.reviewOrigin ?? null,
      }
}

async function applyCanhotoReview(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly proofId: string
    readonly update: Record<string, Date | null | string>
  },
): Promise<void> {
  await queryable
    .update(tripDeliveryProofs)
    .set(input.update)
    .where(
      and(
        eq(tripDeliveryProofs.companyId, input.companyId),
        eq(tripDeliveryProofs.id, input.proofId),
      ),
    )
}

/**
 * `security.md` §10: ator, alvo, IP e instante. O IP viaja em `metadata` — a tabela não tem coluna
 * própria. ⚠️ O texto livre **não** entra: só o motivo da lista fechada (RF31).
 */
async function insertCanhotoReviewAudit(
  queryable: TripQueryable,
  entry: CanhotoReviewAuditEntry,
): Promise<void> {
  await queryable.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId,
    companyId: entry.companyId,
    correlationId: entry.correlationId,
    entityId: entry.proofId,
    entityType: CANHOTO_REVIEW_ENTITY_TYPE,
    metadata: {
      ipAddress: entry.ipAddress,
      ...(entry.reason === null ? {} : { reason: entry.reason }),
    },
    permission: entry.permission,
    targetId: entry.tripId,
    targetType: CANHOTO_REVIEW_TARGET_TYPE,
  })
}

async function readCanhotoReviewView(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly proofId: string },
): Promise<CanhotoReviewView> {
  const [row] = await queryable
    .select({
      canhotoReadNumber: tripDeliveryProofs.canhotoReadNumber,
      canhotoReadSeries: tripDeliveryProofs.canhotoReadSeries,
      canhotoReadSource: tripDeliveryProofs.canhotoReadSource,
      canhotoReview: tripDeliveryProofs.canhotoReview,
      canhotoReviewAt: tripDeliveryProofs.canhotoReviewAt,
      canhotoReviewNote: tripDeliveryProofs.canhotoReviewNote,
      canhotoReviewOrigin: tripDeliveryProofs.canhotoReviewOrigin,
      canhotoReviewReason: tripDeliveryProofs.canhotoReviewReason,
    })
    .from(tripDeliveryProofs)
    .where(
      and(
        eq(tripDeliveryProofs.companyId, input.companyId),
        eq(tripDeliveryProofs.id, input.proofId),
      ),
    )
    .limit(1)
  if (row === undefined) throw new Error('canhoto review row vanished inside its own transaction')

  return {
    canhotoReadNumber: row.canhotoReadNumber ?? null,
    canhotoReadSeries: row.canhotoReadSeries ?? null,
    canhotoReadSource: row.canhotoReadSource ?? null,
    canhotoReview: row.canhotoReview,
    canhotoReviewAt: row.canhotoReviewAt?.toISOString() ?? null,
    canhotoReviewNote: row.canhotoReviewNote ?? null,
    canhotoReviewOrigin: row.canhotoReviewOrigin ?? null,
    canhotoReviewReason: row.canhotoReviewReason ?? null,
  }
}
