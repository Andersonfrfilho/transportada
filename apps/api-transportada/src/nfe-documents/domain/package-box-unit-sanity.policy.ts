/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, RF03 e P4 — sanidade da medida da unidade antes de gravar, e a unidade conferindo a
 * caixa medida. Puro, sem I/O. Unidade trocada (cm lido como mm) é rejeitada, nunca corrigida.
 * A conferência reusa os códigos fechados da spec 160 (`VOLUME_BELOW_CONTENT`,
 * `GROSS_WEIGHT_BELOW_CONTENT`).
 */
import type { PackageBoxCatalogSanityRejectionCode } from './package-box-catalog.constant.js'

export const UNIT_EDGE_MIN_MM = 5
export const UNIT_EDGE_MAX_MM = 1500

export type PackageBoxUnitSanityRejectionCode =
  | 'UNIT_EDGE_OUT_OF_RANGE'
  | 'UNIT_WEIGHT_NOT_POSITIVE'

export type PackageBoxUnitCandidate = {
  readonly grossWeightGrams?: number | undefined
  readonly heightMm: number
  readonly lengthMm: number
  readonly widthMm: number
}

export type PackageBoxUnitSanityResult =
  | { readonly accepted: false; readonly reasons: readonly PackageBoxUnitSanityRejectionCode[] }
  | { readonly accepted: true }

export type PackageBoxAgainstUnitRejectionCode = Extract<
  PackageBoxCatalogSanityRejectionCode,
  'GROSS_WEIGHT_BELOW_CONTENT' | 'VOLUME_BELOW_CONTENT'
>

export type PackageBoxAgainstUnitResult =
  | { readonly accepted: false; readonly reasons: readonly PackageBoxAgainstUnitRejectionCode[] }
  | { readonly accepted: true }

export type EvaluatePackageBoxAgainstUnitParams = {
  readonly box: PackageBoxUnitCandidate
  readonly unit: PackageBoxUnitCandidate
  readonly unitsPerBox: number
}

function isUnitEdgeInRange(edgeMm: number): boolean {
  return Number.isInteger(edgeMm) && edgeMm >= UNIT_EDGE_MIN_MM && edgeMm <= UNIT_EDGE_MAX_MM
}

export function evaluatePackageBoxUnitSanity(
  unit: PackageBoxUnitCandidate,
): PackageBoxUnitSanityResult {
  const reasons: PackageBoxUnitSanityRejectionCode[] = []
  const edges = [unit.lengthMm, unit.widthMm, unit.heightMm]
  if (!edges.every(isUnitEdgeInRange)) reasons.push('UNIT_EDGE_OUT_OF_RANGE')
  const weight = unit.grossWeightGrams
  if (weight !== undefined && (!Number.isInteger(weight) || weight <= 0)) {
    reasons.push('UNIT_WEIGHT_NOT_POSITIVE')
  }
  if (reasons.length === 0) return { accepted: true }
  return { accepted: false, reasons }
}

function volumeInCubicMillimeters(measure: PackageBoxUnitCandidate): number {
  return measure.lengthMm * measure.widthMm * measure.heightMm
}

export function evaluatePackageBoxAgainstUnit(
  params: EvaluatePackageBoxAgainstUnitParams,
): PackageBoxAgainstUnitResult {
  const { box, unit, unitsPerBox } = params
  const reasons: PackageBoxAgainstUnitRejectionCode[] = []
  if (volumeInCubicMillimeters(box) < unitsPerBox * volumeInCubicMillimeters(unit)) {
    reasons.push('VOLUME_BELOW_CONTENT')
  }
  const boxWeight = box.grossWeightGrams
  const unitWeight = unit.grossWeightGrams
  if (boxWeight !== undefined && unitWeight !== undefined && boxWeight < unitsPerBox * unitWeight) {
    reasons.push('GROSS_WEIGHT_BELOW_CONTENT')
  }
  if (reasons.length === 0) return { accepted: true }
  return { accepted: false, reasons }
}
