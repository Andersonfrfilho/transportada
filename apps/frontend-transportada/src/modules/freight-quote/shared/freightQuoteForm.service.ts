/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  FreightQuoteAddress,
  FreightQuoteInput,
  FreightQuoteSettingsValues,
} from './freightQuote.types'

const DECIMAL = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,4})?$/

/** Valor do campo (vírgula do teclado brasileiro) para o decimal da API; `null` se não for número. */
export function parseDecimalField(text: string): string | null {
  const normalized = text.trim().replace(',', '.')
  return DECIMAL.test(normalized) ? normalized : null
}

/** `15.0000` da API vira `15`, e `0.9000` vira `0,9`: a tela não mostra zeros que ninguém digitou. */
export function formatDecimalField(value: string | null): string {
  if (value === null) return ''
  const trimmed = value.includes('.') ? value.replace(/0+$/u, '').replace(/\.$/u, '') : value
  return trimmed.replace('.', ',')
}

export type SettingsDraft = Readonly<Record<NumericSettingKey, string>> &
  Readonly<{ applyAnttFloor: boolean }>

export const NUMERIC_SETTING_KEYS = [
  'marginPercent',
  'expectedOccupancyPercent',
  'driverCostPerKm',
  'maintenanceCostPerKm',
  'tiresCostPerKm',
  'fixedCostPerKm',
  'adValoremPercent',
  'grisPercent',
  'fuelKmPerLiter',
] as const
export type NumericSettingKey = (typeof NUMERIC_SETTING_KEYS)[number]

export function startSettingsDraft(values: FreightQuoteSettingsValues): SettingsDraft {
  return {
    adValoremPercent: formatDecimalField(values.adValoremPercent),
    applyAnttFloor: values.applyAnttFloor,
    driverCostPerKm: formatDecimalField(values.driverCostPerKm),
    expectedOccupancyPercent: formatDecimalField(values.expectedOccupancyPercent),
    fixedCostPerKm: formatDecimalField(values.fixedCostPerKm),
    fuelKmPerLiter: formatDecimalField(values.fuelKmPerLiter),
    grisPercent: formatDecimalField(values.grisPercent),
    maintenanceCostPerKm: formatDecimalField(values.maintenanceCostPerKm),
    marginPercent: formatDecimalField(values.marginPercent),
    tiresCostPerKm: formatDecimalField(values.tiresCostPerKm),
  }
}

/** `null` enquanto algum campo não fecha: o botão de gravar fica desligado, sem esperar a API recusar. */
export function buildSettingsSubmission(draft: SettingsDraft): FreightQuoteSettingsValues | null {
  const numbers: Partial<Record<NumericSettingKey, string>> = {}
  for (const key of NUMERIC_SETTING_KEYS) {
    if (key === 'fuelKmPerLiter' && draft[key].trim() === '') continue
    const parsed = parseDecimalField(draft[key])
    if (parsed === null) return null
    numbers[key] = parsed
  }
  const margin = Number.parseFloat(numbers.marginPercent ?? '')
  const occupancy = Number.parseFloat(numbers.expectedOccupancyPercent ?? '')
  const consumption = numbers.fuelKmPerLiter
  if (margin >= 100 || occupancy <= 0 || occupancy > 100) return null
  if (consumption !== undefined && Number.parseFloat(consumption) <= 0) return null
  if (
    Number.parseFloat(numbers.adValoremPercent ?? '') > 100 ||
    Number.parseFloat(numbers.grisPercent ?? '') > 100
  ) {
    return null
  }
  return {
    adValoremPercent: numbers.adValoremPercent ?? '',
    applyAnttFloor: draft.applyAnttFloor,
    driverCostPerKm: numbers.driverCostPerKm ?? '',
    expectedOccupancyPercent: numbers.expectedOccupancyPercent ?? '',
    fixedCostPerKm: numbers.fixedCostPerKm ?? '',
    fuelKmPerLiter: consumption ?? null,
    grisPercent: numbers.grisPercent ?? '',
    maintenanceCostPerKm: numbers.maintenanceCostPerKm ?? '',
    marginPercent: numbers.marginPercent ?? '',
    tiresCostPerKm: numbers.tiresCostPerKm ?? '',
  }
}

export type AddressDraft = Readonly<{
  city: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type QuoteDraft = Readonly<{
  axles: string
  cargoType: string
  cargoValue: string
  destination: AddressDraft
  fuelPricePerLitre: string
  highPerformance: boolean
  origin: AddressDraft
  shareOfVehiclePercent: string
}>

export const EMPTY_ADDRESS_DRAFT: AddressDraft = {
  city: '',
  district: '',
  number: '',
  postalCode: '',
  state: '',
  street: '',
}

export const EMPTY_QUOTE_DRAFT: QuoteDraft = {
  axles: '5',
  cargoType: '5',
  cargoValue: '',
  destination: EMPTY_ADDRESS_DRAFT,
  fuelPricePerLitre: '',
  highPerformance: false,
  origin: EMPTY_ADDRESS_DRAFT,
  shareOfVehiclePercent: '100',
}

/** `null` enquanto o endereço não fecha: CEP de 8 dígitos, UF de 2 letras e os demais campos preenchidos. */
export function buildAddressSubmission(draft: AddressDraft): FreightQuoteAddress | null {
  const postalCode = draft.postalCode.replace(/\D/gu, '')
  const state = draft.state.trim().toUpperCase()
  const street = draft.street.trim()
  const number = draft.number.trim()
  const district = draft.district.trim()
  const city = draft.city.trim()
  if (!/^\d{8}$/u.test(postalCode) || !/^[A-Z]{2}$/u.test(state)) return null
  if (street === '' || number === '' || district === '' || city === '') return null
  return { city, district, number, postalCode, state, street }
}

/** `null` até o mínimo fechar: dois endereços completos, e os opcionais em branco ou válidos. */
export function buildQuoteSubmission(draft: QuoteDraft): FreightQuoteInput | null {
  const origin = buildAddressSubmission(draft.origin)
  const destination = buildAddressSubmission(draft.destination)
  const share = parseDecimalField(draft.shareOfVehiclePercent)
  const cargoValue = draft.cargoValue.trim() === '' ? '0' : parseDecimalField(draft.cargoValue)
  const fuel =
    draft.fuelPricePerLitre.trim() === '' ? null : parseDecimalField(draft.fuelPricePerLitre)
  if (origin === null || destination === null) return null
  if (share === null || Number.parseFloat(share) <= 0 || Number.parseFloat(share) > 100) return null
  if (cargoValue === null) return null
  if (draft.fuelPricePerLitre.trim() !== '' && (fuel === null || Number.parseFloat(fuel) <= 0)) {
    return null
  }
  return {
    axles: Number(draft.axles),
    cargoType: Number(draft.cargoType),
    cargoValue,
    destination,
    fuelPricePerLitre: fuel,
    highPerformance: draft.highPerformance,
    origin,
    shareOfVehiclePercent: share,
  }
}

const BRL = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

/** Só exibição: a conta já veio pronta da API, com o arredondamento dela. */
export function formatAmount(value: string): string {
  return BRL.format(Number.parseFloat(value))
}
