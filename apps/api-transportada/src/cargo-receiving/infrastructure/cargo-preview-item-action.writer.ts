/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 9: a escrita de cada ação do operador, já decidida pela política. O grupo é o
 * conjunto de linhas que fecham (ou sugerem) a mesma nota: confirmar e desvincular agem nele inteiro,
 * porque soltar uma linha de uma soma deixaria as outras apontando para uma nota que não fecha.
 */
import { and, eq, inArray } from 'drizzle-orm'

import { cargoPreviewItems } from '../../database/cargo-preview-item.schema.js'
import {
  CARGO_PREVIEW_DECIDED_BY,
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_ITEM_STATE,
  type CargoPreviewEventKind,
} from '../../shared/cargo-preview.constant.js'
import type { CargoPreviewItemActionResult } from '../application/cargo-preview-request.types.js'
import {
  CARGO_PREVIEW_ITEM_ACTION,
  type CargoPreviewItemAction,
} from '../domain/cargo-preview-item-action.policy.js'
import type { Transaction } from './cargo-arrival-persistence.support.js'
import {
  isCandidateDocument,
  linkDocumentByUser,
  releaseDocumentIfUnused,
} from './cargo-preview-link.writer.js'
import { insertOperatorEvents } from './cargo-preview-persistence.support.js'

export type LockedPreviewItem = {
  readonly id: string
  readonly matchGroupKey: string | null
  readonly matchState: string
  readonly matchedDocumentId: string | null
}

export type ApplyItemActionInput = {
  readonly action: CargoPreviewItemAction
  readonly actorUserId: string
  readonly companyId: string
  readonly contractorId: string
  readonly documentId: string | null
  readonly item: LockedPreviewItem
  readonly now: Date
  readonly previewId: string
}

const EVENT_OF: Readonly<Record<CargoPreviewItemAction, CargoPreviewEventKind>> = {
  confirm: CARGO_PREVIEW_EVENT_KIND.itemConfirmed,
  link: CARGO_PREVIEW_EVENT_KIND.itemLinkedManually,
  unlink: CARGO_PREVIEW_EVENT_KIND.itemUnlinked,
}

/** O grupo do item: as linhas desta prévia com a mesma nota (vinculada) ou a mesma sugestão. */
async function findGroupIds(
  transaction: Transaction,
  input: ApplyItemActionInput,
): Promise<string[]> {
  const { item } = input
  const sameGroup =
    item.matchState === CARGO_PREVIEW_ITEM_STATE.matched && item.matchedDocumentId !== null
      ? eq(cargoPreviewItems.matchedDocumentId, item.matchedDocumentId)
      : item.matchState === CARGO_PREVIEW_ITEM_STATE.suggested && item.matchGroupKey !== null
        ? and(
            eq(cargoPreviewItems.matchState, CARGO_PREVIEW_ITEM_STATE.suggested),
            eq(cargoPreviewItems.matchGroupKey, item.matchGroupKey),
          )
        : eq(cargoPreviewItems.id, item.id)
  if (input.action === CARGO_PREVIEW_ITEM_ACTION.link) return [item.id]
  const rows = await transaction
    .select({ id: cargoPreviewItems.id })
    .from(cargoPreviewItems)
    .where(
      and(
        eq(cargoPreviewItems.companyId, input.companyId),
        eq(cargoPreviewItems.previewId, input.previewId),
        sameGroup,
      ),
    )
    .orderBy(cargoPreviewItems.rowNumber)
    .for('update')
  return rows.map((row) => row.id)
}

async function linkForUser(
  transaction: Transaction,
  input: ApplyItemActionInput & { readonly documentId: string },
): Promise<CargoPreviewItemActionResult | undefined> {
  if (input.item.matchedDocumentId === input.documentId) return undefined
  if (!(await isCandidateDocument(transaction, input))) return { kind: 'document_not_candidate' }
  const outcome = await linkDocumentByUser(transaction, input)
  return outcome === 'elsewhere' ? { kind: 'document_linked_elsewhere' } : undefined
}

function decidedByUser(input: ApplyItemActionInput) {
  return {
    matchedAt: input.now,
    matchedBy: CARGO_PREVIEW_DECIDED_BY.user,
    matchedByUserId: input.actorUserId,
    updatedAt: input.now,
  }
}

export async function applyDecidedItemAction(
  transaction: Transaction,
  input: ApplyItemActionInput,
): Promise<CargoPreviewItemActionResult> {
  const groupIds = await findGroupIds(transaction, input)
  const isUnlink = input.action === CARGO_PREVIEW_ITEM_ACTION.unlink
  if (!isUnlink && input.documentId !== null) {
    const refusal = await linkForUser(transaction, { ...input, documentId: input.documentId })
    if (refusal !== undefined) return refusal
  }
  await transaction
    .update(cargoPreviewItems)
    .set(
      isUnlink
        ? {
            ...decidedByUser(input),
            matchGroupKey: null,
            matchState: CARGO_PREVIEW_ITEM_STATE.awaitingXml,
            matchedDocumentId: null,
          }
        : {
            ...decidedByUser(input),
            matchGroupKey: input.documentId,
            matchState: CARGO_PREVIEW_ITEM_STATE.matched,
            matchedDocumentId: input.documentId,
          },
    )
    .where(
      and(
        eq(cargoPreviewItems.companyId, input.companyId),
        inArray(cargoPreviewItems.id, groupIds),
      ),
    )
  const released = isUnlink ? input.item.matchedDocumentId : null
  if (released !== null) {
    await releaseDocumentIfUnused(transaction, { ...input, documentId: released })
  }
  await insertOperatorEvents(
    transaction,
    groupIds.map((itemId) => ({
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      details: { documentId: isUnlink ? released : input.documentId },
      itemId,
      kind: EVENT_OF[input.action],
      occurredAt: input.now,
      previewId: input.previewId,
    })),
  )
  return { itemIds: groupIds, kind: 'changed' }
}
