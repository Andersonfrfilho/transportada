/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a: linha e nota em unidades inteiras (centavo, grama). A soma de valor fecha ao
 * centavo e a de peso ao grama — float binário somaria 0,1 + 0,2 errado.
 */
import {
  MONEY_DECIMALS,
  PREVIEW_WEIGHT_ROUNDING_FLOOR_KG,
  TOLERANCE_DENOMINATOR,
  TOLERANCE_HUNDREDTHS_PER_PERCENT,
  WEIGHT_DECIMALS,
} from './cargo-preview-matching.constant.js'
import type {
  CargoPreviewCandidateDocument,
  CargoPreviewMatchItem,
  MatchDocument,
  MatchLine,
  WeightCloses,
} from './cargo-preview-matching.types.js'
import { normalizePlaceName, readNonNegativeDecimal } from './cargo-preview-value.policy.js'

const NOT_ALPHANUMERIC = /[^A-Z0-9]+/gu
const GRAMS_PER_KG = 10 ** WEIGHT_DECIMALS
const ROUNDING_FLOOR_GRAMS = BigInt(Math.round(PREVIEW_WEIGHT_ROUNDING_FLOOR_KG * GRAMS_PER_KG))

function toScaledInteger(text: string | undefined, scale: number): bigint | undefined {
  if (text === undefined) return undefined
  const reading = readNonNegativeDecimal({ isNumeric: false, text }, scale)
  return reading.kind === 'value' ? BigInt(reading.text.replace('.', '')) : undefined
}

/** Razão social só como reforço: sem acento, caixa alta, só letras e dígitos. */
export function toNameKey(name: string | undefined): string | undefined {
  if (name === undefined) return undefined
  const key = normalizePlaceName(name).replace(NOT_ALPHANUMERIC, ' ').trim()
  return key.length === 0 ? undefined : key
}

function emptyToUndefined(text: string | undefined): string | undefined {
  const trimmed = text?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

/** A linha sem valor legível não é linha de vínculo: valor é sempre exigido (RF5a). */
export function toMatchLine(item: CargoPreviewMatchItem, index: number): MatchLine | undefined {
  const valueCents = toScaledInteger(item.value, MONEY_DECIMALS)
  const weightGrams = toScaledInteger(item.weightKg, WEIGHT_DECIMALS)
  if (valueCents === undefined || weightGrams === undefined) return undefined
  return {
    index,
    itemKey: item.itemKey,
    nameKey: toNameKey(item.recipientName),
    postalCode: emptyToUndefined(item.postalCode),
    recipientCode: emptyToUndefined(item.recipientCode),
    routeName: item.routeName,
    valueCents,
    weightGrams,
  }
}

export function toMatchDocument(
  document: CargoPreviewCandidateDocument,
): MatchDocument | undefined {
  const valueCents = toScaledInteger(document.totalValue, MONEY_DECIMALS)
  if (valueCents === undefined) return undefined
  return {
    id: document.id,
    loadReference: emptyToUndefined(document.loadReference),
    nameKey: toNameKey(document.recipientName),
    postalCode: emptyToUndefined(document.recipientPostalCode),
    taxId: emptyToUndefined(document.recipientTaxId),
    valueCents,
    weightGrams: toScaledInteger(document.grossWeightKg, WEIGHT_DECIMALS),
  }
}

/** `|Δ| ≤ max(piso de arredondamento, tolerância do perfil × peso da nota)`. */
export function createWeightCloses(weightTolerancePercent: number): WeightCloses {
  const tolerance = BigInt(Math.round(weightTolerancePercent * TOLERANCE_HUNDREDTHS_PER_PERCENT))
  return (lineGrams, documentGrams) => {
    if (documentGrams === undefined) return false
    const difference =
      lineGrams > documentGrams ? lineGrams - documentGrams : documentGrams - lineGrams
    if (difference <= ROUNDING_FLOOR_GRAMS) return true
    return difference * TOLERANCE_DENOMINATOR <= tolerance * documentGrams
  }
}

export function indexByValue(
  documents: readonly MatchDocument[],
): ReadonlyMap<bigint, readonly MatchDocument[]> {
  const index = new Map<bigint, MatchDocument[]>()
  for (const document of documents) {
    const bucket = index.get(document.valueCents)
    if (bucket === undefined) index.set(document.valueCents, [document])
    else bucket.push(document)
  }
  return index
}

export function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}
