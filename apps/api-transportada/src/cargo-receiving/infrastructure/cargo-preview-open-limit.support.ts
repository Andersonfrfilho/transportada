/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S5): o teto de prévias na fila ou em leitura por
 * contratante. Conta e grava sob a trava do envio dele, na transação de quem cria ou reabre: dois
 * envios simultâneos não passam juntos do teto.
 */
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm'

import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import { CARGO_PREVIEW_STATUS } from '../../shared/cargo-preview.constant.js'
import { CargoPreviewTooManyOpenError } from '../domain/cargo-preview.error.js'
import {
  buildCargoPreviewUploadLockKey,
  CARGO_PREVIEW_OPEN_LIMIT,
} from '../domain/cargo-preview-upload.policy.js'
import type { Transaction } from './cargo-arrival-persistence.support.js'

const OPEN_STATUSES = [CARGO_PREVIEW_STATUS.queued, CARGO_PREVIEW_STATUS.processing]

/** `exceptPreviewId`: a prévia que se reabre não conta contra ela mesma. */
export async function assertCargoPreviewOpenLimit(
  transaction: Transaction,
  scope: {
    readonly companyId: string
    readonly contractorId: string
    readonly exceptPreviewId?: string
  },
): Promise<void> {
  const lockKey = buildCargoPreviewUploadLockKey(scope)
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)
  const [row] = await transaction
    .select({ open: count() })
    .from(cargoPreviews)
    .where(
      and(
        eq(cargoPreviews.companyId, scope.companyId),
        eq(cargoPreviews.contractorId, scope.contractorId),
        inArray(cargoPreviews.status, OPEN_STATUSES),
        scope.exceptPreviewId === undefined
          ? undefined
          : ne(cargoPreviews.id, scope.exceptPreviewId),
      ),
    )
  if ((row?.open ?? 0) >= CARGO_PREVIEW_OPEN_LIMIT) {
    throw new CargoPreviewTooManyOpenError(CARGO_PREVIEW_OPEN_LIMIT)
  }
}
