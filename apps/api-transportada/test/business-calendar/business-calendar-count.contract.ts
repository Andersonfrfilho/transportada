/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: contar dias úteis (d com from < d ≤ to; negativo quando to < from), explicar um
 * dia e as perguntas pontuais de "é útil?". Numeração da tabela validada (evidence.md § T1.1).
 */
import { describe, expect, test } from 'bun:test'

import {
  countBusinessDays,
  explainDay,
  isBusinessDay,
} from '../../src/business-calendar/domain/business-calendar.policy.js'
import { type TestCity, buildTestCalendar, yearOf } from '../fixtures/business-calendar.fixture.js'

type CountCase = {
  readonly city: TestCity
  readonly expected: number
  readonly from: string
  readonly line: number
  readonly to: string
}

const COUNT_CASES: readonly CountCase[] = [
  { city: 'campinas', expected: 3, from: '2026-10-09', line: 51, to: '2026-10-16' },
  { city: 'campinas', expected: 1, from: '2026-10-16', line: 52, to: '2026-10-19' },
  { city: 'campinas', expected: 0, from: '2026-10-16', line: 53, to: '2026-10-16' },
  { city: 'campinas', expected: -1, from: '2026-10-19', line: 54, to: '2026-10-16' },
  { city: 'campinas', expected: 0, from: '2026-10-10', line: 55, to: '2026-10-13' },
  { city: 'saoPaulo', expected: 5, from: '2026-12-24', line: 56, to: '2027-01-04' },
  { city: 'campinas', expected: 4, from: '2026-07-10', line: 57, to: '2026-07-17' },
  { city: 'saoPaulo', expected: 2, from: '2026-11-13', line: 58, to: '2026-11-17' },
]

describe('spec 238 — contar dias úteis', () => {
  for (const countCase of COUNT_CASES) {
    test(`linha ${String(countCase.line)}: ${countCase.city} ${countCase.from} → ${countCase.to}`, () => {
      const calendar = buildTestCalendar({ city: countCase.city, fromYear: yearOf(countCase.from) })

      const result = countBusinessDays({ calendar, from: countCase.from, to: countCase.to })

      expect(result.businessDays).toBe(countCase.expected)
    })
  }
})

describe('spec 238 — explicar o dia', () => {
  test('linha 44: 29/02/2028 em BH tem Carnaval e o aniversário, e conta uma vez', () => {
    const calendar = buildTestCalendar({ city: 'beloHorizonte', fromYear: 2028 })

    expect(explainDay({ calendar, date: '2028-02-29' })).toEqual({
      isBusinessDay: false,
      reasons: [
        { key: 'carnival', source: 'national' },
        {
          kind: 'city_anniversary',
          name: 'Aniversário inventado de Belo Horizonte',
          source: 'municipal',
        },
      ],
      weekend: null,
    })
  })

  test('29/02 nunca cai em 01/03 de ano comum', () => {
    const calendar = buildTestCalendar({ city: 'beloHorizonte', fromYear: 2027 })

    expect(explainDay({ calendar, date: '2027-03-01' })).toEqual({
      isBusinessDay: true,
      reasons: [],
      weekend: null,
    })
  })

  test('feriado em domingo é explicado e não é transferido para a segunda', () => {
    const calendar = buildTestCalendar({ city: 'saoPaulo', fromYear: 2026 })

    expect(explainDay({ calendar, date: '2026-11-15' })).toEqual({
      isBusinessDay: false,
      reasons: [{ key: 'republic_proclamation', source: 'national' }],
      weekend: 'sunday',
    })
    expect(explainDay({ calendar, date: '2026-11-16' }).isBusinessDay).toBe(true)
  })

  test('feriado estadual explica a UF; o da outra UF não aparece', () => {
    const saoPaulo = buildTestCalendar({ city: 'saoPaulo', fromYear: 2026 })
    const rioDeJaneiro = buildTestCalendar({ city: 'rioDeJaneiro', fromYear: 2026 })

    expect(explainDay({ calendar: saoPaulo, date: '2026-07-09' }).reasons).toEqual([
      { name: 'Revolução Constitucionalista', source: 'state' },
    ])
    expect(explainDay({ calendar: rioDeJaneiro, date: '2026-07-09' }).reasons).toEqual([])
  })

  test('sábado é fim de semana mesmo quando é útil', () => {
    const calendar = buildTestCalendar({
      city: 'saoPaulo',
      fromYear: 2026,
      saturdayIsBusinessDay: true,
    })

    expect(explainDay({ calendar, date: '2026-10-10' })).toEqual({
      isBusinessDay: true,
      reasons: [],
      weekend: 'saturday',
    })
  })
})

describe('spec 238 — é dia útil?', () => {
  test('linha 47: domingo nunca é útil, nem com sábado útil', () => {
    const calendar = buildTestCalendar({
      city: 'saoPaulo',
      fromYear: 2026,
      saturdayIsBusinessDay: true,
    })

    expect(isBusinessDay({ calendar, date: '2026-10-11' })).toBe(false)
  })

  test('o feriado único vale só no ano gravado (CA2)', () => {
    const calendar = buildTestCalendar({ city: 'campinas', fromYear: 2026 })

    expect(isBusinessDay({ calendar, date: '2026-10-13' })).toBe(false)
    expect(isBusinessDay({ calendar, date: '2027-10-13' })).toBe(true)
  })

  test('o aniversário anual vale em 2026 e em 2027 sem recadastro (CA2)', () => {
    const calendar = buildTestCalendar({ city: 'campinas', fromYear: 2026 })

    expect(isBusinessDay({ calendar, date: '2026-07-14' })).toBe(false)
    expect(isBusinessDay({ calendar, date: '2027-07-14' })).toBe(false)
  })

  test('o feriado de uma cidade não vale na vizinha', () => {
    const campinas = buildTestCalendar({ city: 'campinas', fromYear: 2026 })
    const saoPaulo = buildTestCalendar({ city: 'saoPaulo', fromYear: 2026 })

    expect(isBusinessDay({ calendar: campinas, date: '2026-07-14' })).toBe(false)
    expect(isBusinessDay({ calendar: saoPaulo, date: '2026-07-14' })).toBe(true)
  })
})
