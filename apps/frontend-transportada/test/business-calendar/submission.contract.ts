/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1: do rascunho do formulário ao corpo do pedido. A edição manda só o que mudou — a cidade da regra
 * não se edita (ADR-0096 §6), a data fixa só muda nome e tipo, e o `PATCH` estadual exige a recorrência.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildHolidayChanges,
  buildHolidayFields,
  buildRuleChanges,
  buildRuleFields,
  buildStateHolidayChanges,
  buildStateHolidayFields,
  draftFromHoliday,
  draftFromRule,
  draftFromStateHoliday,
} from '@/modules/company-settings/shared/businessCalendarSubmission.service'
import {
  EMPTY_HOLIDAY_DRAFT,
  type HolidayDraft,
} from '@/modules/company-settings/shared/businessCalendarForm.validation'

import {
  buildHoliday,
  buildOnceStateHoliday,
  buildRule,
  buildYearlyStateHoliday,
} from '../fixtures/businessCalendar.fixture'

const YEARLY_DRAFT: HolidayDraft = {
  ...EMPTY_HOLIDAY_DRAFT,
  cityIbgeCode: '3509502',
  day: '14',
  kind: 'city_anniversary',
  month: '7',
  name: '  Aniversário de Campinas  ',
  recurrence: 'yearly',
  stateIbgeCode: '35',
}

describe('regra "todo ano"', () => {
  test('o corpo leva número no mês e no dia, o nome aparado e nenhum campo a mais', () => {
    expect(buildRuleFields(YEARLY_DRAFT)).toEqual({
      cityIbgeCode: '3509502',
      day: 14,
      kind: 'city_anniversary',
      month: 7,
      name: 'Aniversário de Campinas',
    })
  })

  test('o rascunho de uma regra existente volta igual ao que está gravado', () => {
    const rule = buildRule()

    expect(draftFromRule(rule)).toEqual({
      ...EMPTY_HOLIDAY_DRAFT,
      cityIbgeCode: '3509502',
      day: '14',
      kind: 'city_anniversary',
      month: '7',
      name: 'Aniversário de Campinas',
      recurrence: 'yearly',
      stateIbgeCode: '35',
    })
  })

  test('sem mudança não há pedido', () => {
    expect(
      buildRuleChanges({ draft: draftFromRule(buildRule()), rule: buildRule() }),
    ).toBeUndefined()
  })

  test('mudar só o nome manda só o nome; a cidade nunca vai', () => {
    const draft = { ...draftFromRule(buildRule()), name: 'Aniversário da Cidade de Campinas' }

    expect(buildRuleChanges({ draft, rule: buildRule() })).toEqual({
      name: 'Aniversário da Cidade de Campinas',
    })
  })

  test('mudar o mês OU o dia manda os dois, para o servidor conferir o par', () => {
    const draft = { ...draftFromRule(buildRule()), day: '15' }

    expect(buildRuleChanges({ draft, rule: buildRule() })).toEqual({ day: 15, month: 7 })
  })

  test('mudar o tipo manda só o tipo', () => {
    const draft = { ...draftFromRule(buildRule()), kind: 'holiday' as const }

    expect(buildRuleChanges({ draft, rule: buildRule() })).toEqual({ kind: 'holiday' })
  })
})

describe('data fixa do município', () => {
  test('"só esta data" leva cidade, data, tipo e nome', () => {
    const draft: HolidayDraft = {
      ...EMPTY_HOLIDAY_DRAFT,
      cityIbgeCode: '4106902',
      holidayOn: '2026-09-08',
      kind: 'holiday',
      name: 'Nossa Senhora da Luz',
      recurrence: 'once',
      stateIbgeCode: '41',
    }

    expect(buildHolidayFields(draft)).toEqual({
      cityIbgeCode: '4106902',
      holidayOn: '2026-09-08',
      kind: 'holiday',
      name: 'Nossa Senhora da Luz',
    })
  })

  test('a edição só muda nome e tipo; data e cidade são a identidade da linha', () => {
    const holiday = buildHoliday()
    const unchanged = draftFromHoliday(holiday)

    expect(buildHolidayChanges({ draft: unchanged, holiday })).toBeUndefined()
    expect(buildHolidayChanges({ draft: { ...unchanged, name: 'Outro nome' }, holiday })).toEqual({
      name: 'Outro nome',
    })
    expect(
      buildHolidayChanges({ draft: { ...unchanged, kind: 'city_anniversary' }, holiday }),
    ).toEqual({ kind: 'city_anniversary' })
    expect(
      buildHolidayChanges({
        draft: { ...unchanged, holidayOn: '2027-09-08' },
        holiday,
      }),
    ).toBeUndefined()
  })
})

describe('feriado estadual', () => {
  test('"todo ano" leva mês e dia; "só esta data" leva a data', () => {
    expect(
      buildStateHolidayFields({
        ...EMPTY_HOLIDAY_DRAFT,
        day: '9',
        month: '7',
        name: 'Revolução Constitucionalista',
        recurrence: 'yearly',
        stateIbgeCode: '35',
      }),
    ).toEqual({
      day: 9,
      month: 7,
      name: 'Revolução Constitucionalista',
      recurrence: 'yearly',
      stateIbgeCode: '35',
    })
    expect(
      buildStateHolidayFields({
        ...EMPTY_HOLIDAY_DRAFT,
        holidayOn: '2026-12-19',
        name: 'Emancipação do Paraná',
        recurrence: 'once',
        stateIbgeCode: '41',
      }),
    ).toEqual({
      holidayOn: '2026-12-19',
      name: 'Emancipação do Paraná',
      recurrence: 'once',
      stateIbgeCode: '41',
    })
  })

  test('o rascunho de um feriado gravado volta igual', () => {
    expect(draftFromStateHoliday(buildYearlyStateHoliday())).toEqual({
      ...EMPTY_HOLIDAY_DRAFT,
      day: '9',
      month: '7',
      name: 'Revolução Constitucionalista',
      recurrence: 'yearly',
      stateIbgeCode: '35',
    })
    expect(draftFromStateHoliday(buildOnceStateHoliday()).holidayOn).toBe('2026-12-19')
  })

  test('o PATCH leva sempre a recorrência; sem mudança não há pedido', () => {
    const yearly = buildYearlyStateHoliday()
    const draft = draftFromStateHoliday(yearly)

    expect(buildStateHolidayChanges({ draft, holiday: yearly })).toBeUndefined()
    expect(
      buildStateHolidayChanges({ draft: { ...draft, name: 'Novo' }, holiday: yearly }),
    ).toEqual({
      name: 'Novo',
      recurrence: 'yearly',
    })
  })

  test('no "todo ano", mudar o mês ou o dia manda os dois juntos', () => {
    const yearly = buildYearlyStateHoliday()
    const draft = { ...draftFromStateHoliday(yearly), day: '10' }

    expect(buildStateHolidayChanges({ draft, holiday: yearly })).toEqual({
      day: 10,
      month: 7,
      recurrence: 'yearly',
    })
  })

  test('no "só esta data", mudar a data manda só a data', () => {
    const once = buildOnceStateHoliday()
    const draft = { ...draftFromStateHoliday(once), holidayOn: '2026-12-20' }

    expect(buildStateHolidayChanges({ draft, holiday: once })).toEqual({
      holidayOn: '2026-12-20',
      recurrence: 'once',
    })
  })
})
