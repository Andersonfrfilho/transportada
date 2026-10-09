/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE,
  BRAZILIAN_STATE_IBGE_CODE_LIST,
} from '../../src/holiday-provider-pull/domain/brazilian-state.constant.js'
import { parseProviderDate } from '../../src/holiday-provider-pull/domain/provider-date.policy.js'

describe('a data da FeriadosAPI (spec 252 T3.1)', () => {
  test('DD/MM/AAAA vira a data civil ISO', () => {
    expect(parseProviderDate('13/10/2026')).toBe('2026-10-13')
    expect(parseProviderDate('01/01/2027')).toBe('2027-01-01')
    expect(parseProviderDate('29/02/2028')).toBe('2028-02-29')
  })

  test('data que não existe ou que não está no formato é recusada', () => {
    const refused = [
      '29/02/2026',
      '31/04/2026',
      '00/10/2026',
      '13/13/2026',
      '2026-10-13',
      '13-10-2026',
      '1/10/2026',
      '13/10/26',
      ' 13/10/2026',
      '13/10/2026 ',
      '',
    ]

    for (const text of refused) expect(parseProviderDate(text)).toBeUndefined()
  })
})

describe('a UF que o fornecedor chama pela sigla (spec 252 T3.1)', () => {
  test('as 27 unidades da federação têm sigla, e só elas', () => {
    expect(Object.keys(BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE).toSorted()).toEqual(
      [...BRAZILIAN_STATE_IBGE_CODE_LIST].toSorted(),
    )
    expect(BRAZILIAN_STATE_IBGE_CODE_LIST).toHaveLength(27)

    const abbreviations = Object.values(BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE)
    expect(new Set(abbreviations).size).toBe(27)
    for (const abbreviation of abbreviations) expect(abbreviation).toMatch(/^[A-Z]{2}$/u)
  })

  test('conferidas pelas que o produto mais usa', () => {
    expect(BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE['35']).toBe('SP')
    expect(BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE['33']).toBe('RJ')
    expect(BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE['31']).toBe('MG')
    expect(BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE['53']).toBe('DF')
    expect(BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE['11']).toBe('RO')
  })
})
