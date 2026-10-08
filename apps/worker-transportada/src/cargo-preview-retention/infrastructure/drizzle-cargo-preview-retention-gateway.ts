/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm'

import { cargoPreviewItems, cargoPreviews } from '../../database/cargo-preview.schema.js'
import { cargoPreviewEmailIntakes } from '../../database/cargo-preview-email-intake.schema.js'
import { cargoPreviewEvents } from '../../database/cargo-preview-trail.schema.js'
import { storedObjects } from '../../database/stored-object.schema.js'
import { buildCargoPreviewMatchLockKey } from '../../cargo-preview/domain/cargo-preview-lock.policy.js'
import {
  CARGO_PREVIEW_CHANNEL,
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_RETENTION_DAYS,
} from '../../shared/cargo-preview.constant.js'
import type { CargoPreviewRetentionGateway } from '../application/cargo-preview-retention-unit.port.js'
import { buildCargoPreviewRetentionCondition } from './cargo-preview-retention-eligibility.query.js'

export type CargoPreviewRetentionDatabase = ReturnType<typeof createDrizzleProvider>['db']

/** Adaptador Drizzle da porta da unidade — a única camada que fala SQL nesta rotina. */
export function createDrizzleCargoPreviewRetentionGateway(
  database: CargoPreviewRetentionDatabase,
): CargoPreviewRetentionGateway {
  return {
    async anonymizeItems(preview) {
      // Só as quatro colunas que a decisão do usuário manda anular; estado, valor, peso, roteiro,
      // vínculo e `updated_at` ficam como estavam.
      const changed = await database
        .update(cargoPreviewItems)
        .set({ address: null, neighborhood: null, postalCode: null, recipientName: null })
        .where(
          and(
            eq(cargoPreviewItems.companyId, preview.companyId),
            eq(cargoPreviewItems.previewId, preview.id),
            sql`(${cargoPreviewItems.recipientName} is not null or ${cargoPreviewItems.address} is not null or ${cargoPreviewItems.neighborhood} is not null or ${cargoPreviewItems.postalCode} is not null)`,
          ),
        )
        .returning({ id: cargoPreviewItems.id })
      return changed.length
    },

    async lockEligiblePreview({ cutoff, previewId }) {
      const [known] = await database
        .select({ companyId: cargoPreviews.companyId, contractorId: cargoPreviews.contractorId })
        .from(cargoPreviews)
        .where(eq(cargoPreviews.id, previewId))
      if (known === undefined) return undefined

      // Mesma trava que o vínculo e as ações do operador tomam: sem esperar, porque a transação
      // segura I/O de bucket — operador na prévia agora, a retenção volta na próxima execução.
      const key = buildCargoPreviewMatchLockKey(known)
      const acquired = await database.execute<{ acquired: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as acquired`,
      )
      if ([...acquired][0]?.acquired !== true) return undefined

      const [preview] = await database
        .select({ companyId: cargoPreviews.companyId, id: cargoPreviews.id })
        .from(cargoPreviews)
        .where(
          and(
            eq(cargoPreviews.id, previewId),
            buildCargoPreviewRetentionCondition({ cutoff, executor: database }),
          ),
        )
        .for('update', { skipLocked: true })
      return preview
    },

    // Sem `skip locked` de propósito: objeto pulado por lock pareceria "já apagado", e a unidade
    // registraria a retenção com bytes ainda no bucket.
    async lockLiveObjects({ limit, preview }) {
      const isFileObject = sql`${storedObjects.id} = (select ${cargoPreviews.fileObjectId} from ${cargoPreviews} where ${cargoPreviews.id} = ${preview.id})`
      const isRawObject = sql`${storedObjects.id} in (select ${cargoPreviewEmailIntakes.rawObjectId} from ${cargoPreviewEmailIntakes} where ${cargoPreviewEmailIntakes.companyId} = ${preview.companyId} and ${cargoPreviewEmailIntakes.previewId} = ${preview.id} and ${cargoPreviewEmailIntakes.rawObjectId} is not null)`
      return database
        .select({
          bucket: storedObjects.bucket,
          id: storedObjects.id,
          key: storedObjects.objectKey,
        })
        .from(storedObjects)
        .where(
          and(
            eq(storedObjects.companyId, preview.companyId),
            ne(storedObjects.status, 'deleted'),
            or(isFileObject, isRawObject),
          ),
        )
        .orderBy(storedObjects.id)
        .limit(limit + 1)
        .for('update')
    },

    async markObjectsDeleted(ids) {
      await database
        .update(storedObjects)
        .set({ deletedAt: new Date(), status: 'deleted' })
        .where(inArray(storedObjects.id, [...ids]))
    },

    async recordRetention({ preview, record }) {
      await database.insert(cargoPreviewEvents).values({
        channel: CARGO_PREVIEW_CHANNEL.worker,
        companyId: preview.companyId,
        details: {
          itemsAnonymized: record.itemsAnonymized,
          objectsDeleted: record.objectsDeleted,
          retentionDays: CARGO_PREVIEW_RETENTION_DAYS,
        },
        kind: CARGO_PREVIEW_EVENT_KIND.retentionApplied,
        occurredAt: record.occurredAt,
        previewId: preview.id,
      })
    },

    runInTransaction(work) {
      return database.transaction((transaction) =>
        work(createDrizzleCargoPreviewRetentionGateway(transaction)),
      )
    },
  }
}
