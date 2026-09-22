/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { PackageBox, PackageBoxMeasurementInput } from './packageBoxClient.service'
import { toCentimetres } from './packageBoxMeasurementUnits.service'

const GRAMS_PER_KILOGRAM = 1000
const CUBIC_CENTIMETRES_PER_LITRE = 1000

export type PackageBoxEstimateDescription = Readonly<{
  /** `2x2x6` da API vira `2 × 2 × 6` — é o que o conferente confere contra a caixa na mão. */
  arrangement: string
  grossWeightKg: string | undefined
  height: string
  length: string
  volumeLitres: string | undefined
  width: string
}>

export type PackageBoxUnitDescription = Readonly<{
  grossWeightGrams: number | undefined
  height: string
  length: string
  width: string
}>

function formatDecimal(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits).replace('.', ',')
}

/**
 * Spec 163 (RF09/P5): o que a linha da fila mostra quando a caixa só tem a estimativa pela unidade.
 * `undefined` sem `isEstimated` — com medida real a estimativa não é mais o que vale, e mostrar
 * as duas lado a lado faria o conferente escolher entre dois números.
 */
export function describePackageBoxEstimate(
  box: PackageBox,
): PackageBoxEstimateDescription | undefined {
  const estimate = box.estimate
  if (box.isEstimated !== true || estimate === undefined || estimate === null) return undefined
  return {
    arrangement: (estimate.arrangement ?? '').split('x').join(' × '),
    grossWeightKg:
      estimate.grossWeightGrams === null
        ? undefined
        : formatDecimal(estimate.grossWeightGrams / GRAMS_PER_KILOGRAM, 3),
    height: toCentimetres(estimate.heightMm),
    length: toCentimetres(estimate.lengthMm),
    volumeLitres:
      estimate.volumeCm3 === null
        ? undefined
        : formatDecimal(estimate.volumeCm3 / CUBIC_CENTIMETRES_PER_LITRE, 1),
    width: toCentimetres(estimate.widthMm),
  }
}

/** Spec 163: a unidade informada, em cm e g — `undefined` sem unidade. */
export function describePackageBoxUnit(box: PackageBox): PackageBoxUnitDescription | undefined {
  const unit = box.unit
  if (unit === undefined || unit === null) return undefined
  return {
    grossWeightGrams: unit.grossWeightGrams ?? undefined,
    height: toCentimetres(unit.heightMm),
    length: toCentimetres(unit.lengthMm),
    width: toCentimetres(unit.widthMm),
  }
}

/**
 * Spec 163 (P5): "Confirmar" grava a estimativa como medida **digitada** (`typed`) — é a decisão
 * humana de que a caixa na mão bate com a estimativa, não uma estimativa promovida sozinha. Vai
 * pelo mesmo `PUT` da medida, com as `unitsPerBox` que a caixa já tem.
 */
export function buildPackageBoxEstimateConfirmation(
  box: PackageBox,
): PackageBoxMeasurementInput | undefined {
  const estimate = box.estimate
  if (box.isEstimated !== true || estimate === undefined || estimate === null) return undefined
  return {
    grossWeightGrams: estimate.grossWeightGrams,
    heightMm: estimate.heightMm,
    id: box.id,
    lengthMm: estimate.lengthMm,
    source: 'typed',
    unitsPerBox: box.unitsPerBox,
    widthMm: estimate.widthMm,
  }
}
