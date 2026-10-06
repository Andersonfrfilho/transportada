/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 Fase 4a (ADR-0007): reivindica e marca os pedidos de `cargo_preview_outbox`, no molde do
 * relay do anexo do agregado. O `reevaluate` só fica devido depois do `next_attempt_at` adiado — é
 * assim que um lote de XMLs vira uma reavaliação só.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm'

import { cargoPreviewOutbox } from '../../database/cargo-preview-trail.schema.js'
import {
  CARGO_PREVIEW_EVENT_TYPE,
  cargoPreviewEnvelopeV1Schema,
  type CargoPreviewEnvelopeV1,
} from '../../messaging/cargo-preview-envelope.schema.js'
import { CARGO_PREVIEW_OUTBOX_EVENT } from '../../shared/cargo-preview.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type OutboxRow = typeof cargoPreviewOutbox.$inferSelect

export type CargoPreviewOutboxClaimedEntry = {
  readonly claimOwner: string
  readonly envelope: CargoPreviewEnvelopeV1
}

/** A linha vira o envelope validado: payload que não fecha com o schema não atravessa o broker. */
function toEnvelope(row: OutboxRow): CargoPreviewEnvelopeV1 {
  const payload = (row.payload ?? {}) as Record<string, unknown>
  const isProcess = row.eventType === CARGO_PREVIEW_OUTBOX_EVENT.process
  return cargoPreviewEnvelopeV1Schema.parse({
    companyId: row.companyId,
    correlationId: row.correlationId,
    eventId: row.eventId,
    occurredAt: row.createdAt.toISOString(),
    payload: isProcess
      ? {
          bucket: payload.bucket,
          contractorId: row.contractorId,
          objectKey: payload.objectKey,
          previewId: row.previewId,
        }
      : { contractorId: row.contractorId },
    type: isProcess ? CARGO_PREVIEW_EVENT_TYPE.PROCESS : CARGO_PREVIEW_EVENT_TYPE.REEVALUATE,
    version: 1,
  })
}

export class DrizzleCargoPreviewOutboxRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async claimDueEntries(params: {
    readonly claimOwner: string
    readonly leaseMs: number
    readonly limit: number
    readonly now: Date
  }): Promise<readonly CargoPreviewOutboxClaimedEntry[]> {
    return this.#database.transaction(async (transaction) => {
      const rows = await transaction
        .select()
        .from(cargoPreviewOutbox)
        .where(
          and(
            isNull(cargoPreviewOutbox.publishedAt),
            lte(cargoPreviewOutbox.nextAttemptAt, params.now),
            or(
              isNull(cargoPreviewOutbox.claimOwner),
              lte(cargoPreviewOutbox.claimExpiresAt, params.now),
            ),
          ),
        )
        .orderBy(asc(cargoPreviewOutbox.nextAttemptAt), asc(cargoPreviewOutbox.id))
        .limit(params.limit)
        .for('update', { skipLocked: true })
      if (rows.length === 0) return []
      await transaction
        .update(cargoPreviewOutbox)
        .set({
          claimExpiresAt: new Date(params.now.getTime() + params.leaseMs),
          claimOwner: params.claimOwner,
          updatedAt: params.now,
        })
        .where(
          inArray(
            cargoPreviewOutbox.id,
            rows.map((row) => row.id),
          ),
        )
      return rows.map((row) => ({ claimOwner: params.claimOwner, envelope: toEnvelope(row) }))
    })
  }

  async markPublished(params: {
    readonly claimOwner: string
    readonly companyId: string
    readonly eventId: string
    readonly publishedAt: Date
  }): Promise<void> {
    await this.#database
      .update(cargoPreviewOutbox)
      .set({
        claimExpiresAt: null,
        claimOwner: null,
        publishedAt: params.publishedAt,
        updatedAt: params.publishedAt,
      })
      .where(
        and(
          eq(cargoPreviewOutbox.companyId, params.companyId),
          eq(cargoPreviewOutbox.eventId, params.eventId),
          eq(cargoPreviewOutbox.claimOwner, params.claimOwner),
          isNull(cargoPreviewOutbox.publishedAt),
        ),
      )
  }
}
