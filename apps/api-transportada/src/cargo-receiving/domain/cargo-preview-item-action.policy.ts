/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 9: o operador confirma a sugestão, desvincula e vincula à mão. Sem I/O: o
 * repositório traz o item travado, a decisão é daqui. Repetir a ação já feita é no-op sem evento;
 * o item decidido pelo operador nunca mais é tocado pela reavaliação automática.
 */
import {
  CARGO_PREVIEW_DECIDED_BY,
  CARGO_PREVIEW_ITEM_STATE,
  type CargoPreviewDecidedBy,
  type CargoPreviewItemState,
} from '../../shared/cargo-preview.constant.js'

export const CARGO_PREVIEW_ITEM_ACTION = {
  confirm: 'confirm',
  link: 'link',
  unlink: 'unlink',
} as const
export type CargoPreviewItemAction =
  (typeof CARGO_PREVIEW_ITEM_ACTION)[keyof typeof CARGO_PREVIEW_ITEM_ACTION]

export const CARGO_PREVIEW_ITEM_REFUSAL = {
  alreadyLinked: 'CARGO_PREVIEW_ITEM_ALREADY_LINKED',
  invalid: 'CARGO_PREVIEW_ITEM_INVALID',
  notSuggested: 'CARGO_PREVIEW_ITEM_NOT_SUGGESTED',
} as const

export type CargoPreviewActionItem = {
  readonly matchState: CargoPreviewItemState
  readonly matchedBy: CargoPreviewDecidedBy | null
  readonly matchedDocumentId: string | null
  /** A nota que a sugestão aponta (a primeira candidata); nula fora de `suggested`. */
  readonly suggestedDocumentId: string | null
}

export type CargoPreviewItemDecision =
  | { readonly kind: 'apply'; readonly documentId: string | null }
  | { readonly kind: 'refused'; readonly code: string }
  | { readonly kind: 'unchanged' }

const { awaitingXml, invalid, matched, suggested } = CARGO_PREVIEW_ITEM_STATE

function decideConfirm(item: CargoPreviewActionItem): CargoPreviewItemDecision {
  if (item.matchState === matched) {
    return item.matchedBy === CARGO_PREVIEW_DECIDED_BY.user
      ? { kind: 'unchanged' }
      : { documentId: item.matchedDocumentId, kind: 'apply' }
  }
  if (item.matchState !== suggested || item.suggestedDocumentId === null) {
    return { code: CARGO_PREVIEW_ITEM_REFUSAL.notSuggested, kind: 'refused' }
  }
  return { documentId: item.suggestedDocumentId, kind: 'apply' }
}

function decideUnlink(item: CargoPreviewActionItem): CargoPreviewItemDecision {
  if (item.matchState === invalid)
    return { code: CARGO_PREVIEW_ITEM_REFUSAL.invalid, kind: 'refused' }
  if (item.matchState === awaitingXml && item.matchedBy === CARGO_PREVIEW_DECIDED_BY.user) {
    return { kind: 'unchanged' }
  }
  return { documentId: item.matchedDocumentId, kind: 'apply' }
}

function decideLink(item: CargoPreviewActionItem, documentId: string): CargoPreviewItemDecision {
  if (item.matchState === invalid)
    return { code: CARGO_PREVIEW_ITEM_REFUSAL.invalid, kind: 'refused' }
  if (item.matchState !== matched) return { documentId, kind: 'apply' }
  if (item.matchedDocumentId === documentId) return { kind: 'unchanged' }
  return { code: CARGO_PREVIEW_ITEM_REFUSAL.alreadyLinked, kind: 'refused' }
}

export function decideCargoPreviewItemAction(input: {
  readonly action: CargoPreviewItemAction
  readonly documentId?: string
  readonly item: CargoPreviewActionItem
}): CargoPreviewItemDecision {
  switch (input.action) {
    case CARGO_PREVIEW_ITEM_ACTION.confirm:
      return decideConfirm(input.item)
    case CARGO_PREVIEW_ITEM_ACTION.unlink:
      return decideUnlink(input.item)
    case CARGO_PREVIEW_ITEM_ACTION.link:
      return decideLink(input.item, input.documentId ?? '')
  }
}
