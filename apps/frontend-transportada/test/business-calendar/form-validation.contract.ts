/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1: a validação do formulário de feriado mora num arquivo só (`web.md` §11). O dia que não cabe no mês
 * (31/04, 30/02) é recusado na tela, antes de ir ao servidor; 29/02 vale (existe nos anos bissextos).
 */
import { describe, expect, test } from 'bun:test'

import {
  EMPTY_HOLIDAY_DRAFT,
  isDayInMonth,
  maskDayInput,
  validateHolidayDraft,
  type HolidayDraft,
} from '@/modules/company-settings/shared/businessCalendarForm.validation'

const VALID_YEARLY: HolidayDraft = {
  ...EMPTY_HOLIDAY_DRAFT,
  cityIbgeCode: '3509502',
  day: '14',
  kind: 'city_anniversary',
  month: '7',
  name: 'Aniversário de Campinas',
  recurrence: 'yearly',
  stateIbgeCode: '35',
}
const VALID_ONCE: HolidayDraft = {
  ...EMPTY_HOLIDAY_DRAFT,
  cityIbgeCode: '4106902',
  holidayOn: '2026-09-08',
  kind: 'holiday',
  name: 'Nossa Senhora da Luz',
  recurrence: 'once',
  stateIbgeCode: '41',
}

describe('o dia cabe no mês', () => {
  test('31/04 e 30/02 não existem; 29/02 vale', () => {
    expect(isDayInMonth({ day: 31, month: 4 })).toBe(false)
    expect(isDayInMonth({ day: 30, month: 2 })).toBe(false)
    expect(isDayInMonth({ day: 31, month: 6 })).toBe(false)
    expect(isDayInMonth({ day: 29, month: 2 })).toBe(true)
    expect(isDayInMonth({ day: 31, month: 12 })).toBe(true)
    expect(isDayInMonth({ day: 14, month: 7 })).toBe(true)
  })

  test('dia zero, 32 e mês 13 também não', () => {
    expect(isDayInMonth({ day: 0, month: 1 })).toBe(false)
    expect(isDayInMonth({ day: 32, month: 1 })).toBe(false)
    expect(isDayInMonth({ day: 1, month: 13 })).toBe(false)
    expect(isDayInMonth({ day: 1, month: 0 })).toBe(false)
  })

  test('a máscara do dia aceita só dois dígitos', () => {
    expect(maskDayInput('3a1')).toBe('31')
    expect(maskDayInput('123')).toBe('12')
    expect(maskDayInput('')).toBe('')
  })
})

describe('feriado municipal', () => {
  test('o formulário completo "todo ano" e "só esta data" não tem pendência', () => {
    expect(validateHolidayDraft({ draft: VALID_YEARLY, scope: 'municipal' })).toEqual({})
    expect(validateHolidayDraft({ draft: VALID_ONCE, scope: 'municipal' })).toEqual({})
  })

  test('29/02 é aceito; 31/04 e 30/02 apontam o campo do dia', () => {
    const leap = { ...VALID_YEARLY, day: '29', month: '2' }
    const april = { ...VALID_YEARLY, day: '31', month: '4' }
    const february = { ...VALID_YEARLY, day: '30', month: '2' }

    expect(validateHolidayDraft({ draft: leap, scope: 'municipal' })).toEqual({})
    expect(validateHolidayDraft({ draft: april, scope: 'municipal' })).toEqual({
      day: 'dayNotInMonth',
    })
    expect(validateHolidayDraft({ draft: february, scope: 'municipal' })).toEqual({
      day: 'dayNotInMonth',
    })
  })

  test('o formulário vazio aponta todos os campos de uma vez', () => {
    expect(validateHolidayDraft({ draft: EMPTY_HOLIDAY_DRAFT, scope: 'municipal' })).toEqual({
      cityIbgeCode: 'required',
      kind: 'required',
      name: 'required',
      recurrence: 'required',
      stateIbgeCode: 'required',
    })
  })

  test('"todo ano" sem mês e dia pede os dois; "só esta data" pede a data', () => {
    expect(
      validateHolidayDraft({
        draft: { ...VALID_YEARLY, day: '', month: '' },
        scope: 'municipal',
      }),
    ).toEqual({ day: 'required', month: 'required' })
    expect(
      validateHolidayDraft({ draft: { ...VALID_ONCE, holidayOn: '' }, scope: 'municipal' }),
    ).toEqual({ holidayOn: 'required' })
  })

  test('os campos da outra recorrência não pesam', () => {
    expect(
      validateHolidayDraft({
        draft: { ...VALID_YEARLY, holidayOn: '2026-02-30' },
        scope: 'municipal',
      }),
    ).toEqual({})
  })

  test('a data "só esta data" que não existe é recusada', () => {
    expect(
      validateHolidayDraft({
        draft: { ...VALID_ONCE, holidayOn: '2026-02-30' },
        scope: 'municipal',
      }),
    ).toEqual({ holidayOn: 'invalid' })
    expect(
      validateHolidayDraft({
        draft: { ...VALID_ONCE, holidayOn: '2027-02-29' },
        scope: 'municipal',
      }),
    ).toEqual({ holidayOn: 'invalid' })
  })

  test('o nome tem de 1 a 120 caracteres, sem contar o espaço das pontas', () => {
    expect(
      validateHolidayDraft({ draft: { ...VALID_YEARLY, name: '   ' }, scope: 'municipal' }),
    ).toEqual({ name: 'required' })
    expect(
      validateHolidayDraft({
        draft: { ...VALID_YEARLY, name: 'a'.repeat(120) },
        scope: 'municipal',
      }),
    ).toEqual({})
    expect(
      validateHolidayDraft({
        draft: { ...VALID_YEARLY, name: 'a'.repeat(121) },
        scope: 'municipal',
      }),
    ).toEqual({ name: 'tooLong' })
  })

  test('o município tem sete dígitos de uma UF que existe', () => {
    expect(
      validateHolidayDraft({
        draft: { ...VALID_YEARLY, cityIbgeCode: '35095' },
        scope: 'municipal',
      }),
    ).toEqual({ cityIbgeCode: 'invalid' })
    expect(
      validateHolidayDraft({
        draft: { ...VALID_YEARLY, cityIbgeCode: '9909502' },
        scope: 'municipal',
      }),
    ).toEqual({ cityIbgeCode: 'invalid' })
  })
})

describe('feriado estadual', () => {
  const STATE_YEARLY: HolidayDraft = {
    ...EMPTY_HOLIDAY_DRAFT,
    day: '9',
    month: '7',
    name: 'Revolução Constitucionalista',
    recurrence: 'yearly',
    stateIbgeCode: '35',
  }

  test('não pede município nem tipo', () => {
    expect(validateHolidayDraft({ draft: STATE_YEARLY, scope: 'state' })).toEqual({})
  })

  test('pede a UF, a recorrência e o nome', () => {
    expect(validateHolidayDraft({ draft: EMPTY_HOLIDAY_DRAFT, scope: 'state' })).toEqual({
      name: 'required',
      recurrence: 'required',
      stateIbgeCode: 'required',
    })
  })

  test('a UF tem de ser uma das 27', () => {
    expect(
      validateHolidayDraft({ draft: { ...STATE_YEARLY, stateIbgeCode: '99' }, scope: 'state' }),
    ).toEqual({ stateIbgeCode: 'invalid' })
  })

  test('o mesmo dia que não cabe no mês é recusado', () => {
    expect(
      validateHolidayDraft({ draft: { ...STATE_YEARLY, day: '31', month: '11' }, scope: 'state' }),
    ).toEqual({ day: 'dayNotInMonth' })
  })
})
