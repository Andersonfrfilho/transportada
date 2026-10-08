/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que torna uma prévia elegível à retenção, numa condição só para a consulta de candidatas e para
 * a reconferência sob lock — duas redações divergiriam na primeira mudança.
 *
 * O instante de referência é o **último movimento**: o maior entre o `updated_at` da prévia e o dos
 * seus itens. O item não tem coluna de "fechado em"; o que existe fielmente é o `updated_at`, que se
 * move a cada decisão, desvínculo e reavaliação — e prévia sem item (falhou) cai no próprio
 * `updated_at`.
 */
import { and, eq, inArray, notExists, sql, type SQL } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { cargoPreviewItems, cargoPreviews } from '../../database/cargo-preview.schema.js'
import { cargoPreviewEvents } from '../../database/cargo-preview-trail.schema.js'
import {
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_OPEN_ITEM_STATES,
} from '../../shared/cargo-preview.constant.js'
import { CARGO_PREVIEW_RETENTION_STATUSES } from '../domain/cargo-preview-retention.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
export type CargoPreviewRetentionExecutor = Pick<Database, 'select'>

export function buildCargoPreviewRetentionCondition(input: {
  readonly cutoff: Date
  readonly executor: CargoPreviewRetentionExecutor
}): SQL {
  const { executor } = input
  const openItem = executor
    .select({ id: cargoPreviewItems.id })
    .from(cargoPreviewItems)
    .where(
      and(
        eq(cargoPreviewItems.companyId, cargoPreviews.companyId),
        eq(cargoPreviewItems.previewId, cargoPreviews.id),
        inArray(cargoPreviewItems.matchState, CARGO_PREVIEW_OPEN_ITEM_STATES),
      ),
    )
  const alreadyRetained = executor
    .select({ id: cargoPreviewEvents.id })
    .from(cargoPreviewEvents)
    .where(
      and(
        eq(cargoPreviewEvents.companyId, cargoPreviews.companyId),
        eq(cargoPreviewEvents.previewId, cargoPreviews.id),
        eq(cargoPreviewEvents.kind, CARGO_PREVIEW_EVENT_KIND.retentionApplied),
      ),
    )
  const lastItemMovement = sql`(select max(${cargoPreviewItems.updatedAt}) from ${cargoPreviewItems} where ${cargoPreviewItems.companyId} = ${cargoPreviews.companyId} and ${cargoPreviewItems.previewId} = ${cargoPreviews.id})`
  const lastMovement = sql`greatest(${cargoPreviews.updatedAt}, coalesce(${lastItemMovement}, ${cargoPreviews.updatedAt}))`

  return and(
    inArray(cargoPreviews.status, CARGO_PREVIEW_RETENTION_STATUSES),
    notExists(openItem),
    notExists(alreadyRetained),
    sql`${lastMovement} <= ${input.cutoff}`,
  ) as SQL
}
