/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_SETTINGS_RESPONSE,
  EMPTY_COMPANY_SETTINGS_RESPONSE,
  loadFutureModule,
} from './company-settings.fixture'

type ValidationModule = {
  readonly isSettingsResponse: (value: unknown) => boolean
}

function loadValidation(): Promise<ValidationModule> {
  return loadFutureModule<ValidationModule>(
    '../../src/modules/company-settings/shared/companySettingsResponse.validation',
  )
}

describe('company settings activation channel contract', () => {
  // O guard é de chaves exatas: bloco novo na API derruba a tela inteira, não só o bloco.
  test('accepts the activation block the API serializes and its unconfigured state', async () => {
    const { isSettingsResponse } = await loadValidation()

    expect(COMPANY_SETTINGS_RESPONSE.data).toHaveProperty('activation')
    expect(EMPTY_COMPANY_SETTINGS_RESPONSE.data).toHaveProperty('activation')
    expect(isSettingsResponse(COMPANY_SETTINGS_RESPONSE)).toBeTrue()
    expect(isSettingsResponse(EMPTY_COMPANY_SETTINGS_RESPONSE)).toBeTrue()
  })

  test.each([['email'], ['sms'], ['whatsapp']])('accepts the %s channel', async (channel) => {
    const { isSettingsResponse } = await loadValidation()

    expect(
      isSettingsResponse({
        data: { ...COMPANY_SETTINGS_RESPONSE.data, activation: { channel } },
      }),
    ).toBeTrue()
  })

  test.each([
    [
      'a response that dropped the activation block',
      {
        data: Object.fromEntries(
          Object.entries(COMPANY_SETTINGS_RESPONSE.data).filter(([key]) => key !== 'activation'),
        ),
      },
    ],
    [
      'an activation block with an unknown channel',
      { data: { ...COMPANY_SETTINGS_RESPONSE.data, activation: { channel: 'telegram' } } },
    ],
    [
      'an activation block with an unknown property',
      {
        data: {
          ...COMPANY_SETTINGS_RESPONSE.data,
          activation: { channel: 'email', provider: 'value' },
        },
      },
    ],
  ])('rejects %s', async (_name, response) => {
    const { isSettingsResponse } = await loadValidation()

    expect(isSettingsResponse(response)).toBeFalse()
  })
})
