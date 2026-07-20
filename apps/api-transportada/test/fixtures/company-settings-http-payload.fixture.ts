/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { COMPANY_SETTINGS, EXPECTED_SETTINGS_RESULT } from './company-settings-application.fixture'

export const VALID_IDEMPOTENCY_KEY = 'settings-http-0001'

export const VALID_HTTP_SETTINGS_BODY = {
  cte: {
    environment: COMPANY_SETTINGS.cte.environment,
    nextNumber: COMPANY_SETTINGS.cte.nextNumber.toString(),
    series: COMPANY_SETTINGS.cte.series.toString(),
  },
  expectedVersion: null,
  profile: { ...COMPANY_SETTINGS.profile },
} as const

export const EXPECTED_HTTP_SETTINGS_DATA = {
  activeCertificate: null,
  cte: {
    environment: EXPECTED_SETTINGS_RESULT.cte.environment,
    nextNumber: EXPECTED_SETTINGS_RESULT.cte.nextNumber.toString(),
    series: EXPECTED_SETTINGS_RESULT.cte.series.toString(),
    version: EXPECTED_SETTINGS_RESULT.cte.version.toString(),
  },
  profile: {
    ...EXPECTED_SETTINGS_RESULT.profile,
    version: EXPECTED_SETTINGS_RESULT.profile.version.toString(),
  },
} as const

type SettingsBodyWithParams = {
  readonly path: string
  readonly value: unknown
}

export function settingsBodyWith({ path, value }: SettingsBodyWithParams): unknown {
  const body: Record<string, unknown> = structuredClone(VALID_HTTP_SETTINGS_BODY)
  const segments = path.split('.')
  let target = body
  for (const segment of segments.slice(0, -1)) {
    const nested = target[segment]
    if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) {
      throw new Error('Expected a nested settings fixture')
    }
    target = nested as Record<string, unknown>
  }
  const finalSegment = segments.at(-1)
  if (finalSegment === undefined) throw new Error('Expected a settings fixture path')
  target[finalSegment] = value
  return body
}
