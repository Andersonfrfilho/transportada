/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  matchesFreightRuleFilters,
  normalizeFreightRuleFilters,
} from '../../src/freight-rules/domain/freight-rule-filters.policy.js'

const SENDER_TAX_ID = '61084018000109'
const OTHER_TAX_ID = '11222333000181'
const RIBEIRAO_PRETO = '3543402'
const SERTAOZINHO = '3551702'

/** O casamento pede todo seletor; os testes antigos só falavam de dois, e agora são três. */
function match(input: {
  readonly destinationCityCode?: string | null
  readonly destinationState: string | null
  readonly filters: ReturnType<typeof normalizeFreightRuleFilters>
  readonly senderTaxId: string | null
}): boolean {
  return matchesFreightRuleFilters({
    destinationCityCode: input.destinationCityCode ?? null,
    destinationState: input.destinationState,
    filters: input.filters,
    senderTaxId: input.senderTaxId,
  })
}

describe('freight rule filters contract', () => {
  test('normalizes an absent filter into the empty selector that matches every document', () => {
    const filters = normalizeFreightRuleFilters(undefined)

    expect(filters).toEqual({ destinationCityCodes: [], destinationStates: [], senderTaxIds: [] })
    expect(match({ destinationState: 'MG', filters, senderTaxId: OTHER_TAX_ID })).toBe(true)
    expect(match({ destinationState: null, filters, senderTaxId: null })).toBe(true)
  })

  test('normalizes legacy persisted filters and uppercases, trims, deduplicates and sorts the selectors', () => {
    expect(normalizeFreightRuleFilters({})).toEqual({
      destinationCityCodes: [],
      destinationStates: [],
      senderTaxIds: [],
    })
    expect(
      normalizeFreightRuleFilters({
        destinationStates: [' sp ', 'mg', 'SP'],
        senderTaxIds: [` ${SENDER_TAX_ID} `, SENDER_TAX_ID],
      }),
    ).toEqual({
      destinationCityCodes: [],
      destinationStates: ['MG', 'SP'],
      senderTaxIds: [SENDER_TAX_ID],
    })
  })

  test('applies the destination state exception only to the listed states', () => {
    const filters = normalizeFreightRuleFilters({ destinationStates: ['MG', 'RJ'] })

    expect(match({ destinationState: 'MG', filters, senderTaxId: SENDER_TAX_ID })).toBe(true)
    expect(match({ destinationState: 'mg', filters, senderTaxId: SENDER_TAX_ID })).toBe(true)
    expect(match({ destinationState: 'SP', filters, senderTaxId: SENDER_TAX_ID })).toBe(false)
    expect(match({ destinationState: null, filters, senderTaxId: SENDER_TAX_ID })).toBe(false)
  })

  test('requires every declared selector to match, never just one of them', () => {
    const filters = normalizeFreightRuleFilters({
      destinationStates: ['MG'],
      senderTaxIds: [SENDER_TAX_ID],
    })

    expect(match({ destinationState: 'MG', filters, senderTaxId: SENDER_TAX_ID })).toBe(true)
    expect(match({ destinationState: 'MG', filters, senderTaxId: OTHER_TAX_ID })).toBe(false)
    expect(match({ destinationState: 'SP', filters, senderTaxId: SENDER_TAX_ID })).toBe(false)
  })

  test('rejects a selector that is not a plain uppercase state or a numeric tax id', () => {
    expect(() => normalizeFreightRuleFilters({ destinationStates: ['SAO PAULO'] })).toThrow()
    expect(() => normalizeFreightRuleFilters({ senderTaxIds: ['61.084.018/0001-09'] })).toThrow()
  })

  /**
   * Spec 065 D6: sem dimensão de município não há como precificar a entrega urbana — que é justamente
   * a que tem outro documento, outro imposto e outra margem.
   */
  test('applies the destination city exception only to the listed municipalities', () => {
    const filters = normalizeFreightRuleFilters({ destinationCityCodes: [RIBEIRAO_PRETO] })

    expect(
      match({
        destinationCityCode: RIBEIRAO_PRETO,
        destinationState: 'SP',
        filters,
        senderTaxId: SENDER_TAX_ID,
      }),
    ).toBe(true)
    expect(
      match({
        destinationCityCode: SERTAOZINHO,
        destinationState: 'SP',
        filters,
        senderTaxId: SENDER_TAX_ID,
      }),
    ).toBe(false)
  })

  /** Nota sem município não casa com regra de município: ela cai na regra geral, e não nesta. */
  test('a document without a municipality never matches a city-scoped rule', () => {
    const filters = normalizeFreightRuleFilters({ destinationCityCodes: [RIBEIRAO_PRETO] })

    expect(match({ destinationState: 'SP', filters, senderTaxId: SENDER_TAX_ID })).toBe(false)
  })

  /** Município e UF na mesma regra somam, como os outros seletores: todos precisam casar. */
  test('city and state selectors both have to match', () => {
    const filters = normalizeFreightRuleFilters({
      destinationCityCodes: [RIBEIRAO_PRETO],
      destinationStates: ['MG'],
    })

    expect(
      match({
        destinationCityCode: RIBEIRAO_PRETO,
        destinationState: 'SP',
        filters,
        senderTaxId: SENDER_TAX_ID,
      }),
    ).toBe(false)
  })

  /** Nome de cidade tem três grafias; o IBGE tem uma. Só o código de sete dígitos entra. */
  test('rejects a city selector that is not a seven-digit IBGE code', () => {
    for (const dirty of ['RIBEIRAO PRETO', '354340', '35434021', '3.543.402']) {
      expect(() => normalizeFreightRuleFilters({ destinationCityCodes: [dirty] })).toThrow()
    }
  })
})
