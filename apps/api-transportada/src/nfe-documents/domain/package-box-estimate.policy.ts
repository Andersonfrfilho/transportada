/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, RF02 — caixa estimada a partir da medida da unidade. Função pura e determinística.
 * ⚠️ É estimativa, nunca medida: quem chama grava em `estimated_*`, jamais em `length_mm` & cia.
 */

import { EDGE_MAX_MM, EDGE_MIN_MM } from './package-box-catalog.constant.js'

/** Folga de papelão por aresta: 4 mm por face, duas faces. */
const CARDBOARD_ALLOWANCE_PER_EDGE_MM = 8

/** Peso da embalagem sobre o conteúdo. */
const PACKAGING_WEIGHT_FACTOR = 1.05

export type PackageBoxUnitMeasure = {
  readonly grossWeightGrams?: number | undefined
  readonly heightMm: number | undefined
  readonly lengthMm: number | undefined
  readonly widthMm: number | undefined
}

export type EstimatePackageBoxFromUnitParams = {
  readonly unit: PackageBoxUnitMeasure
  readonly unitsPerBox: number | undefined
}

export type PackageBoxEstimate = {
  readonly arrangement: string
  readonly grossWeightGrams?: number
  readonly heightMm: number
  readonly lengthMm: number
  readonly volumeCm3: number
  readonly widthMm: number
}

type Triple = readonly [number, number, number]

type Candidate = {
  readonly counts: Triple
  readonly edges: Triple
  readonly surfaceArea: number
}

function listFactorizations(unitsPerBox: number): Triple[] {
  const factorizations: Triple[] = []
  for (let first = 1; first <= unitsPerBox; first += 1) {
    if (unitsPerBox % first !== 0) continue
    const rest = unitsPerBox / first
    for (let second = 1; second <= rest; second += 1) {
      if (rest % second !== 0) continue
      factorizations.push([first, second, rest / second])
    }
  }
  return factorizations
}

function listPermutations([first, second, third]: Triple): Triple[] {
  return [
    [first, second, third],
    [first, third, second],
    [second, first, third],
    [second, third, first],
    [third, first, second],
    [third, second, first],
  ]
}

function buildCandidate(counts: Triple, unitEdges: Triple): Candidate {
  const edges: Triple = [
    counts[0] * unitEdges[0] + CARDBOARD_ALLOWANCE_PER_EDGE_MM,
    counts[1] * unitEdges[1] + CARDBOARD_ALLOWANCE_PER_EDGE_MM,
    counts[2] * unitEdges[2] + CARDBOARD_ALLOWANCE_PER_EDGE_MM,
  ]
  const surfaceArea = 2 * (edges[0] * edges[1] + edges[0] * edges[2] + edges[1] * edges[2])
  return { counts, edges, surfaceArea }
}

function isBetterCandidate(candidate: Candidate, best: Candidate | undefined): boolean {
  if (best === undefined) return true
  if (candidate.surfaceArea !== best.surfaceArea) return candidate.surfaceArea < best.surfaceArea
  return Math.max(...candidate.edges) < Math.max(...best.edges)
}

function readCompleteUnitEdges(unit: PackageBoxUnitMeasure): Triple | undefined {
  const { heightMm, lengthMm, widthMm } = unit
  if (lengthMm === undefined || widthMm === undefined || heightMm === undefined) return undefined
  if (lengthMm <= 0 || widthMm <= 0 || heightMm <= 0) return undefined
  return [lengthMm, widthMm, heightMm]
}

export function estimatePackageBoxFromUnit(
  params: EstimatePackageBoxFromUnitParams,
): PackageBoxEstimate | undefined {
  const { unit, unitsPerBox } = params
  if (unitsPerBox === undefined || !Number.isInteger(unitsPerBox) || unitsPerBox <= 1) {
    return undefined
  }
  const unitEdges = readCompleteUnitEdges(unit)
  if (unitEdges === undefined) return undefined

  let best: Candidate | undefined
  for (const counts of listFactorizations(unitsPerBox)) {
    for (const orientedEdges of listPermutations(unitEdges)) {
      const candidate = buildCandidate(counts, orientedEdges)
      if (isBetterCandidate(candidate, best)) best = candidate
    }
  }
  if (best === undefined) return undefined

  const [lengthMm, widthMm, heightMm] = [...best.edges].sort((left, right) => right - left) as [
    number,
    number,
    number,
  ]
  const arrangement = [...best.counts].sort((left, right) => left - right).join('x')
  const volumeCm3 = Math.round((lengthMm * widthMm * heightMm) / 1000)
  const unitWeight = unit.grossWeightGrams
  const estimate = { arrangement, heightMm, lengthMm, volumeCm3, widthMm }
  if (unitWeight === undefined || unitWeight <= 0) return estimate
  return {
    ...estimate,
    grossWeightGrams: Math.round(unitsPerBox * unitWeight * PACKAGING_WEIGHT_FACTOR),
  }
}

/**
 * A estimativa que pode ser gravada: dentro da faixa do CHECK
 * `nfe_package_boxes_estimated_dimensions_check` (a mesma da caixa master da 160, 20–2500 mm).
 * `1×1×n` gigante (n primo grande) não vira linha — sem estimativa é melhor que estimativa absurda.
 */
export function estimateStorablePackageBoxFromUnit(
  params: EstimatePackageBoxFromUnitParams,
): PackageBoxEstimate | undefined {
  const estimate = estimatePackageBoxFromUnit(params)
  if (estimate === undefined) return undefined
  const edges = [estimate.lengthMm, estimate.widthMm, estimate.heightMm]
  return edges.every((edge) => edge >= EDGE_MIN_MM && edge <= EDGE_MAX_MM) ? estimate : undefined
}
