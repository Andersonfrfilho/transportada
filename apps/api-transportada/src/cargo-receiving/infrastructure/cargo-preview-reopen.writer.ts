/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 (correção da revisão da Fase 4a, M1): a prévia que falhou, ou cuja leitura se
 * perdeu, volta à fila quando o mesmo arquivo é reenviado — a MESMA prévia, sem migration: situação
 * `queued`, código de falha limpo, evento `uploaded` com `reopened` e um pedido novo ao worker, tudo
 * numa transação. A prévia é travada e reconferida antes: dois reenvios simultâneos reabrem uma vez.
 */
import { and, eq } from 'drizzle-orm'

import { cargoPreviewOutbox } from '../../database/cargo-preview-outbox.schema.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import {
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_OUTBOX_EVENT,
  CARGO_PREVIEW_STATUS,
} from '../../shared/cargo-preview.constant.js'
import type { ReopenCargoPreviewRecord } from '../application/cargo-preview-request.types.js'
import { canReopenCargoPreview } from '../domain/cargo-preview-upload.policy.js'
import type { Transaction } from './cargo-arrival-persistence.support.js'
import { assertCargoPreviewOpenLimit } from './cargo-preview-open-limit.support.js'
import { insertOperatorEvents } from './cargo-preview-persistence.support.js'

export async function reopenPreview(
  transaction: Transaction,
  record: ReopenCargoPreviewRecord,
): Promise<boolean> {
  const scope = and(
    eq(cargoPreviews.companyId, record.companyId),
    eq(cargoPreviews.id, record.previewId),
  )
  const [preview] = await transaction
    .select({ status: cargoPreviews.status, updatedAt: cargoPreviews.updatedAt })
    .from(cargoPreviews)
    .where(scope)
    .for('update')
  if (preview === undefined || !canReopenCargoPreview({ ...preview, now: record.now })) return false
  await assertCargoPreviewOpenLimit(transaction, { ...record, exceptPreviewId: record.previewId })
  await transaction
    .update(cargoPreviews)
    .set({ errorCode: null, status: CARGO_PREVIEW_STATUS.queued, updatedAt: record.now })
    .where(scope)
  await insertOperatorEvents(transaction, [
    {
      actorUserId: record.actorUserId,
      companyId: record.companyId,
      details: { fileSizeBytes: record.fileSizeBytes, reopened: true },
      kind: CARGO_PREVIEW_EVENT_KIND.uploaded,
      occurredAt: record.now,
      previewId: record.previewId,
    },
  ])
  await transaction.insert(cargoPreviewOutbox).values({
    companyId: record.companyId,
    contractorId: record.contractorId,
    correlationId: record.correlationId,
    eventType: CARGO_PREVIEW_OUTBOX_EVENT.process,
    payload: { bucket: record.bucket, objectKey: record.objectKey, previewId: record.previewId },
    previewId: record.previewId,
  })
  return true
}
