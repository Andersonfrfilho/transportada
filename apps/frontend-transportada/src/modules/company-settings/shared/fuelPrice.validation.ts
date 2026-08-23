/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  FUEL_UNIT_BY_PRODUCT,
  isFuelProduct,
  type FuelProduct,
  type FuelUnit,
} from '../../shared/fuel.constant'
import { isRecord } from './companySettingsResponse.validation'

const ENTRY_KEYS = [
  'effectivePricePerUnit',
  'product',
  'reference',
  'source',
  'tariff',
  'unit',
  'updatedAt',
]
const REFERENCE_KEYS = ['pricePerUnit', 'state', 'weekEndingOn']
const TARIFF_KEYS = [
  'adjustmentFactor',
  'distributorCode',
  'effectiveFrom',
  'effectiveTo',
  'tePerMegawattHour',
  'tusdPerMegawattHour',
]
const FUEL_PRICE_SOURCES = ['aneel', 'anp', 'manual']
const PRICE_PER_UNIT = /^(?:0|[1-9][0-9]{0,14})\.[0-9]{4}$/u
const WEEK_ENDING_ON = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u
const STATE = /^[A-Z]{2}$/u

export type FuelPriceSource = 'aneel' | 'anp' | 'manual'

/**
 * A tarifa homologada da ANEEL, como publicada: as duas parcelas em R$/MWh e o fator que a empresa
 * declara. Ela viaja inteira porque a tela mostra de onde o preço do kWh saiu — a distribuidora e a
 * vigência são o que o operador confere contra a conta de luz.
 */
export type EnergyTariff = Readonly<{
  adjustmentFactor: string
  distributorCode: string
  effectiveFrom: string
  effectiveTo: string
  tePerMegawattHour: string
  tusdPerMegawattHour: string
}>

export type FuelPriceReference = Readonly<{
  pricePerUnit: string
  state: string
  weekEndingOn: string
}>

export type FuelPriceEntry = Readonly<{
  effectivePricePerUnit: string | null
  product: FuelProduct
  reference: FuelPriceReference | null
  source: FuelPriceSource | null
  tariff: EnergyTariff | null
  unit: FuelUnit
  updatedAt: string | null
}>

export type FuelPriceListResponse = Readonly<{ data: readonly FuelPriceEntry[] }>

export type FuelPriceResponse = Readonly<{ data: FuelPriceEntry }>

function hasExactKeys(
  input: Readonly<{ keys: readonly string[]; value: Record<string, unknown> }>,
): boolean {
  const currentKeys = Object.keys(input.value).sort()
  const expectedKeys = [...input.keys].sort()
  return (
    currentKeys.length === expectedKeys.length &&
    currentKeys.every((key, index) => key === expectedKeys[index])
  )
}

function isNullableIsoDate(value: unknown): boolean {
  if (value === null) return true
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
}

function isFuelPriceReference(value: unknown): value is FuelPriceReference {
  if (!isRecord(value) || !hasExactKeys({ keys: REFERENCE_KEYS, value })) return false
  return (
    typeof value.pricePerUnit === 'string' &&
    PRICE_PER_UNIT.test(value.pricePerUnit) &&
    typeof value.state === 'string' &&
    STATE.test(value.state) &&
    typeof value.weekEndingOn === 'string' &&
    WEEK_ENDING_ON.test(value.weekEndingOn)
  )
}

function isEnergyTariff(value: unknown): value is EnergyTariff {
  if (!isRecord(value) || !hasExactKeys({ keys: TARIFF_KEYS, value })) return false
  return (
    typeof value.adjustmentFactor === 'string' &&
    PRICE_PER_UNIT.test(value.adjustmentFactor) &&
    typeof value.distributorCode === 'string' &&
    value.distributorCode.length > 0 &&
    typeof value.effectiveFrom === 'string' &&
    WEEK_ENDING_ON.test(value.effectiveFrom) &&
    typeof value.effectiveTo === 'string' &&
    WEEK_ENDING_ON.test(value.effectiveTo) &&
    typeof value.tePerMegawattHour === 'string' &&
    PRICE_PER_UNIT.test(value.tePerMegawattHour) &&
    typeof value.tusdPerMegawattHour === 'string' &&
    PRICE_PER_UNIT.test(value.tusdPerMegawattHour)
  )
}

export function isFuelPriceEntry(value: unknown): value is FuelPriceEntry {
  if (!isRecord(value) || !hasExactKeys({ keys: ENTRY_KEYS, value })) return false
  if (!isFuelProduct(value.product)) return false
  return (
    (value.effectivePricePerUnit === null ||
      (typeof value.effectivePricePerUnit === 'string' &&
        PRICE_PER_UNIT.test(value.effectivePricePerUnit))) &&
    (value.reference === null || isFuelPriceReference(value.reference)) &&
    (value.tariff === null || isEnergyTariff(value.tariff)) &&
    (value.source === null ||
      (typeof value.source === 'string' && FUEL_PRICE_SOURCES.includes(value.source))) &&
    value.unit === FUEL_UNIT_BY_PRODUCT[value.product] &&
    isNullableIsoDate(value.updatedAt)
  )
}

export function isFuelPriceListResponse(value: unknown): value is FuelPriceListResponse {
  return (
    isRecord(value) &&
    hasExactKeys({ keys: ['data'], value }) &&
    Array.isArray(value.data) &&
    value.data.every(isFuelPriceEntry)
  )
}

export function isFuelPriceResponse(value: unknown): value is FuelPriceResponse {
  return isRecord(value) && hasExactKeys({ keys: ['data'], value }) && isFuelPriceEntry(value.data)
}
