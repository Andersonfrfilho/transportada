/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 9 e RF5b: as ações do operador numa transação, com a trava do vínculo do
 * contratante tomada antes de ler o item — a mesma do worker, então a máquina e o operador nunca
 * ligam a mesma nota a dois grupos.
 */
import { and, eq } from 'drizzle-orm'

import { cargoPreviewItems } from '../../database/cargo-preview-item.schema.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import {
  CARGO_PREVIEW_ITEM_STATE,
  CARGO_PREVIEW_STATUS,
  type CargoPreviewDecidedBy,
  type CargoPreviewItemState,
} from '../../shared/cargo-preview.constant.js'
import type { CargoPreviewActionRepositoryPort } from '../application/cargo-preview.port.js'
import type { CargoPreviewItemActionResult } from '../application/cargo-preview-request.types.js'
import { decideCargoPreviewItemAction } from '../domain/cargo-preview-item-action.policy.js'
import type { Database, Transaction } from './cargo-arrival-persistence.support.js'
import { applyDecidedItemAction } from './cargo-preview-item-action.writer.js'
import { buildPreviewFilters, lockContractorMatching } from './cargo-preview-persistence.support.js'
import { proposeArrivalFromPreview } from './cargo-preview-proposal.query.js'

type ActionParams = Parameters<CargoPreviewActionRepositoryPort['applyItemAction']>[0]

function suggestedDocumentOf(input: {
  readonly evidence: Readonly<Record<string, unknown>> | null
  readonly state: CargoPreviewItemState
}): string | null {
  if (input.state !== CARGO_PREVIEW_ITEM_STATE.suggested) return null
  const candidates = input.evidence?.candidateDocumentIds
  const first: unknown = Array.isArray(candidates) ? candidates[0] : undefined
  return typeof first === 'string' ? first : null
}

async function lockItem(transaction: Transaction, params: ActionParams) {
  const [item] = await transaction
    .select({
      id: cargoPreviewItems.id,
      matchEvidence: cargoPreviewItems.matchEvidence,
      matchGroupKey: cargoPreviewItems.matchGroupKey,
      matchState: cargoPreviewItems.matchState,
      matchedBy: cargoPreviewItems.matchedBy,
      matchedDocumentId: cargoPreviewItems.matchedDocumentId,
    })
    .from(cargoPreviewItems)
    .where(
      and(
        eq(cargoPreviewItems.companyId, params.companyId),
        eq(cargoPreviewItems.previewId, params.previewId),
        eq(cargoPreviewItems.id, params.itemId),
      ),
    )
    .for('update')
  return item
}

async function applyItemAction(
  transaction: Transaction,
  params: ActionParams,
): Promise<CargoPreviewItemActionResult> {
  const [preview] = await transaction
    .select({ contractorId: cargoPreviews.contractorId, status: cargoPreviews.status })
    .from(cargoPreviews)
    .where(and(...buildPreviewFilters(params)))
  if (preview === undefined) return { kind: 'preview_not_found' }
  if (preview.status !== CARGO_PREVIEW_STATUS.ready) return { kind: 'not_ready' }
  await lockContractorMatching(transaction, { ...params, contractorId: preview.contractorId })
  const item = await lockItem(transaction, params)
  if (item === undefined) return { kind: 'item_not_found' }
  const decision = decideCargoPreviewItemAction({
    action: params.action,
    item: {
      matchState: item.matchState,
      matchedBy: item.matchedBy as CargoPreviewDecidedBy | null,
      matchedDocumentId: item.matchedDocumentId,
      suggestedDocumentId: suggestedDocumentOf({
        evidence: item.matchEvidence,
        state: item.matchState,
      }),
    },
    ...(params.documentId === undefined ? {} : { documentId: params.documentId }),
  })
  if (decision.kind === 'refused') return { code: decision.code, kind: 'refused' }
  if (decision.kind === 'unchanged') return { itemIds: [item.id], kind: 'unchanged' }
  return applyDecidedItemAction(transaction, {
    ...params,
    contractorId: preview.contractorId,
    documentId: decision.documentId,
    item,
  })
}

export class DrizzleCargoPreviewActionRepository implements CargoPreviewActionRepositoryPort {
  public constructor(private readonly database: Database) {}

  public applyItemAction(params: ActionParams): Promise<CargoPreviewItemActionResult> {
    return this.database.transaction((transaction) => applyItemAction(transaction, params))
  }

  public proposeArrival(
    params: Parameters<CargoPreviewActionRepositoryPort['proposeArrival']>[0],
  ): ReturnType<CargoPreviewActionRepositoryPort['proposeArrival']> {
    return this.database.transaction((transaction) =>
      proposeArrivalFromPreview(transaction, params),
    )
  }
}
