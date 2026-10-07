/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, notInArray } from 'drizzle-orm'

import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { ApplyCargoPreviewRetentionBatch } from '../application/cargo-preview-retention.port.js'
import { settleCargoPreviewRetentionUnit } from '../application/cargo-preview-retention-unit.service.js'
import type { DeleteStoredObjectBytes } from '../application/cargo-preview-retention-unit.port.js'
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
      const result = await settleCargoPreviewRetentionUnit({
        ...input,
        gateway,
        now,
        previewId: candidate.id,
      })
      counts[result] += 1
      if (result === 'failed' || result === 'partial') deferredPreviewIds.push(candidate.id)
    }

    return { ...counts, deferredPreviewIds, processed: candidates.length }
  }
}
