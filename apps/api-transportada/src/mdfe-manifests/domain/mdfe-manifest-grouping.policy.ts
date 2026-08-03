/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
  rescaleHalfUp,
} from '../../shared/decimal.service.js'
import type { ManifestableDocument } from './mdfe-manifest-eligibility.policy.js'
import { MdfeManifestMultipleOriginStatesError } from './mdfe-manifest.error.js'

export const CARGO_VALUE_SCALE = 2n
export const CARGO_WEIGHT_SCALE = 4n
const ERROR_CODE_PREFIX = 'MDFE_MANIFEST'

export type MdfeManifestCity = {
  readonly cityCode: string
  readonly cityName: string
  readonly state: string
}

export type MdfeManifestDischargeCity = MdfeManifestCity & {
  readonly accessKeys: readonly string[]
}

export type MdfeManifestTotals = {
  readonly cargoValue: string
  readonly cargoWeight: string
  readonly cteCount: number
}

export function distinctStates(states: readonly string[]): readonly string[] {
  return [...new Set(states)]
}

export function groupDischargeCities(
  documents: readonly ManifestableDocument[],
): readonly MdfeManifestDischargeCity[] {
  const cities = new Map<string, MdfeManifestCity & { readonly accessKeys: string[] }>()

  for (const document of documents) {
    const city = cities.get(document.dischargeCityCode)
    if (city === undefined) {
      cities.set(document.dischargeCityCode, {
        accessKeys: [document.accessKey],
        cityCode: document.dischargeCityCode,
        cityName: document.dischargeCityName,
        state: document.dischargeState,
      })
      continue
    }
    city.accessKeys.push(document.accessKey)
  }

  return [...cities.values()]
}

export function groupLoadingCities(
  documents: readonly ManifestableDocument[],
): readonly MdfeManifestCity[] {
  const cities = new Map<string, MdfeManifestCity>()

  for (const document of documents) {
    if (cities.has(document.originCityCode)) continue
    cities.set(document.originCityCode, {
      cityCode: document.originCityCode,
      cityName: document.originCityName,
      state: document.originState,
    })
  }

  return [...cities.values()]
}

/** UFIni é única no manifesto — misturar origens é erro de seleção, não algo a arbitrar aqui. */
export function resolveOriginState(documents: readonly ManifestableDocument[]): string {
  const states = distinctStates(documents.map((document) => document.originState))
  if (states.length > 1) throw new MdfeManifestMultipleOriginStatesError(states)
  return states[0] ?? ''
}

/** UFFim ambígua fica em branco com as opções à vista — quem escolhe é o operador na criação. */
export function resolveSingleState(states: readonly string[]): string {
  return states.length === 1 ? (states[0] ?? '') : ''
}

export function sumTotals(documents: readonly ManifestableDocument[]): MdfeManifestTotals {
  const value = sumScaled(
    documents.map((document) => document.cargoValue),
    CARGO_VALUE_SCALE,
  )
  const weight = sumScaled(
    documents.map((document) => document.cargoWeight),
    CARGO_WEIGHT_SCALE,
  )

  return {
    cargoValue: formatScaledDecimal(value, CARGO_VALUE_SCALE),
    cargoWeight: formatScaledDecimal(weight, CARGO_WEIGHT_SCALE),
    cteCount: documents.length,
  }
}

/** A NF-e guarda valor em quatro casas e o vCarga aceita duas — soma cheia, um arredondamento só. */
export function sumCargoValue(values: readonly string[]): string {
  return formatScaledDecimal(
    rescaleHalfUp({
      fromScale: MONEY_SCALE,
      toScale: CARGO_VALUE_SCALE,
      value: sumScaled(values, MONEY_SCALE),
    }),
    CARGO_VALUE_SCALE,
  )
}

export function sumScaled(values: readonly string[], scale: bigint): bigint {
  return values.reduce(
    (total, value) =>
      total + parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale, value }),
    0n,
  )
}
