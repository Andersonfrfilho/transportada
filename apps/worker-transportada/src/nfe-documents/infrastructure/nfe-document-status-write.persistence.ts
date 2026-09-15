/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import type { NfeDocumentStatus, NfeDocumentStatusChangeCause } from '../../database/nfe.schema.js'
import { nfeEvents } from '../../database/nfe.schema.js'
import { NFE_DOCUMENT_AUTHORIZED_STATUS } from '../domain/nfe-document-status.constant.js'
import { NfeDocumentStatusInvariantError } from '../domain/nfe-document-status.error.js'
import {
  isStatusTransitionAllowed,
  resolveEventStatusChange,
  resolveSummaryStatusChange,
} from '../domain/nfe-document-status-transition.policy.js'
import type {
  ApplySummaryStatusParams,
  LogNfeStatusWriteResultParams,
  NfeEventWriteResult,
  NfeStatusChangeRecord,
  NfeStatusProvenance,
  NfeStatusWriteResult,
  RecordDocumentInsertChangeParams,
  ResolveInitialDocumentStatusParams,
  ResolveInitialDocumentStatusResult,
  WriteEventWithStatusParams,
} from '../types/nfe-document-status.types.js'
import type { NfeWriteTransaction } from '../types/nfe-write-transaction.types.js'
import {
  applyStatusChange,
  findPendingStatusFromEvents,
  readDocumentStatus,
  recordStatusChange,
} from './drizzle-nfe-document-status.persistence.js'

const STATUS_CODE_PATTERN = /^\d{3}$/
const PROTOCOL_PATTERN = /^\d{15}$/
const NO_STATUS_EFFECT: NfeStatusWriteResult = { change: null, warning: null }
const CORRECTION_EVENT_TYPE = '110110'
const CORRECTION_TEXT_MAX_LENGTH = 1000

type ApplyAndRecordChangeParams = {
  readonly cause: NfeDocumentStatusChangeCause
  readonly companyId: string
  readonly current: { readonly documentId: string; readonly status: NfeDocumentStatus }
  readonly eventId: string | null
  readonly provenance: NfeStatusProvenance
  readonly to: NfeDocumentStatus
  readonly tx: NfeWriteTransaction
}

/** Sob o lock o `WHERE` não tem como recusar: se recusou, a transação desfaz e a mensagem volta. */
async function applyAndRecordChange(
  params: ApplyAndRecordChangeParams,
): Promise<NfeStatusChangeRecord> {
  const { companyId, current, tx } = params
  const applied = await applyStatusChange({
    companyId,
    documentId: current.documentId,
    to: params.to,
    tx,
  })
  if (!applied.changed) {
    throw new NfeDocumentStatusInvariantError({ companyId, step: 'apply-status-change' })
  }

  const change: NfeStatusChangeRecord = {
    cause: params.cause,
    documentId: current.documentId,
    from: current.status,
    to: params.to,
  }
  await recordStatusChange({
    change,
    changedAt: applied.changedAt,
    companyId,
    eventId: params.eventId,
    provenance: params.provenance,
    tx,
  })
  return change
}

/** A5 "Evento", passos 3–8. O lock e o `stored_objects` já foram feitos pelo chamador. */
export async function writeEventWithStatus(
  params: WriteEventWithStatusParams,
): Promise<NfeEventWriteResult> {
  const { companyId, event, provenance, tx } = params
  const current = await readDocumentStatus({ accessKey: event.accessKey, companyId, tx })
  // Código fora do formato viraria violação de CHECK e derrubaria a importação inteira
  const statusCode =
    event.statusCode !== undefined && STATUS_CODE_PATTERN.test(event.statusCode)
      ? event.statusCode
      : undefined
  // nProt tem 15 dígitos: fora disso não é protocolo da SEFAZ, é texto que ninguém validou
  const protocol =
    statusCode !== undefined &&
    event.protocol !== undefined &&
    PROTOCOL_PATTERN.test(event.protocol)
      ? event.protocol
      : null
  const resolution = resolveEventStatusChange({
    eventType: event.type,
    origin: provenance.origin,
    statusCode,
  })
  const target =
    resolution.kind === 'change' &&
    current !== null &&
    isStatusTransitionAllowed({ from: current.status, to: resolution.to })
      ? resolution.to
      : null

  const [inserted] = await tx
    .insert(nfeEvents)
    .values({
      actorUserId: provenance.actorUserId,
      companyId,
      correctionText:
        event.type === CORRECTION_EVENT_TYPE
          ? (event.correctionText?.slice(0, CORRECTION_TEXT_MAX_LENGTH) ?? null)
          : null,
      documentStatusAfter: current === null ? null : (target ?? current.status),
      documentStatusBefore: current?.status ?? null,
      environment: params.environment ?? null,
      eventSequence: BigInt(event.sequence),
      eventType: event.type,
      importId: provenance.importId,
      occurredAt: new Date(event.occurredAt),
      origin: provenance.origin,
      protocol,
      requestedByUserId: provenance.requestedByUserId,
      sourceNsu: params.sourceNsu ?? null,
      statusCode: statusCode ?? null,
      targetAccessKey: event.accessKey,
      xmlObjectId: params.xmlObjectId,
    })
    .onConflictDoNothing({
      target: [
        nfeEvents.companyId,
        nfeEvents.targetAccessKey,
        nfeEvents.eventType,
        nfeEvents.eventSequence,
      ],
    })
    .returning({ id: nfeEvents.id })
  // D15: o evento repetido não reescreve snapshot nem origem da linha que já existe
  const eventId = inserted?.id ?? (await findEventId({ companyId, event, tx }))

  // Vale também para o repetido: cobre o evento gravado antes desta spec, sem backfill
  const change =
    current !== null && target !== null
      ? await applyAndRecordChange({
          cause: 'event',
          companyId,
          current,
          eventId,
          provenance,
          to: target,
          tx,
        })
      : null
  const warning =
    resolution.kind === 'not-applied'
      ? {
          code: 'nfe_event_status_not_applied' as const,
          eventId,
          eventType: event.type,
          reason: resolution.reason,
        }
      : null
  return { change, inserted: inserted !== undefined, warning }
}

