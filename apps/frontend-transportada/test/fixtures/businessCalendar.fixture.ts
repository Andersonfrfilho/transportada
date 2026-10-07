/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 Fase 2: o formato REAL das respostas das rotas do calendário (apps/api-transportada,
 * `presentation/*.schema.ts`), com dados fictícios. As chaves aqui são as que a API manda — a guarda de chaves
 * exatas do painel é provada contra elas.
 */
import type {
  BusinessCalendarSettings,
  MunicipalHoliday,
  MunicipalHolidayRule,
  SavedMunicipalHoliday,
  StateHoliday,
} from '@/modules/company-settings/shared/businessCalendar.types'

export const CAMPINAS_CODE = '3509502'
export const CURITIBA_CODE = '4106902'
export const SAO_PAULO_STATE_CODE = '35'
export const RULE_ID = '0b9c1f5e-5a62-4d0a-8b45-5d7c3f0e1a01'
export const OTHER_RULE_ID = '0b9c1f5e-5a62-4d0a-8b45-5d7c3f0e1a02'
export const HOLIDAY_ID = '7d1e4a52-9c3b-4c60-a1f4-2b8d6e5f0c11'
export const STATE_HOLIDAY_ID = '9a2f6c18-3d4e-4b71-8c05-1e7a9b3d5f21'

export function buildSettings(
  overrides: Partial<BusinessCalendarSettings> = {},
): BusinessCalendarSettings {
  return { origin: 'default', saturdayIsBusinessDay: false, updatedAt: null, ...overrides }
}

export function buildRule(overrides: Partial<MunicipalHolidayRule> = {}): MunicipalHolidayRule {
  return {
    cityIbgeCode: CAMPINAS_CODE,
    createdAt: '2026-10-01T12:00:00.000Z',
    day: 14,
    id: RULE_ID,
    kind: 'city_anniversary',
    materializedThroughYear: 2036,
    month: 7,
    name: 'Aniversário de Campinas',
    typedHolidaysKept: 0,
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  }
}

export function buildHoliday(overrides: Partial<MunicipalHoliday> = {}): MunicipalHoliday {
  return {
    cityIbgeCode: CURITIBA_CODE,
    generatedByRuleId: null,
    holidayOn: '2026-09-08',
    id: HOLIDAY_ID,
    kind: 'holiday',
    name: 'Nossa Senhora da Luz',
    ...overrides,
  }
}

export function buildSavedHoliday(
  overrides: Partial<SavedMunicipalHoliday> = {},
): SavedMunicipalHoliday {
  return { ...buildHoliday(), adoptedFromRuleId: null, ...overrides }
}

export function buildYearlyStateHoliday(
  overrides: Partial<Extract<StateHoliday, { recurrence: 'yearly' }>> = {},
): StateHoliday {
  return {
    day: 9,
    id: STATE_HOLIDAY_ID,
    month: 7,
    name: 'Revolução Constitucionalista',
    recurrence: 'yearly',
    stateIbgeCode: SAO_PAULO_STATE_CODE,
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  }
}

export function buildOnceStateHoliday(
  overrides: Partial<Extract<StateHoliday, { recurrence: 'once' }>> = {},
): StateHoliday {
  return {
    holidayOn: '2026-12-19',
    id: 'c3d4e5f6-0a1b-4c2d-8e3f-4a5b6c7d8e9f',
    name: 'Emancipação Política do Paraná',
    recurrence: 'once',
    stateIbgeCode: '41',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  }
}

/** O corpo `{ data }` que a API manda, sempre sem nenhuma outra chave no topo. */
export function envelope(data: unknown): { data: unknown } {
  return { data }
}
