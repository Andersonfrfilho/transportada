/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 160, RF05 — nenhuma medida de catálogo é gravada (proposta ou promovida) sem passar por
 * aqui. Função pura, sem I/O: recebe a candidata já normalizada em milímetro/grama e o que se sabe
 * do conteúdo (peso líquido unitário, faixa de densidade solta por NCM), devolve aceite ou os
 * códigos fechados de rejeição do RF05.
 *
 * ⚠️ **Densidade e volume usam a massa do CONTEÚDO conhecido, nunca o peso bruto do provedor** — é
 * exatamente o peso bruto que costuma estar torto (P3: grama gravada como quilo), então usá-lo para
 * validar a si mesmo não pegaria nada. `GROSS_WEIGHT_BELOW_CONTENT` é o único código que olha o
 * peso bruto declarado, comparando-o contra o conteúdo — os outros dois (densidade, volume) julgam
 * a geometria da caixa contra o que se sabe do produto.
 */
import {
  EDGE_MAX_MM,
  EDGE_MIN_MM,
  type PackageBoxCatalogSanityRejectionCode,
} from './package-box-catalog.constant.js'

export type { PackageBoxCatalogSanityRejectionCode }
export { EDGE_MAX_MM, EDGE_MIN_MM }

export type PackageBoxCatalogCandidate = {
  readonly grossWeightGrams: number
  readonly heightMm: number
  readonly lengthMm: number
  readonly unitsPerBox: number
  readonly widthMm: number
}

export type PackageBoxCatalogDensityRange = {
  readonly maxKgPerM3: number
  readonly minKgPerM3: number
}

export type PackageBoxCatalogContentReference = {
  readonly categoryDensityRangeKgPerM3?: PackageBoxCatalogDensityRange
  readonly unitNetWeightGrams?: number
}

export type PackageBoxCatalogSanityResult =
  | { readonly accepted: false; readonly reasons: readonly PackageBoxCatalogSanityRejectionCode[] }
  | { readonly accepted: true }

function volumeInCubicMeters(candidate: PackageBoxCatalogCandidate): number {
  return (candidate.lengthMm * candidate.widthMm * candidate.heightMm) / 1_000_000_000
}

/**
 * RF06: a reinterpretação de unidade (mm lido como cm) é rejeição, nunca correção automática — só
 * roda aqui para decidir se o código `UNIT_AMBIGUOUS` entra na lista, nunca para trocar o valor
 * gravado. A hipótese só é levantada quando a aresta grande é a única suspeita (aresta pequena
 * demais não tem essa saída: dividir por 10 só piora).
 */
function isUnitAmbiguous(
  candidate: PackageBoxCatalogCandidate,
  content: PackageBoxCatalogContentReference,
): boolean {
  const reinterpreted: PackageBoxCatalogCandidate = {
    ...candidate,
    heightMm: candidate.heightMm / 10,
    lengthMm: candidate.lengthMm / 10,
    widthMm: candidate.widthMm / 10,
  }
  if (
    reinterpreted.lengthMm < EDGE_MIN_MM ||
    reinterpreted.lengthMm > EDGE_MAX_MM ||
    reinterpreted.widthMm < EDGE_MIN_MM ||
    reinterpreted.widthMm > EDGE_MAX_MM ||
    reinterpreted.heightMm < EDGE_MIN_MM ||
    reinterpreted.heightMm > EDGE_MAX_MM
  ) {
    return false
  }
  return evaluatePackageBoxCatalogSanityReasons(reinterpreted, content).size === 0
}

function evaluatePackageBoxCatalogSanityReasons(
  candidate: PackageBoxCatalogCandidate,
  content: PackageBoxCatalogContentReference,
): Set<PackageBoxCatalogSanityRejectionCode> {
  const reasons = new Set<PackageBoxCatalogSanityRejectionCode>()

  const edgeTooLarge =
    candidate.lengthMm > EDGE_MAX_MM ||
    candidate.widthMm > EDGE_MAX_MM ||
    candidate.heightMm > EDGE_MAX_MM
  const edgeTooSmall =
    candidate.lengthMm < EDGE_MIN_MM ||
    candidate.widthMm < EDGE_MIN_MM ||
    candidate.heightMm < EDGE_MIN_MM
  if (edgeTooLarge) reasons.add('EDGE_TOO_LARGE')
  if (edgeTooSmall) reasons.add('EDGE_TOO_SMALL')

  if (content.unitNetWeightGrams !== undefined) {
    const requiredContentGrams = candidate.unitsPerBox * content.unitNetWeightGrams
    if (candidate.grossWeightGrams < requiredContentGrams) {
      reasons.add('GROSS_WEIGHT_BELOW_CONTENT')
    }

    const densityRange = content.categoryDensityRangeKgPerM3
    const volumeM3 = volumeInCubicMeters(candidate)
    if (densityRange !== undefined && volumeM3 > 0) {
      const contentMassKg = requiredContentGrams / 1000
      const densityKgPerM3 = contentMassKg / volumeM3
      if (densityKgPerM3 < densityRange.minKgPerM3 || densityKgPerM3 > densityRange.maxKgPerM3) {
        reasons.add('DENSITY_OUT_OF_RANGE')
      }

      const requiredVolumeM3 = contentMassKg / densityRange.minKgPerM3
      if (volumeM3 < requiredVolumeM3) reasons.add('VOLUME_BELOW_CONTENT')
    }
  }

  if (
    reasons.has('EDGE_TOO_LARGE') &&
    !reasons.has('EDGE_TOO_SMALL') &&
    isUnitAmbiguous(candidate, content)
  ) {
    reasons.add('UNIT_AMBIGUOUS')
  }

  return reasons
}

export function evaluatePackageBoxCatalogSanity(
  candidate: PackageBoxCatalogCandidate,
  content: PackageBoxCatalogContentReference,
): PackageBoxCatalogSanityResult {
  const reasons = evaluatePackageBoxCatalogSanityReasons(candidate, content)
  if (reasons.size === 0) return { accepted: true }
  return { accepted: false, reasons: [...reasons] }
}
