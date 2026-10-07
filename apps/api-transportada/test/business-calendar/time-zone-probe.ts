/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Roda em subprocesso com `TZ` próprio (spec 238 T1.1): trocar `process.env.TZ` no meio de um
 * processo não é garantia de que todo `Date` releia o fuso, então cada fuso ganha um processo.
 */
import { addBusinessDays } from '../../src/business-calendar/domain/business-calendar.policy.js'
import { buildTestCalendar, yearOf } from '../fixtures/business-calendar.fixture.js'

const PROBED_CASES = [
  { city: 'campinas', days: 3, start: '2026-10-09' },
  { city: 'saoPaulo', days: 3, start: '2026-12-24' },
  { city: 'saoPaulo', days: 2, start: '2027-12-30' },
] as const

const results = PROBED_CASES.map(({ city, days, start }) => {
  const calendar = buildTestCalendar({ city, fromYear: yearOf(start) })
  return addBusinessDays({ calendar, days, start }).date
})

process.stdout.write(
  JSON.stringify({ results, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
)
