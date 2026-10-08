/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1: as guardas de resposta do calendário recusam chave a mais e chave a menos — o formato REAL da
 * API (`apps/api-transportada/.../presentation/*.schema.ts`). Chave desconhecida é a última linha antes de a
 * API vazar identidade de tenant para dentro do cliente (`objectKeys.service.ts`).
 */
import { describe, expect, test } from 'bun:test'

import {
  isBusinessCalendarSettings,
  isDataEnvelope,
  isMaterializationSummary,
  isMunicipalHoliday,
  isMunicipalHolidayRule,
  isSavedMunicipalHoliday,
  isStateHoliday,
} from '@/modules/company-settings/shared/businessCalendarGuards.validation'

import {
  buildHoliday,
  buildOnceStateHoliday,
  buildRule,
  buildSavedHoliday,
  buildSettings,
  buildYearlyStateHoliday,
} from '../fixtures/businessCalendar.fixture'

function withExtraKey<TValue extends object>(value: TValue): TValue & { companyId: string } {
  return { ...value, companyId: 'company-1' }
}

function without(value: object, key: string): unknown {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
}

describe('a configuração do sábado (GET/PUT /company-settings/business-calendar)', () => {
  test('aceita o formato da API, com e sem linha gravada', () => {
    expect(isBusinessCalendarSettings(buildSettings())).toBe(true)
    expect(
      isBusinessCalendarSettings(
        buildSettings({
          origin: 'company',
          saturdayIsBusinessDay: true,
          updatedAt: '2026-10-07T12:00:00.000Z',
        }),
      ),
    ).toBe(true)
  })

  test('recusa chave a mais, chave a menos e origem desconhecida', () => {
    expect(isBusinessCalendarSettings(withExtraKey(buildSettings()))).toBe(false)
    expect(isBusinessCalendarSettings(without(buildSettings(), 'updatedAt'))).toBe(false)
    expect(isBusinessCalendarSettings({ ...buildSettings(), origin: 'driver' })).toBe(false)
    expect(isBusinessCalendarSettings({ ...buildSettings(), saturdayIsBusinessDay: 'yes' })).toBe(
      false,
    )
  })
})

describe('a regra "todo ano" (/municipal-holiday-rules)', () => {
  test('aceita o POST (nove chaves) e o GET/PATCH (com typedHolidaysKept)', () => {
    expect(isMunicipalHolidayRule(without(buildRule(), 'typedHolidaysKept'))).toBe(true)
    expect(isMunicipalHolidayRule(buildRule({ typedHolidaysKept: 3 }))).toBe(true)
  })

  test('recusa chave a mais, chave a menos e tipo fora do vocabulário', () => {
    expect(isMunicipalHolidayRule(withExtraKey(buildRule()))).toBe(false)
    expect(isMunicipalHolidayRule(without(buildRule(), 'materializedThroughYear'))).toBe(false)
    expect(isMunicipalHolidayRule({ ...buildRule(), kind: 'optional_day' })).toBe(false)
    expect(isMunicipalHolidayRule({ ...buildRule(), typedHolidaysKept: '3' })).toBe(false)
    expect(isMunicipalHolidayRule({ ...buildRule(), month: '7' })).toBe(false)
  })
})

describe('a data fixa (/municipal-holidays)', () => {
  test('aceita data digitada e data gerada por regra', () => {
    expect(isMunicipalHoliday(buildHoliday())).toBe(true)
    expect(isMunicipalHoliday(buildHoliday({ generatedByRuleId: 'rule-1' }))).toBe(true)
  })

  test('recusa chave a mais e a menos', () => {
    expect(isMunicipalHoliday(withExtraKey(buildHoliday()))).toBe(false)
    expect(isMunicipalHoliday(without(buildHoliday(), 'generatedByRuleId'))).toBe(false)
    expect(isMunicipalHoliday({ ...buildHoliday(), kind: 'other' })).toBe(false)
  })

  test('o POST ganha `adoptedFromRuleId`, e só ele', () => {
    expect(isSavedMunicipalHoliday(buildSavedHoliday())).toBe(true)
    expect(isSavedMunicipalHoliday(buildSavedHoliday({ adoptedFromRuleId: 'rule-1' }))).toBe(true)
    expect(isSavedMunicipalHoliday(buildHoliday())).toBe(false)
    expect(isSavedMunicipalHoliday(withExtraKey(buildSavedHoliday()))).toBe(false)
  })
})

describe('o feriado estadual (/state-holidays)', () => {
  test('aceita as duas formas, cada uma com as chaves dela', () => {
    expect(isStateHoliday(buildYearlyStateHoliday())).toBe(true)
    expect(isStateHoliday(buildOnceStateHoliday())).toBe(true)
  })

  test('a forma errada não passa: `once` com mês e dia, `yearly` com data', () => {
    expect(isStateHoliday({ ...buildOnceStateHoliday(), day: 9, month: 7 })).toBe(false)
    expect(isStateHoliday({ ...buildYearlyStateHoliday(), holidayOn: '2026-07-09' })).toBe(false)
    expect(isStateHoliday(without(buildYearlyStateHoliday(), 'month'))).toBe(false)
    expect(isStateHoliday({ ...buildYearlyStateHoliday(), recurrence: 'weekly' })).toBe(false)
  })

  test('recusa chave a mais', () => {
    expect(isStateHoliday(withExtraKey(buildYearlyStateHoliday()))).toBe(false)
    expect(isStateHoliday(withExtraKey(buildOnceStateHoliday()))).toBe(false)
  })
})

describe('o resumo da geração e o envelope', () => {
  test('o resumo tem exatamente duas contagens', () => {
    expect(isMaterializationSummary({ holidaysCreated: 20, rulesProcessed: 2 })).toBe(true)
    expect(isMaterializationSummary({ holidaysCreated: 20 })).toBe(false)
    expect(isMaterializationSummary({ holidaysCreated: 20, rulesProcessed: 2, extra: 1 })).toBe(
      false,
    )
    expect(isMaterializationSummary({ holidaysCreated: '20', rulesProcessed: 2 })).toBe(false)
  })

  test('o corpo é só `{ data }`: qualquer outra chave no topo é recusada', () => {
    expect(isDataEnvelope({ data: [] })).toBe(true)
    expect(isDataEnvelope({ data: [], pagination: { total: 0 } })).toBe(false)
    expect(isDataEnvelope({})).toBe(false)
    expect(isDataEnvelope(null)).toBe(false)
    expect(isDataEnvelope([])).toBe(false)
  })
})
