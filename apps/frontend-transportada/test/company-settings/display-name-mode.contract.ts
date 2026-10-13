/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  isSettingsResponse,
  withDisplayNameDefault,
} from '../../src/modules/company-settings/shared/companySettingsResponse.validation'
import type { CompanySettingsResponse } from '../../src/modules/company-settings/shared/companySettings.types'
import { COMPANY_SETTINGS_RESPONSE } from './company-settings.fixture'

function withProfile(profile: Record<string, unknown> | null): unknown {
  return { data: { ...COMPANY_SETTINGS_RESPONSE.data, profile } }
}

function profileWithout(key: string): Record<string, unknown> {
  const profile: Record<string, unknown> = { ...COMPANY_SETTINGS_RESPONSE.data.profile }
  delete profile[key]
  return profile
}

describe('company settings display name mode contract', () => {
  test.each([['trade_name'], ['legal_name']])('accepts the %s choice', (displayNameMode) => {
    const profile = { ...COMPANY_SETTINGS_RESPONSE.data.profile, displayNameMode }

    expect(isSettingsResponse(withProfile(profile))).toBeTrue()
  })

  test('still accepts the answer of an API that does not know the choice yet', () => {
    expect(isSettingsResponse(withProfile(profileWithout('displayNameMode')))).toBeTrue()
  })

  test('refuses a choice that is neither name', () => {
    const profile = { ...COMPANY_SETTINGS_RESPONSE.data.profile, displayNameMode: 'nickname' }

    expect(isSettingsResponse(withProfile(profile))).toBeFalse()
  })

  test('reads an answer without the choice as the trade name', () => {
    const response = withProfile(profileWithout('displayNameMode')) as CompanySettingsResponse

    expect(withDisplayNameDefault(response).data.profile?.displayNameMode).toBe('trade_name')
  })

  test('keeps the choice the API sent', () => {
    const response = withProfile({
      ...COMPANY_SETTINGS_RESPONSE.data.profile,
      displayNameMode: 'legal_name',
    }) as CompanySettingsResponse

    expect(withDisplayNameDefault(response).data.profile?.displayNameMode).toBe('legal_name')
  })
})
