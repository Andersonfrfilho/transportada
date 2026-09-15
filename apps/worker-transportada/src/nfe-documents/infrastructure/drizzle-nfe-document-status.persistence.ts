/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { nfeDocumentStatusChanges, nfeDocuments, nfeEvents } from '../../database/nfe.schema.js'
import {
  ALLOWED_ORIGIN_STATUSES,
  NFE_DOCUMENT_STATUS_LOCK_NAMESPACE,
  NFE_EVENT_AUTOMATIC_ORIGIN,
  NFE_STATUS_CHANGING_EVENT_TYPES,
} from '../domain/nfe-document-status.constant.js'
import { resolveEventStatusChange } from '../domain/nfe-document-status-transition.policy.js'
import type {
  ApplyStatusChangeParams,
  ApplyStatusChangeResult,
  FindPendingStatusFromEventsParams,
  FindPendingStatusFromEventsResult,
  LockAccessKeyParams,
  ReadDocumentStatusParams,
  ReadDocumentStatusResult,
  RecordStatusChangeParams,
} from '../types/nfe-document-status.types.js'

const STATUS_CHANGING_EVENT_TYPES = Object.keys(NFE_STATUS_CHANGING_EVENT_TYPES)

/** D8 — primeiro comando da transação; toda escrita de status da chave passa por aqui. */
export async function lockAccessKey(params: LockAccessKeyParams): Promise<void> {
  const key = `${NFE_DOCUMENT_STATUS_LOCK_NAMESPACE}:${params.companyId}:${params.accessKey}`
  await params.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
}

/** Sem `FOR UPDATE`: o lock da chave já serializa todo escritor de status. */
export async function readDocumentStatus(
  params: ReadDocumentStatusParams,
): Promise<ReadDocumentStatusResult> {
  const [row] = await params.tx
    .select({ documentId: nfeDocuments.id, status: nfeDocuments.status })
    .from(nfeDocuments)
    .where(
      and(
        eq(nfeDocuments.companyId, params.companyId),
        eq(nfeDocuments.accessKey, params.accessKey),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * D4, D7 — a guarda está no `WHERE`. `clock_timestamp()`, não `now()`: quem esperou o lock tem um
 * `now()` anterior ao `created_at` da nota que a outra transação acabou de inserir.
 */
export async function applyStatusChange(
  params: ApplyStatusChangeParams,
): Promise<ApplyStatusChangeResult> {
  const origins = ALLOWED_ORIGIN_STATUSES[params.to] ?? []
  if (origins.length === 0) return { changed: false }

  const [row] = await params.tx
    .update(nfeDocuments)
    .set({ status: params.to, updatedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(nfeDocuments.companyId, params.companyId),
        eq(nfeDocuments.id, params.documentId),
        inArray(nfeDocuments.status, [...origins]),
      ),
    )
    .returning({ changedAt: sql<string>`${nfeDocuments.updatedAt}::text` })
  return row === undefined ? { changed: false } : { changed: true, changedAt: row.changedAt }
}

/** A unique `(empresa, nota, status_after)` torna a trilha idempotente sob reprocessamento. */
export async function recordStatusChange(params: RecordStatusChangeParams): Promise<void> {
  const { change, provenance } = params
  await params.tx
    .insert(nfeDocumentStatusChanges)
    .values({
      actorUserId: provenance.actorUserId,
      cause: change.cause,
      changedAt: sql`${params.changedAt}::timestamptz`,
      companyId: params.companyId,
      documentId: change.documentId,
      eventId: params.eventId,
      importId: provenance.importId,
      origin: provenance.origin,
      requestedByUserId: provenance.requestedByUserId,
      statusAfter: change.to,
      statusBefore: change.from,
    })
    .onConflictDoNothing({
      target: [
        nfeDocumentStatusChanges.companyId,
        nfeDocumentStatusChanges.documentId,
        nfeDocumentStatusChanges.statusAfter,
      ],
    })
}

/**
 * D5 — o filtro de `cStat` fica na política, não no SQL: ela continua sendo a única fonte. D21: só
 * evento da distribuição; o de upload (e o legado, sem origem) não faz a nota nascer cancelada.
 */
export async function findPendingStatusFromEvents(
  params: FindPendingStatusFromEventsParams,
): Promise<FindPendingStatusFromEventsResult> {
  const rows = await params.tx
    .select({ eventType: nfeEvents.eventType, id: nfeEvents.id, statusCode: nfeEvents.statusCode })
    .from(nfeEvents)
    .where(
      and(
        eq(nfeEvents.companyId, params.companyId),
        eq(nfeEvents.targetAccessKey, params.accessKey),
        eq(nfeEvents.origin, NFE_EVENT_AUTOMATIC_ORIGIN),
        inArray(nfeEvents.eventType, STATUS_CHANGING_EVENT_TYPES),
      ),
    )
    .orderBy(asc(nfeEvents.createdAt), asc(nfeEvents.id))

  for (const row of rows) {
    const resolution = resolveEventStatusChange({
      eventType: row.eventType,
      origin: NFE_EVENT_AUTOMATIC_ORIGIN,
      statusCode: row.statusCode ?? undefined,
    })
    if (resolution.kind === 'change') return { eventId: row.id, to: resolution.to }
  }
  return null
}
