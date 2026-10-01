/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { formatMomentWithLocale } from '../../src/modules/shared/momentFormat.service'

const INSTANT = '2026-08-20T15:30:00.000Z'

describe('moment format contract', () => {
  test('formats a valid instant as short date and time in pt-BR', () => {
    const formatted = formatMomentWithLocale({ locale: 'pt-BR', value: INSTANT })

    expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/)
  })

  test('respects the locale instead of hardcoding pt-BR', () => {
    const brazilian = formatMomentWithLocale({ locale: 'pt-BR', value: INSTANT })
    const american = formatMomentWithLocale({ locale: 'en-US', value: INSTANT })

    expect(american).not.toBe(brazilian)
  })

  test('gives back the raw text when the value is not a date', () => {
    const formatted = formatMomentWithLocale({ locale: 'pt-BR', value: 'sem data' })

    expect(formatted).toBe('sem data')
    expect(formatted).not.toContain('Invalid Date')
  })
})
