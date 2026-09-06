/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import tripPt from '../../src/modules/trip/locales/trip.locale.json'
import financialsEn from '../../src/modules/trip-financials/locales/tripFinancials.en.locale.json'
import financialsPt from '../../src/modules/trip-financials/locales/tripFinancials.locale.json'

/**
 * O bundle não carrega código da API, então a lista de lacunas é **cópia por valor** — como
 * `FUEL_TYPES` e `VEHICLE_TYPES`. Ela é lida do fonte da API para o contrato não virar duas listas
 * que concordam por acidente: acrescentar uma lacuna lá e esquecer o rótulo aqui faz o operador ler
 * `CITY_WITHOUT_REGION` na tela, porque o `t()` cai no próprio nome da chave.
 */
const API_POLICY = '../../../api-transportada/src/trips/domain/trip-valuation.policy.ts'

function apiGaps(): readonly string[] {
  const source = readFileSync(new URL(API_POLICY, import.meta.url), 'utf8')
  const block = source.slice(source.indexOf('VALUATION_GAPS'), source.indexOf('} as const'))

  return [...block.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1] ?? '')
}

/** Desce pelo JSON sem `any` e sem prometer forma que o arquivo pode não ter. */
function gapDictionary(
  source: unknown,
  ...path: readonly string[]
): null | Record<string, unknown> {
  let current: unknown = source
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return null
    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === 'object' && current !== null
    ? (current as Record<string, unknown>)
    : null
}

describe('valuation gap labels', () => {
  test('the API declares the gaps the screens have to name', () => {
    expect(apiGaps()).toContain('CITY_WITHOUT_REGION')
    expect(apiGaps()).toContain('NO_DRIVER_RATE')
  })

  test('every gap of the API has a label in both languages of both screens', () => {
    const dictionaries = [
      ['trip pt', gapDictionary(tripPt, 'valuation', 'gap')],
      ['trip en', gapDictionary(tripEn, 'valuation', 'gap')],
      ['financials pt', gapDictionary(financialsPt, 'gap')],
      ['financials en', gapDictionary(financialsEn, 'gap')],
    ] as const

    for (const [name, dictionary] of dictionaries) {
      expect(dictionary, `${name} has no gap dictionary`).not.toBeNull()
      for (const gap of apiGaps()) {
        expect(dictionary?.[gap], `${name} is missing ${gap}`).toBeTruthy()
      }
    }
  })
})
