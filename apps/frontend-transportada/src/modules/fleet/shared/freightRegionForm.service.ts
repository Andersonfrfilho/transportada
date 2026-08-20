/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  AMOUNT_MAX_SCALE,
  isZeroAmount,
  parseTypedAmount,
  toTypedAmount,
} from '@/modules/shared/decimalAmount.service'
import { FREIGHT_VEHICLE_CLASSES } from '@/modules/shared/freightClass.constant'
import type { FreightVehicleClass } from '@/modules/shared/freightClass.constant'

import { FREIGHT_REGION_CODE_PATTERN } from './fleet.constant'
import { foldRegionCityName } from './regionCityName.service'
import type {
  FreightRegion,
  FreightRegionCity,
  FreightRegionDriverRate,
  FreightRegionStatus,
} from './freightRegion.types'

export const FREIGHT_REGION_FORM_ERROR = {
  CITY_DUPLICATED: 'city_duplicated',
  CODE_INVALID: 'code_invalid',
  NAME_REQUIRED: 'name_required',
} as const

export type FreightRegionFormError =
  (typeof FREIGHT_REGION_FORM_ERROR)[keyof typeof FREIGHT_REGION_FORM_ERROR]

/** O valor por classe é o que a pessoa digitou, em pt-BR e mascarado — a escala sai na submissão. */
export type FreightRegionRateFields = Readonly<Record<FreightVehicleClass, string>>

export type FreightRegionFormState = Readonly<{
  cities: readonly FreightRegionCity[]
  code: string
  name: string
  rates: FreightRegionRateFields
  status: FreightRegionStatus
}>

/** O corpo que `createRegionSchema` aceita — o `strict()` da API recusa qualquer chave a mais. */
export type FreightRegionBody = Readonly<{
  cities: readonly FreightRegionCity[]
  code: string
  name: string
  rates: readonly FreightRegionDriverRate[]
}>

export type FreightRegionBodyResult =
  | Readonly<{ body: FreightRegionBody; ok: true }>
  | Readonly<{ errors: readonly FreightRegionFormError[]; ok: false }>

function emptyRates(): FreightRegionRateFields {
  return Object.fromEntries(
    FREIGHT_VEHICLE_CLASSES.map((freightClass) => [freightClass, '']),
  ) as FreightRegionRateFields
}

export function emptyFreightRegionForm(): FreightRegionFormState {
  return { cities: [], code: '', name: '', rates: emptyRates(), status: 'active' }
}

export function toFreightRegionForm(region: FreightRegion): FreightRegionFormState {
  const rates = emptyRates() as Record<FreightVehicleClass, string>
  for (const rate of region.rates) {
    rates[rate.freightClass] = toTypedAmount({ scale: 2, value: rate.driverAmount })
  }

  return {
    cities: region.cities.map((city) => ({ ...city })),
    code: region.code,
    name: region.name,
    rates,
    status: region.status,
  }
}

export function cityKeyOf(city: FreightRegionCity): string {
  return `${foldRegionCityName(city.city)}/${city.state.trim().toUpperCase()}`
}

/**
 * Célula vazia e célula zerada dizem a mesma coisa — "não atende" —, e é assim que o parser de
 * importação lê a planilha do cliente. Gravar `0.0000` faria a rota aparecer como viagem de graça
 * na consulta, que é pior que não aparecer.
 */
function toRates(fields: FreightRegionRateFields): readonly FreightRegionDriverRate[] {
  const rates: FreightRegionDriverRate[] = []
  for (const freightClass of FREIGHT_VEHICLE_CLASSES) {
    const typed = fields[freightClass].trim()
    if (typed === '') continue

    const driverAmount = parseTypedAmount({ scale: AMOUNT_MAX_SCALE, value: typed })
    if (isZeroAmount(driverAmount)) continue

    rates.push({ driverAmount, freightClass })
  }

  return rates
}

export function buildFreightRegionBody(state: FreightRegionFormState): FreightRegionBodyResult {
  const errors: FreightRegionFormError[] = []
  const code = state.code.trim()
  const name = state.name.trim()

  if (!FREIGHT_REGION_CODE_PATTERN.test(code)) errors.push(FREIGHT_REGION_FORM_ERROR.CODE_INVALID)
  if (name === '') errors.push(FREIGHT_REGION_FORM_ERROR.NAME_REQUIRED)

  const cities = state.cities.map((city) => ({
    city: city.city.trim(),
    state: city.state.trim().toUpperCase(),
  }))
  if (new Set(cities.map(cityKeyOf)).size !== cities.length) {
    errors.push(FREIGHT_REGION_FORM_ERROR.CITY_DUPLICATED)
  }

  if (errors.length > 0) return { errors, ok: false }

  return { body: { cities, code, name, rates: toRates(state.rates) }, ok: true }
}
