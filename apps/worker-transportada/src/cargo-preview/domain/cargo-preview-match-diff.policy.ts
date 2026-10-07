/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a: o veredito da política vira só o que mudou — item igual não grava nem gera evento,
 * por isso reavaliar a mesma prévia duas vezes é no-op. Só itens em aberto decididos pela máquina
 * entram aqui; o que o operador decidiu nunca chega.
 */
import type { CargoPreviewItemMatch } from '../../cargo-receiving/domain/cargo-preview-matching.types.js'
import {
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_ITEM_STATE,
  type CargoPreviewEventKind,
  type CargoPreviewItemState,
} from '../../shared/cargo-preview.constant.js'

export type OpenPreviewItem = {
  readonly candidateDocumentIds: readonly string[]
  readonly evidence: readonly string[]
  readonly id: string
  readonly matchState: CargoPreviewItemState
}

export type PreviewItemChange = {
  readonly candidateDocumentIds: readonly string[]
  readonly eventKind: CargoPreviewEventKind | null
  readonly evidence: readonly string[]
  /** A nota do grupo: a vinculada (`matched`) ou a sugerida; nula na ambiguidade e na espera. */
  readonly groupDocumentId: string | null
  readonly itemId: string
  readonly state: CargoPreviewItemState
}

const EVENT_OF: Partial<Record<CargoPreviewItemState, CargoPreviewEventKind>> = {
  [CARGO_PREVIEW_ITEM_STATE.ambiguous]: CARGO_PREVIEW_EVENT_KIND.itemAmbiguous,
  [CARGO_PREVIEW_ITEM_STATE.matched]: CARGO_PREVIEW_EVENT_KIND.itemMatched,
  [CARGO_PREVIEW_ITEM_STATE.suggested]: CARGO_PREVIEW_EVENT_KIND.itemSuggested,
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function groupDocumentOf(match: CargoPreviewItemMatch): string | null {
  const isSingle =
    match.state === CARGO_PREVIEW_ITEM_STATE.matched ||
    match.state === CARGO_PREVIEW_ITEM_STATE.suggested
  return isSingle ? (match.documentIds[0] ?? null) : null
}

export function diffPreviewMatches(input: {
  readonly current: readonly OpenPreviewItem[]
  readonly matches: readonly CargoPreviewItemMatch[]
}): readonly PreviewItemChange[] {
  const byId = new Map(input.current.map((item) => [item.id, item]))
  return input.matches.flatMap((match) => {
    const item = byId.get(match.itemKey)
    if (item === undefined) return []
    const isSame =
      item.matchState === match.state &&
      sameList(item.candidateDocumentIds, match.documentIds) &&
      sameList(item.evidence, match.evidence)
    if (isSame) return []
    return [
      {
        candidateDocumentIds: match.documentIds,
        eventKind: EVENT_OF[match.state] ?? null,
        evidence: match.evidence,
        groupDocumentId: groupDocumentOf(match),
        itemId: item.id,
        state: match.state,
      },
    ]
  })
}