async function findEventId(
  params: Pick<WriteEventWithStatusParams, 'companyId' | 'event' | 'tx'>,
): Promise<string> {
  const [row] = await params.tx
    .select({ id: nfeEvents.id })
    .from(nfeEvents)
    .where(
      and(
        eq(nfeEvents.companyId, params.companyId),
        eq(nfeEvents.targetAccessKey, params.event.accessKey),
        eq(nfeEvents.eventType, params.event.type),
        eq(nfeEvents.eventSequence, BigInt(params.event.sequence)),
      ),
    )
    .limit(1)
  if (row === undefined) {
    throw new NfeDocumentStatusInvariantError({
      companyId: params.companyId,
      step: 'find-event-id',
    })
  }
  return row.id
}

/** D5 — a nota que chega depois do cancelamento já nasce cancelada. */
export async function resolveInitialDocumentStatus(
  params: ResolveInitialDocumentStatusParams,
): Promise<ResolveInitialDocumentStatusResult> {
  const pending = await findPendingStatusFromEvents(params)
  if (pending !== null && isStatusTransitionAllowed({ from: params.xmlStatus, to: pending.to })) {
    return { pendingEventId: pending.eventId, status: pending.to }
  }
  return { pendingEventId: null, status: params.xmlStatus }
}

/** A linha do evento continua `null`/`null` (D15): quem conta a mudança é esta linha. */
export async function recordDocumentInsertChange(
  params: RecordDocumentInsertChangeParams,
): Promise<NfeStatusChangeRecord | null> {
  if (params.pendingEventId === null || params.status === params.xmlStatus) return null

  const change: NfeStatusChangeRecord = {
    cause: 'document_insert',
    documentId: params.documentId,
    from: params.xmlStatus,
    to: params.status,
  }
  await recordStatusChange({
    change,
    changedAt: params.createdAt,
    companyId: params.companyId,
    eventId: params.pendingEventId,
    provenance: params.provenance,
    tx: params.tx,
  })
  return change
}

/** D3 — o resumo só vale para nota que já existe; chegar ao destino de novo é silêncio. */
export async function applySummaryStatus(
  params: ApplySummaryStatusParams,
): Promise<NfeStatusWriteResult> {
  const resolution = resolveSummaryStatusChange({ situation: params.situation })
  if (resolution.kind !== 'change') return NO_STATUS_EFFECT
  const current = await readDocumentStatus(params)
  if (current === null) return NO_STATUS_EFFECT

  if (isStatusTransitionAllowed({ from: current.status, to: resolution.to })) {
    const change = await applyAndRecordChange({
      cause: 'summary',
      companyId: params.companyId,
      current,
      eventId: null,
      provenance: params.provenance,
      to: resolution.to,
      tx: params.tx,
    })
    return { change, warning: null }
  }
  if (current.status === NFE_DOCUMENT_AUTHORIZED_STATUS && resolution.to === 'denied') {
    return {
      change: null,
      warning: {
        code: 'nfe_summary_status_inconsistent',
        documentId: current.documentId,
        situation: params.situation,
      },
    }
  }
  return NO_STATUS_EFFECT
}

/** Chamado depois do commit: log de transação desfeita mentiria. Nunca chave, XML ou texto. */
export function logNfeStatusWriteResult(params: LogNfeStatusWriteResultParams): void {
  const { companyId, logger, result } = params
  if (result === null) return

  if (result.change !== null) {
    const { cause, documentId, from, to } = result.change
    logger.info('nfe_document_status_changed', { cause, companyId, documentId, from, to })
  }
  if (result.warning !== null) {
    const { code, ...fields } = result.warning
    logger.warn(code, { companyId, ...fields })
  }
}
