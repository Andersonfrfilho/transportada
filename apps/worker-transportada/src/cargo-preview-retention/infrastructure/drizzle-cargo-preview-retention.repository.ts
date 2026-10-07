/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, notInArray } from 'drizzle-orm'

import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { ApplyCargoPreviewRetentionBatch } from '../application/cargo-preview-retention.port.js'
import { applyCargoPreviewRetentionUnit } from '../application/cargo-preview-retention-unit.service.js'
import type { DeleteStoredObjectBytes } from '../application/cargo-preview-retention-unit.port.js'
import {
  CARGO_PREVIEW_RETENTION_UNIT_RESULT,
  type CargoPreviewRetentionUnitResult,
} from '../domain/cargo-preview-retention.constant.js'
import { resolveCargoPreviewRetentionCutoff } from '../domain/cargo-preview-retention.policy.js'
import { buildCargoPreviewRetentionCondition } from './cargo-preview-retention-eligibility.query.js'
import {
  createDrizzleCargoPreviewRetentionGateway,
  type CargoPreviewRetentionDatabase,
} from './drizzle-cargo-preview-retention-gateway.js'

export type { CargoPreviewRetentionDatabase } from './drizzle-cargo-preview-retention-gateway.js'

export function createDrizzleApplyCargoPreviewRetentionBatch(input: {
  readonly database: CargoPreviewRetentionDatabase
  readonly deleteObject: DeleteStoredObjectBytes
  readonly logger?: WorkerLogger
}): ApplyCargoPreviewRetentionBatch {
  const gateway = createDrizzleCargoPreviewRetentionGateway(input.database)

  return async ({ excludedPreviewIds, limit, now }) => {
    // Leitura fora de transação: cada prévia abre a própria, e o lote inteiro não pode segurar
    // trava atrás de I/O de bucket.
    const candidates = await input.database
      .select({ id: cargoPreviews.id })
      .from(cargoPreviews)
      .where(
        and(
          buildCargoPreviewRetentionCondition({
            cutoff: resolveCargoPreviewRetentionCutoff(now),
            executor: input.database,
          }),
          excludedPreviewIds.length === 0
            ? undefined
            : notInArray(cargoPreviews.id, [...excludedPreviewIds]),
        ),
      )
      .orderBy(cargoPreviews.id)
      .limit(limit)

    const counts = { failed: 0, partial: 0, retained: 0, skipped: 0 }
    const deferredPreviewIds: string[] = []
    // Em série de propósito: cada unidade segura uma transação com I/O de rede.
    for (const candidate of candidates) {
      const result = await settleUnit({ ...input, gateway, now, previewId: candidate.id })
      counts[result] += 1
      if (result === 'failed' || result === 'partial') deferredPreviewIds.push(candidate.id)
    }

    return { ...counts, deferredPreviewIds, processed: candidates.length }
  }
}

/** Uma prévia que estoura por motivo imprevisto vira `failed`: não pode trancar as outras do lote. */
async function settleUnit(input: {
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: ReturnType<typeof createDrizzleCargoPreviewRetentionGateway>
  readonly logger?: WorkerLogger
  readonly now: Date
  readonly previewId: string
}): Promise<CargoPreviewRetentionUnitResult> {
  try {
    return await applyCargoPreviewRetentionUnit(input)
  } catch (error) {
    if (input.logger !== undefined) {
      // Só o tipo do erro: a mensagem do Postgres pode trazer o valor da linha.
      safeLogWarn({
        logger: input.logger,
        message: 'cargo_preview_retention_unit_failed',
        metadata: { errorName: error instanceof Error ? error.name : 'unknown' },
      })
    }
    return CARGO_PREVIEW_RETENTION_UNIT_RESULT.failed
  }
}
