/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 160, RF07/RNF03 — duas fontes com dimensão concordando promovem a medida sem passar pelo
 * conferente; uma fonte só vira proposta na fila (P1/P2). Função pura, sem I/O: já recebe as
 * propostas de cada provedor que passaram na sanidade.
 */
import {
  CATALOG_CONSENSUS_TOLERANCE_MM,
  CATALOG_CONSENSUS_WEIGHT_TOLERANCE_RATIO,
} from './package-box-catalog.constant.js'

export { CATALOG_CONSENSUS_TOLERANCE_MM, CATALOG_CONSENSUS_WEIGHT_TOLERANCE_RATIO }

export type PackageBoxCatalogSourceProposal = {
  readonly grossWeightGrams: number
  readonly heightMm: number
  readonly lengthMm: number
  readonly provider: string
  readonly widthMm: number
}

export type PackageBoxCatalogConsensusResult =
  | {
      readonly agreeingProviders: readonly [string, string]
      readonly marginMm: number
      readonly promoted: true
    }
  | { readonly promoted: false }

function agreesWithinTolerance(
  first: PackageBoxCatalogSourceProposal,
  second: PackageBoxCatalogSourceProposal,
): { readonly agrees: boolean; readonly marginMm: number } {
  const lengthDivergenceMm = Math.abs(first.lengthMm - second.lengthMm)
  const widthDivergenceMm = Math.abs(first.widthMm - second.widthMm)
  const heightDivergenceMm = Math.abs(first.heightMm - second.heightMm)
  const marginMm = Math.max(lengthDivergenceMm, widthDivergenceMm, heightDivergenceMm)
  const withinEdgeTolerance = marginMm <= CATALOG_CONSENSUS_TOLERANCE_MM

  const weightBaselineGrams = Math.max(first.grossWeightGrams, second.grossWeightGrams)
  const weightDivergenceRatio =
    weightBaselineGrams === 0
      ? 0
      : Math.abs(first.grossWeightGrams - second.grossWeightGrams) / weightBaselineGrams
  const withinWeightTolerance = weightDivergenceRatio <= CATALOG_CONSENSUS_WEIGHT_TOLERANCE_RATIO

  return { agrees: withinEdgeTolerance && withinWeightTolerance, marginMm }
}

/**
 * RF07: "uma fonte só vira proposta na fila" — com uma proposta só, ou nenhuma, o laço não acha
 * par e devolve `promoted: false`. Com três ou mais, a primeira dupla que concorda decide.
 */
export function evaluatePackageBoxCatalogConsensus(
  proposals: readonly PackageBoxCatalogSourceProposal[],
): PackageBoxCatalogConsensusResult {
  for (let firstIndex = 0; firstIndex < proposals.length; firstIndex += 1) {
    const first = proposals[firstIndex]
    if (first === undefined) continue
    for (let secondIndex = firstIndex + 1; secondIndex < proposals.length; secondIndex += 1) {
      const second = proposals[secondIndex]
      if (second === undefined) continue
      const { agrees, marginMm } = agreesWithinTolerance(first, second)
      if (agrees) {
        return { agreeingProviders: [first.provider, second.provider], marginMm, promoted: true }
      }
    }
  }
  return { promoted: false }
}
