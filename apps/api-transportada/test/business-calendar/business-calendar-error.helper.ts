/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'

import { buildBusinessCalendar } from '../../src/business-calendar/domain/business-calendar.policy.js'
import { BusinessCalendarError } from '../../src/business-calendar/domain/business-calendar.error.js'
import type { BuildBusinessCalendarParams } from '../../src/business-calendar/domain/business-calendar.types.js'
import {
  TEST_CITY_IBGE_CODE,
  TEST_MUNICIPAL_RULES,
  TEST_STATE_RULES,
} from '../fixtures/business-calendar.fixture.js'

const VALID_PARAMS: BuildBusinessCalendarParams = {
  cityIbgeCode: TEST_CITY_IBGE_CODE.campinas,
  coverage: { fromYear: 2026, toYear: 2027 },
  municipalRules: TEST_MUNICIPAL_RULES,
  saturdayIsBusinessDay: false,
  stateRules: TEST_STATE_RULES,
}

/** Campinas 2026–2027 com as regras do contrato, trocando só o que o caso quer quebrar. */
export function buildWith(overrides: Partial<BuildBusinessCalendarParams>): () => unknown {
  return () => buildBusinessCalendar({ ...VALID_PARAMS, ...overrides })
}

/** Afirma o código, não só "lançou": um `TypeError` qualquer passaria num `toThrow()` cru. */
type ExpectCalendarErrorParams = {
  readonly action: () => unknown
  readonly code: string
}

export function expectCalendarError({ action, code }: ExpectCalendarErrorParams): void {
  let caught: unknown
  try {
    action()
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(BusinessCalendarError)
  expect((caught as BusinessCalendarError).code).toBe(code)
}
