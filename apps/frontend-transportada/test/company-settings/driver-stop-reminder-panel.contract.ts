/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  COMPANY_SETTINGS_TAB_IDS,
  resolveCompanySettingsDataScope,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'
import {
  DRIVER_STOP_REMINDER_MAX_RANGES_PER_WEEKDAY,
  DRIVER_STOP_REMINDER_NUMBER_FIELDS,
  DRIVER_STOP_REMINDER_RANGE,
  isDriverStopReminderResponse,
} from '../../src/modules/company-settings/shared/driverStopReminder.validation'
import { createDriverStopReminderClient } from '../../src/modules/company-settings/shared/driverStopReminderClient.service'
import {
  addOperatingRange,
  buildDriverStopReminderSubmission,
  findOperatingHoursIssues,
  startDriverStopReminderDraft,
  typeDriverStopReminderNumber,
} from '../../src/modules/company-settings/shared/driverStopReminderForm.service'

import en from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import pt from '../../src/modules/company-settings/locales/companySettings.locale.json'

/** Spec 299 RF19/T4.3 — a tela da cobrança do motorista, contra `GET/PUT /settings/driver-stop-reminders`. */
const API_CONSTANT =
  '../../../api-transportada/src/driver-stop-reminders/domain/driver-stop-reminder.constant.ts'

const STORED = {
  dwellMinutes: 30,
  enabled: false,
  graceMinMinutes: 30,
  gracePercent: 50,
  idleMinutes: 30,
  intervalMinutes: 30,
  maxAttempts: 3,
  operatingHours: [],
  origin: 'default',
  updatedAt: null,
} as const

const KEY_FIELDS: Record<string, string> = {
  dwellMinutes: 'DWELL_MINUTES',
  graceMinMinutes: 'GRACE_MIN_MINUTES',
  gracePercent: 'GRACE_PERCENT',
  idleMinutes: 'IDLE_MINUTES',
  intervalMinutes: 'INTERVAL_MINUTES',
  maxAttempts: 'MAX_ATTEMPTS',
}

describe('driver stop reminder panel (spec 299 RF19)', () => {
  test('the ranges are a copy by value of the API ones', () => {
    const source = readFileSync(new URL(API_CONSTANT, import.meta.url), 'utf8')
    for (const field of DRIVER_STOP_REMINDER_NUMBER_FIELDS) {
      const { max, min } = DRIVER_STOP_REMINDER_RANGE[field]
      expect(source).toContain(`${KEY_FIELDS[field]}: { max: ${max}, min: ${min} }`)
    }
    expect(source).toContain(
      `MAX_OPERATING_RANGES_PER_WEEKDAY: ${DRIVER_STOP_REMINDER_MAX_RANGES_PER_WEEKDAY}`,
    )
  })

  test('the tab exists and turns on only its own query', () => {
    expect(COMPANY_SETTINGS_TAB_IDS).toContain('driverReminders')
    expect(resolveCompanySettingsDataScope('driverReminders').driverStopReminderSettings).toBe(true)
    expect(resolveCompanySettingsDataScope('taxes').driverStopReminderSettings).toBe(false)
  })

  test('the response guard accepts the API shape and refuses a partial one', () => {
    expect(isDriverStopReminderResponse({ data: STORED })).toBe(true)
    expect(isDriverStopReminderResponse({ data: { ...STORED, maxAttempts: '3' } })).toBe(false)
    expect(isDriverStopReminderResponse({ data: { ...STORED, origin: 'x' } })).toBe(false)
  })

  test('the default draft round-trips into the body the API accepts', () => {
    const body = buildDriverStopReminderSubmission(startDriverStopReminderDraft(STORED))
    expect(body).toEqual({
      dwellMinutes: 30,
      enabled: false,
      graceMinMinutes: 30,
      gracePercent: 50,
      idleMinutes: 30,
      intervalMinutes: 30,
      maxAttempts: 3,
      operatingHours: [],
    })
  })

  test('typing keeps digits only and out-of-range values block the save', () => {
    expect(typeDriverStopReminderNumber('1a2,5')).toBe('125')
    const draft = startDriverStopReminderDraft(STORED)
    for (const [field, text] of [
      ['maxAttempts', '6'],
      ['maxAttempts', '0'],
      ['intervalMinutes', '9'],
      ['idleMinutes', '241'],
      ['gracePercent', ''],
    ] as const) {
      expect(
        buildDriverStopReminderSubmission({
          ...draft,
          numbers: { ...draft.numbers, [field]: text },
        }),
      ).toBeNull()
    }
    expect(
      buildDriverStopReminderSubmission({
        ...draft,
        numbers: { ...draft.numbers, gracePercent: '0' },
      }),
    ).not.toBeNull()
  })

  test('operating hours follow the API rules: order, overlap and three per day', () => {
    const range = (start: string, end: string, weekday = 1) => ({ end, start, weekday })
    expect(findOperatingHoursIssues([range('08:00', '12:00'), range('13:00', '18:00')]).size).toBe(
      0,
    )
    expect(findOperatingHoursIssues([range('12:00', '08:00')]).get(0)).toBe(
      'start_must_precede_end',
    )
    expect(
      findOperatingHoursIssues([range('08:00', '12:00'), range('11:00', '18:00')]).get(1),
    ).toBe('ranges_overlap')
    expect(
      findOperatingHoursIssues([range('08:00', '12:00'), range('11:00', '18:00', 2)]).size,
    ).toBe(0)
    let ranges = [] as ReturnType<typeof addOperatingRange>
    for (let index = 0; index < 5; index += 1) ranges = addOperatingRange(ranges, 3)
    expect(ranges).toHaveLength(DRIVER_STOP_REMINDER_MAX_RANGES_PER_WEEKDAY)
  })

  test('the client sends the body on PUT and surfaces the API error code', async () => {
    const requests: Request[] = []
    const sentBodies: string[] = []
    const client = createDriverStopReminderClient({
      apiBaseUrl: 'https://api.example',
      fetch: (request) =>
        request
          .clone()
          .text()
          .then((text) => {
            requests.push(request)
            sentBodies.push(text)
            return request.method === 'PUT'
              ? new Response(JSON.stringify({ error: { code: 'VALIDATION_FAILED' } }), {
                  status: 400,
                })
              : new Response(JSON.stringify({ data: STORED }), { status: 200 })
          }),
      getAccessToken: () => Promise.resolve('token'),
    })
    expect((await client.get()).origin).toBe('default')
    const body = buildDriverStopReminderSubmission(startDriverStopReminderDraft(STORED))
    if (body === null) throw new Error('body expected')
    const refusal = await client.save(body).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(Error)
    expect((refusal as Error).message).toBe('VALIDATION_FAILED')
    expect(new URL(requests[1]?.url ?? '').pathname).toBe('/settings/driver-stop-reminders')
    expect(JSON.parse(sentBodies[1] ?? 'null')).toEqual(body)
  })

  test('both locales carry the tab and every key of the panel', () => {
    for (const locale of [pt, en]) {
      expect(locale.tabs.driverReminders).toBeTruthy()
      for (const field of DRIVER_STOP_REMINDER_NUMBER_FIELDS) {
        expect(locale.driverStopReminders.fields[field].label).toBeTruthy()
      }
      for (let weekday = 0; weekday < 7; weekday += 1) {
        expect(
          (locale.driverStopReminders.weekday as Record<string, string>)[String(weekday)],
        ).toBeTruthy()
      }
    }
  })
})
