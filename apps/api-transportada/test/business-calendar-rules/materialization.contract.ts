/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3 (ADR-0096 §5): a regra "todo ano" vira uma data fixa por ano, do ano corrente até o
 * corrente + 10. A conta é pura; o ano corrente sai do relógio injetado, no fuso de São Paulo, e nunca
 * de um `new Date()` dentro da política.
 */
import { describe, expect, test } from 'bun:test'

import {
  listMaterializationDates,
  resolveMaterializationYears,
} from '../../src/business-calendar/application/municipal-holiday-materialization.service.js'

describe('as datas que uma regra "todo ano" gera (spec 238 T1.3)', () => {
  test('14/07 do ano corrente a +10 anos são onze datas, uma por ano', () => {
    const dates = listMaterializationDates({ day: 14, fromYear: 2026, month: 7, toYear: 2036 })

    expect(dates).toHaveLength(11)
    expect(dates[0]).toBe('2026-07-14')
    expect(dates[10]).toBe('2036-07-14')
    expect(new Set(dates).size).toBe(11)
  })

  test('29/02 só existe nos anos bissextos do horizonte e nunca cai em 28/02 nem em 01/03', () => {
    expect(listMaterializationDates({ day: 29, fromYear: 2026, month: 2, toYear: 2036 })).toEqual([
      '2028-02-29',
      '2032-02-29',
      '2036-02-29',
    ])
  })

  test('o século não bissexto é recusado e o bissexto, aceito', () => {
    expect(listMaterializationDates({ day: 29, fromYear: 2096, month: 2, toYear: 2104 })).toEqual([
      '2096-02-29',
      '2104-02-29',
    ])
    expect(listMaterializationDates({ day: 29, fromYear: 2000, month: 2, toYear: 2000 })).toEqual([
      '2000-02-29',
    ])
    expect(listMaterializationDates({ day: 29, fromYear: 2100, month: 2, toYear: 2100 })).toEqual(
      [],
    )
  })

  test('os limites do ano: 01/01 e 31/12', () => {
    expect(listMaterializationDates({ day: 1, fromYear: 2026, month: 1, toYear: 2027 })).toEqual([
      '2026-01-01',
      '2027-01-01',
    ])
    expect(listMaterializationDates({ day: 31, fromYear: 2026, month: 12, toYear: 2027 })).toEqual([
      '2026-12-31',
      '2027-12-31',
    ])
  })

  test('um ano só e intervalo invertido', () => {
    expect(listMaterializationDates({ day: 14, fromYear: 2026, month: 7, toYear: 2026 })).toEqual([
      '2026-07-14',
    ])
    expect(listMaterializationDates({ day: 14, fromYear: 2030, month: 7, toYear: 2026 })).toEqual(
      [],
    )
  })
})

describe('o horizonte da geração sai do relógio injetado (spec 238 T1.3)', () => {
  test('o ano corrente mais dez anos', () => {
    expect(resolveMaterializationYears({ now: new Date('2026-10-07T15:00:00.000Z') })).toEqual({
      fromYear: 2026,
      toYear: 2036,
    })
  })

  test('na virada, o dia civil é o de São Paulo, não o de UTC', () => {
    // 02:30 UTC de 01/01/2027 ainda é 23:30 de 31/12/2026 em São Paulo.
    expect(resolveMaterializationYears({ now: new Date('2027-01-01T02:30:00.000Z') })).toEqual({
      fromYear: 2026,
      toYear: 2036,
    })
    expect(resolveMaterializationYears({ now: new Date('2027-01-01T03:00:00.000Z') })).toEqual({
      fromYear: 2027,
      toYear: 2037,
    })
  })
})
