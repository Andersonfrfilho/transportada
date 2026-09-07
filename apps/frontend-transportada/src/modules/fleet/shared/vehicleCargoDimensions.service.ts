import {
  isZeroAmount,
  parseTypedMeasure,
  toTypedMeasure,
} from '@/modules/shared/decimalAmount.service'

import { VEHICLE_MEASURE_FIELD_SCALE } from './fleetVehicleMeasure.service'

/** As três medidas do baú, na ordem em que a fita as tira. */
export const CARGO_DIMENSION_KEYS = [
  'cargoLengthMeters',
  'cargoWidthMeters',
  'cargoHeightMeters',
] as const

export type CargoDimensionKey = (typeof CARGO_DIMENSION_KEYS)[number]

export type CargoDimensionFields = Readonly<Record<CargoDimensionKey, string>>

const DIMENSION_SCALE = VEHICLE_MEASURE_FIELD_SCALE.cargoLengthMeters.api
/** Três medidas na mesma escala rendem o volume três escalas abaixo; duas delas voltam por aqui. */
const PRODUCT_DIVISOR = 10n ** BigInt(DIMENSION_SCALE * 2)
const HALF = 2n

/**
 * Spec 088 D2/R1: dimensão pela metade não estima. Duas medidas e um palpite não são um volume, e é
 * a mesma exigência que `resolveVehicleCapacity` faz do outro lado do fio.
 */
export function hasCargoDimensions(fields: CargoDimensionFields): boolean {
  return CARGO_DIMENSION_KEYS.every((key) => !isZeroAmount(toApiDimension(fields[key])))
}

/**
 * O m³ que a tela mostra no lugar do campo digitado. Vazio quando falta medida — ausência é o que a
 * tela lê como "não dá para dizer", e um zero ali anunciaria baú sem espaço.
 */
export function deriveCapacityCubicMeters(fields: CargoDimensionFields): string {
  if (!hasCargoDimensions(fields)) return ''

  const product = CARGO_DIMENSION_KEYS.reduce((total, key) => total * toScaled(fields[key]), 1n)

  return toTypedMeasure({
    scale: VEHICLE_MEASURE_FIELD_SCALE.capacityCubicMeters.form,
    value: toDecimal(divideHalfUp(product, PRODUCT_DIVISOR)),
  })
}

/**
 * Spec 088 R1: medido o baú, o m³ digitado **se apaga**. Guardar os dois deixaria um número antigo
 * esperando o dia em que alguém apagasse as medidas para voltar a valer sem ninguém o reafirmar — e
 * zero é o vocabulário que o resolvedor já lê como ausência, não como baú de volume zero.
 */
export function resolveSubmittedCapacity(
  fields: CargoDimensionFields & Readonly<{ capacityCubicMeters: string }>,
): string {
  return hasCargoDimensions(fields) ? '' : fields.capacityCubicMeters
}

function toApiDimension(value: string): string {
  return parseTypedMeasure({ scale: DIMENSION_SCALE, value })
}

function toScaled(value: string): bigint {
  return BigInt(toApiDimension(value).replace('.', ''))
}

function toDecimal(units: bigint): string {
  const digits = units.toString().padStart(DIMENSION_SCALE + 1, '0')
  return `${digits.slice(0, -DIMENSION_SCALE)}.${digits.slice(-DIMENSION_SCALE)}`
}

function divideHalfUp(dividend: bigint, divisor: bigint): bigint {
  return (dividend * HALF + divisor) / (divisor * HALF)
}
