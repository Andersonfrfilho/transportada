/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: o que os repositórios da prévia compartilham — os filtros pela empresa, a trava do
 * vínculo do contratante (a mesma chave do worker) e a escrita da trilha.
 */
import { eq, sql, type SQL } from 'drizzle-orm'

import { cargoPreviewEvents } from '../../database/cargo-preview-event.schema.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import {
  CARGO_PREVIEW_CHANNEL,
  type CargoPreviewEventKind,
} from '../../shared/cargo-preview.constant.js'
import { buildCargoPreviewMatchLockKey } from '../domain/cargo-preview-upload.policy.js'
import type { Paging } from '../../http/request-parsing.service.js'
import type { ListCargoPreviewsFilters } from '../application/cargo-preview-request.types.js'
import {
  buildDescendingCursorFilter,
  type Transaction,
} from './cargo-arrival-persistence.support.js'

export function buildPreviewFilters(params: {
  readonly companyId: string
  readonly previewId: string
}): SQL[] {
  return [eq(cargoPreviews.companyId, params.companyId), eq(cargoPreviews.id, params.previewId)]
}

/**
 * Advisory, e não a linha do contratante: a importação de NF-e regrava `contractors` e não pode
 * esperar uma decisão de vínculo. Worker e operador tomam a mesma chave antes de ler as notas livres.
 */
export async function lockContractorMatching(
  transaction: Transaction,
  params: { readonly companyId: string; readonly contractorId: string },
): Promise<void> {
  const key = buildCargoPreviewMatchLockKey(params)
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
}

export type OperatorEvent = {
  readonly actorUserId: string
  readonly companyId: string
  readonly details?: Readonly<Record<string, unknown>>
  readonly itemId?: string
  readonly kind: CargoPreviewEventKind
  readonly occurredAt: Date
  readonly previewId: string
}

export async function insertOperatorEvents(
  transaction: Transaction,
  events: readonly OperatorEvent[],
): Promise<void> {
  if (events.length === 0) return
  await transaction.insert(cargoPreviewEvents).values(
    events.map((event) => ({
      actorUserId: event.actorUserId,
      channel: CARGO_PREVIEW_CHANNEL.backoffice,
      companyId: event.companyId,
      details: event.details ?? {},
      itemId: event.itemId ?? null,
      kind: event.kind,
      occurredAt: event.occurredAt,
      previewId: event.previewId,
    })),
  )
}

export function buildPreviewListFilters(params: {
  readonly companyId: string
  readonly filters: ListCargoPreviewsFilters
  readonly paging: Paging
}): SQL[] {
  const filters: (SQL | undefined)[] = [
    eq(cargoPreviews.companyId, params.companyId),
    params.filters.contractorId === undefined
      ? undefined
      : eq(cargoPreviews.contractorId, params.filters.contractorId),
    params.filters.status === undefined
      ? undefined
      : eq(cargoPreviews.status, params.filters.status),
    buildDescendingCursorFilter({
      cursor: params.paging.cursor,
      dateColumn: cargoPreviews.receivedAt,
      idColumn: cargoPreviews.id,
    }),
  ]
  return filters.filter((filter): filter is SQL => filter !== undefined)
}
