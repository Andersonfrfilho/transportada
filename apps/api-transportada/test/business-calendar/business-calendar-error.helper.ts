/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'

import { BusinessCalendarError } from '../../src/business-calendar/domain/business-calendar.error.js'

/** Afirma o código, não só "lançou": um `TypeError` qualquer passaria num `toThrow()` cru. */
export function expectCalendarError(action: () => unknown, code: string): void {
  let caught: unknown
  try {
    action()
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(BusinessCalendarError)
  expect((caught as BusinessCalendarError).code).toBe(code)
}
