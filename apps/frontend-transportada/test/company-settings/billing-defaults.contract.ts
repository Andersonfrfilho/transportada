/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_DEFAULTS,
  COMPANY_SETTINGS_RESPONSE,
  EMPTY_COMPANY_SETTINGS_RESPONSE,
  loadFutureModule,
} from './company-settings.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const BILLING_LABEL_KEYS = [
  'billingLegend',
  'billingHint',
  'billingBankName',
  'billingBankCode',
  'billingBankBranch',
  'billingBankAccount',
  'billingPixKey',
  'billingObservations',
] as const

type ValidationModule = {
  readonly isSettingsResponse: (value: unknown) => boolean
}

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readModule(filePath)) as Record<string, unknown>
}

describe('company settings billing defaults contract', () => {
  test('accepts the billing block the invoice PDF depends on and its unconfigured state', async () => {
    const { isSettingsResponse } = await loadFutureModule<ValidationModule>(
      '../../src/modules/company-settings/shared/companySettingsResponse.validation',
    )

    expect(isSettingsResponse(COMPANY_SETTINGS_RESPONSE)).toBeTrue()
    expect(isSettingsResponse(EMPTY_COMPANY_SETTINGS_RESPONSE)).toBeTrue()
  })

  test.each([
    [
      'a response that dropped the billing block',
      { data: { ...COMPANY_SETTINGS_RESPONSE.data, billing: undefined } },
    ],
    [
      'a billing block with an unknown property',
      {
        data: {
          ...COMPANY_SETTINGS_RESPONSE.data,
          billing: { ...BILLING_DEFAULTS, bankSwift: 'value' },
        },
      },
    ],
    [
      'a billing block whose observations are not text',
      {
        data: {
          ...COMPANY_SETTINGS_RESPONSE.data,
          billing: { ...BILLING_DEFAULTS, observations: 42 },
        },
      },
    ],
  ])('rejects %s', async (_name, response) => {
    const { isSettingsResponse } = await loadFutureModule<ValidationModule>(
      '../../src/modules/company-settings/shared/companySettingsResponse.validation',
    )

    expect(isSettingsResponse(response)).toBeFalse()
  })

  // Um bloco que a tela não envia volta vazio do banco e o PDF fecha sem dizer onde pagar.
  test('wires the billing fieldset into the settings form and the request payload', async () => {
    const [fields, settingsForm, client, page] = await Promise.all([
      readModule('src/modules/company-settings/components/BillingDefaultsFields.component.tsx'),
      readModule('src/modules/company-settings/components/CompanySettingsForm.component.tsx'),
      readModule('src/modules/company-settings/shared/companySettingsClient.service.ts'),
      readModule('src/modules/company-settings/pages/CompanySettings.page.tsx'),
    ])

    for (const key of BILLING_LABEL_KEYS) expect(fields).toContain(`'${key}'`)
    expect(fields).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(settingsForm).toContain('<BillingDefaultsFields')
    expect(settingsForm).toContain('createDefaultCompanySettings')
    for (const field of Object.keys(BILLING_DEFAULTS)) {
      expect(client).toContain(`input.billing.${field}`)
    }
    expect(page).toContain('settings.billing ?? EMPTY_BILLING_DEFAULTS')
  })

  test('translates every billing label in both catalogs', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/company-settings/locales/companySettings.locale.json'),
      readLocale('src/modules/company-settings/locales/companySettings.en.locale.json'),
    ])

    for (const key of BILLING_LABEL_KEYS) {
      expect(portuguese[key]).toBeString()
      expect(english[key]).toBeString()
    }
  })
})
