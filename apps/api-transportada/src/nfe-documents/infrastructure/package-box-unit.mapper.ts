/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PackageBoxEstimateView, PackageBoxUnitView } from '../application/package-box.port.js'

export type PackageBoxUnitColumns = {
  readonly estimatedArrangement: string | null
  readonly estimatedAt: Date | null
  readonly estimatedGrossWeightGrams: number | null
  readonly estimatedHeightMm: number | null
  readonly estimatedLengthMm: number | null
  readonly estimatedVolumeCm3: number | null
  readonly estimatedWidthMm: number | null
  readonly lengthMm: number | null
  readonly unitGrossWeightGrams: number | null
  readonly unitHeightMm: number | null
  readonly unitLengthMm: number | null
  readonly unitMeasurementSource: string | null
  readonly unitWidthMm: number | null
}

export type PackageBoxUnitFields = {
  readonly estimate: PackageBoxEstimateView | null
  /** Spec 163 (RF08): `true` só quando a cubagem usaria a estimativa — sem medida real. */
  readonly isEstimated: boolean
  readonly unit: PackageBoxUnitView | null
}

function toUnitView(row: PackageBoxUnitColumns): PackageBoxUnitView | null {
  const { unitHeightMm, unitLengthMm, unitMeasurementSource, unitWidthMm } = row
  if (unitLengthMm === null || unitWidthMm === null || unitHeightMm === null) return null
  return {
    grossWeightGrams: row.unitGrossWeightGrams,
    heightMm: unitHeightMm,
    lengthMm: unitLengthMm,
    source: unitMeasurementSource,
    widthMm: unitWidthMm,
  }
}

function toEstimateView(row: PackageBoxUnitColumns): PackageBoxEstimateView | null {
  const { estimatedHeightMm, estimatedLengthMm, estimatedWidthMm } = row
  if (estimatedLengthMm === null || estimatedWidthMm === null || estimatedHeightMm === null) {
    return null
  }
  return {
    arrangement: row.estimatedArrangement,
    estimatedAt: row.estimatedAt?.toISOString() ?? null,
    grossWeightGrams: row.estimatedGrossWeightGrams,
    heightMm: estimatedHeightMm,
    lengthMm: estimatedLengthMm,
    volumeCm3: row.estimatedVolumeCm3,
    widthMm: estimatedWidthMm,
  }
}

/** Spec 163 (RF08): a unidade e a caixa estimada ao lado da medida real, nunca no lugar dela. */
export function toPackageBoxUnitFields(row: PackageBoxUnitColumns): PackageBoxUnitFields {
  const estimate = toEstimateView(row)
  return {
    estimate,
    isEstimated: row.lengthMm === null && estimate !== null,
    unit: toUnitView(row),
  }
}
