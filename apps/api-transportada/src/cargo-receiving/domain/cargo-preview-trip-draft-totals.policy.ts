/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1: as contagens por estado e os totais de um roteiro. Os totais da planilha somam as
 * linhas válidas do roteiro inteiro; os da NF-e somam só as notas vinculadas, cada uma uma vez.
 */
import { sumDecimals, sumDecimalsOrNull } from './cargo-preview-trip-draft-decimal.policy.js'
import type {
  CargoPreviewTripDraftCounts,
  CargoPreviewTripDraftDocument,
  CargoPreviewTripDraftRoute,
  CargoPreviewTripDraftTotals,
  TripDraftItemRow,
} from './cargo-preview-trip-draft.types.js'

const VALUE_SCALE = 2
const WEIGHT_SCALE = 3
const VOLUME_SCALE = 4

export function countStates(items: readonly TripDraftItemRow[]): CargoPreviewTripDraftCounts {
  const counts: Record<string, number> = {
    ambiguous: 0,
    awaiting_xml: 0,
    invalid: 0,
    matched: 0,
    suggested: 0,
    total: 0,
  }
  for (const item of items) {
    counts[item.matchState] = (counts[item.matchState] ?? 0) + 1
    counts.total = (counts.total ?? 0) + 1
  }
  return counts as CargoPreviewTripDraftCounts
}

export function buildPlanilhaTotals(
  validItems: readonly TripDraftItemRow[],
): CargoPreviewTripDraftTotals {
  return {
    value: sumDecimals({ minimumScale: VALUE_SCALE, values: validItems.map((item) => item.value) }),
    volumeM3: sumDecimalsOrNull({
      minimumScale: VOLUME_SCALE,
      values: validItems.map((item) => item.volumeM3),
    }),
    weightKg: sumDecimals({
      minimumScale: WEIGHT_SCALE,
      values: validItems.map((item) => item.weightKg),
    }),
  }
}

export function buildLinkedTotals(
  documents: readonly CargoPreviewTripDraftDocument[],
): CargoPreviewTripDraftRoute['linkedTotals'] {
  return {
    value: sumDecimals({
      minimumScale: VALUE_SCALE,
      values: documents.map((entry) => entry.totalValue),
    }),
    weightKg: sumDecimals({
      minimumScale: WEIGHT_SCALE,
      values: documents.map((entry) => entry.weightKg),
    }),
  }
}
