/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §3, §6): a origem do feriado (`code`, `typed`, `rule`, `imported`) nas regras e na
 * razão do dia, e a política pura do aviso — o dia que não é útil POR FERIADO, no formato único que o
 * painel e o app do motorista já toleram (`cityIbgeCode` numérico, `cityName` ausente quando não se sabe).
 */
import { describe, expect, test } from 'bun:test'

import { buildBusinessCalendar } from '../../src/business-calendar/domain/business-calendar.policy.js'
import { explainDay } from '../../src/business-calendar/domain/business-calendar.policy.js'
import type {
  BusinessCalendar,
  MunicipalHolidayRule,
  StateHolidayRule,
} from '../../src/business-calendar/domain/business-calendar.types.js'
import { buildHolidayWarning } from '../../src/business-calendar/domain/holiday-warning.policy.js'
import { TEST_CITY_IBGE_CODE } from '../fixtures/business-calendar.fixture.js'

const CAMPINAS = TEST_CITY_IBGE_CODE.campinas

function calendarWith(input: {
  readonly municipalRules?: readonly MunicipalHolidayRule[]
  readonly saturdayIsBusinessDay?: boolean
  readonly stateRules?: readonly StateHolidayRule[]
}): BusinessCalendar {
  return buildBusinessCalendar({
    cityIbgeCode: CAMPINAS,
    coverage: { fromYear: 2026, toYear: 2027 },
    municipalRules: input.municipalRules ?? [],
    saturdayIsBusinessDay: input.saturdayIsBusinessDay ?? false,
    stateRules: input.stateRules ?? [],
  })
}

const IMPORTED_ANNIVERSARY: MunicipalHolidayRule = {
  cityIbgeCode: CAMPINAS,
  kind: 'city_anniversary',
  name: 'Aniversário de Campinas',
  occurrence: { date: '2026-07-14', recurrence: 'once' },
  origin: 'imported',
}

describe('spec 252 — a origem do feriado na razão do dia', () => {
  test('o nacional vem do código; o estadual e o municipal trazem a origem da regra', () => {
    const calendar = calendarWith({
      municipalRules: [
        IMPORTED_ANNIVERSARY,
        {
          cityIbgeCode: CAMPINAS,
          kind: 'holiday',
          name: 'Padroeira',
          occurrence: { date: '2026-12-08', recurrence: 'once' },
          origin: 'typed',
        },
        {
          cityIbgeCode: CAMPINAS,
          kind: 'city_anniversary',
          name: 'Aniversário (regra)',
          occurrence: { day: 15, month: 8, recurrence: 'yearly' },
          origin: 'rule',
        },
      ],
      stateRules: [
        {
          name: 'Data estadual importada',
          occurrence: { date: '2026-09-09', recurrence: 'once' },
          origin: 'imported',
          stateIbgeCode: '35',
        },
      ],
    })

    expect(explainDay({ calendar, date: '2026-09-07' }).reasons).toEqual([
      { key: 'independence_day', origin: 'code', source: 'national' },
    ])
    expect(explainDay({ calendar, date: '2026-07-14' }).reasons).toEqual([
      {
        kind: 'city_anniversary',
        name: 'Aniversário de Campinas',
        origin: 'imported',
        source: 'municipal',
      },
    ])
    expect(explainDay({ calendar, date: '2026-12-08' }).reasons).toMatchObject([
      { origin: 'typed', source: 'municipal' },
    ])
    expect(explainDay({ calendar, date: '2026-08-15' }).reasons).toMatchObject([
      { origin: 'rule', source: 'municipal' },
    ])
    expect(explainDay({ calendar, date: '2026-09-09' }).reasons).toEqual([
      { name: 'Data estadual importada', origin: 'imported', source: 'state' },
    ])
  })

  test('regra montada à mão, sem origem, é digitada', () => {
    const calendar = calendarWith({
      municipalRules: [
        {
          cityIbgeCode: CAMPINAS,
          kind: 'city_anniversary',
          name: 'Aniversário de Campinas',
          occurrence: { date: '2026-07-14', recurrence: 'once' },
        },
      ],
    })

    expect(explainDay({ calendar, date: '2026-07-14' }).reasons).toMatchObject([
      { origin: 'typed', source: 'municipal' },
    ])
  })

  test('duas causas no mesmo dia contam uma vez e as duas origens ficam na lista', () => {
    const calendar = calendarWith({
      municipalRules: [
        IMPORTED_ANNIVERSARY,
        {
          cityIbgeCode: CAMPINAS,
          kind: 'city_anniversary',
          name: 'Aniversário (regra)',
          occurrence: { day: 14, month: 7, recurrence: 'yearly' },
          origin: 'rule',
        },
      ],
    })

    const day = explainDay({ calendar, date: '2026-07-14' })

    expect(day.isBusinessDay).toBe(false)
    expect(day.reasons.map((reason) => reason.origin)).toEqual(['imported', 'rule'])
  })
})

describe('spec 252 — o aviso é do dia que fecha POR FERIADO (ADR-0100 §6)', () => {
  test('feriado municipal em dia de semana avisa, no formato único e com a origem', () => {
    const calendar = calendarWith({ municipalRules: [IMPORTED_ANNIVERSARY] })

    const warning = buildHolidayWarning({ calendar, cityName: 'Campinas', date: '2026-07-14' })

    expect(warning).toEqual({
      cityIbgeCode: 3509502,
      cityName: 'Campinas',
      date: '2026-07-14',
      reasons: [{ name: 'Aniversário de Campinas', origin: 'imported', scope: 'municipal' }],
    })
  })

  test('sem o nome da cidade a chave some: ausente, nunca null nem vazio', () => {
    const calendar = calendarWith({ municipalRules: [IMPORTED_ANNIVERSARY] })

    for (const cityName of [undefined, '']) {
      const warning = buildHolidayWarning({
        calendar,
        date: '2026-07-14',
        ...(cityName === undefined ? {} : { cityName }),
      })

      expect(warning).toBeDefined()
      expect(warning !== undefined && 'cityName' in warning).toBe(false)
    }
  })

  test('o nacional sai com a chave estável no lugar do nome e a origem do código', () => {
    const calendar = calendarWith({})

    expect(buildHolidayWarning({ calendar, date: '2026-09-07' })?.reasons).toEqual([
      { name: 'independence_day', origin: 'code', scope: 'national' },
    ])
  })

  test('dia sem feriado não avisa; fim de semana puro é o aviso que já existe', () => {
    const calendar = calendarWith({ municipalRules: [IMPORTED_ANNIVERSARY] })

    expect(buildHolidayWarning({ calendar, date: '2026-07-15' })).toBeUndefined()
    expect(buildHolidayWarning({ calendar, date: '2026-07-18' })).toBeUndefined()
    expect(buildHolidayWarning({ calendar, date: '2026-07-19' })).toBeUndefined()
  })

  test('feriado num domingo não avisa (já não era útil); no sábado, só se o sábado for útil', () => {
    const sunday = calendarWith({
      municipalRules: [
        { ...IMPORTED_ANNIVERSARY, occurrence: { date: '2026-07-12', recurrence: 'once' } },
      ],
    })
    const saturday = (saturdayIsBusinessDay: boolean) =>
      calendarWith({
        municipalRules: [
          { ...IMPORTED_ANNIVERSARY, occurrence: { date: '2026-07-11', recurrence: 'once' } },
        ],
        saturdayIsBusinessDay,
      })

    expect(buildHolidayWarning({ calendar: sunday, date: '2026-07-12' })).toBeUndefined()
    expect(buildHolidayWarning({ calendar: saturday(false), date: '2026-07-11' })).toBeUndefined()
    expect(buildHolidayWarning({ calendar: saturday(true), date: '2026-07-11' })).toMatchObject({
      reasons: [{ scope: 'municipal' }],
    })
  })

  test('a data fora da cobertura é recusa tipada, não "sem feriado"', () => {
    const calendar = calendarWith({})

    expect(() => buildHolidayWarning({ calendar, date: '2031-01-01' })).toThrow()
  })
})
