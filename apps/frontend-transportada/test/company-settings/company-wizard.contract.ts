/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_SETTINGS_RESPONSE,
  EMPTY_COMPANY_SETTINGS_RESPONSE,
  loadFutureModule,
} from './company-settings.fixture'

type WizardModule = {
  readonly isCompanyWizardRequired: (response: unknown) => boolean
  readonly toWizardSettingsUpdate: (profile: unknown) => unknown
}

type DefaultsModule = {
  readonly createDefaultCompanySettings: () => unknown
}

type ProfileModule = {
  readonly mergeProfileLookup: (profile: unknown, lookup: unknown) => unknown
}

describe('company settings wizard contract', () => {
  test('requires the wizard only when the settings profile is missing', async () => {
    const { isCompanyWizardRequired } = await loadFutureModule<WizardModule>(
      '../../src/modules/company-settings/shared/companySettingsWizard.service',
    )

    expect(isCompanyWizardRequired(EMPTY_COMPANY_SETTINGS_RESPONSE)).toBeTrue()
    expect(isCompanyWizardRequired(COMPANY_SETTINGS_RESPONSE)).toBeFalse()
  })

  test('builds a full settings payload from the wizard profile alone', async () => {
    const [{ toWizardSettingsUpdate }, { createDefaultCompanySettings }] = await Promise.all([
      loadFutureModule<WizardModule>(
        '../../src/modules/company-settings/shared/companySettingsWizard.service',
      ),
      loadFutureModule<DefaultsModule>(
        '../../src/modules/company-settings/shared/companySettings.constant',
      ),
    ])
    const profile = COMPANY_SETTINGS_RESPONSE.data.profile

    const update = toWizardSettingsUpdate(profile) as Record<string, unknown>

    expect(update.profile).toBe(profile)
    expect(update).toMatchObject({
      billing: (createDefaultCompanySettings() as Record<string, unknown>).billing,
      expectedVersion: null,
    })
  })

  test('the default settings factory starts every profile field blank with regime 3', async () => {
    const { createDefaultCompanySettings } = await loadFutureModule<DefaultsModule>(
      '../../src/modules/company-settings/shared/companySettings.constant',
    )

    const defaults = createDefaultCompanySettings() as {
      profile: Record<string, string>
    }

    expect(defaults.profile.taxRegime).toBe('3')
    for (const [field, value] of Object.entries(defaults.profile)) {
      if (field === 'taxRegime') continue
      expect(value).toBe('')
    }
  })

  test('a CNPJ lookup fills only the fields the receita returned', async () => {
    const { mergeProfileLookup } = await loadFutureModule<ProfileModule>(
      '../../src/modules/company-settings/shared/companySettingsProfile.service',
    )
    const profile = { ...COMPANY_SETTINGS_RESPONSE.data.profile, legalName: 'Rascunho Anterior' }
    const lookup = { ...COMPANY_SETTINGS_RESPONSE.data.profile, legalName: '', tradeName: 'Nome Novo' }

    const merged = mergeProfileLookup(profile, lookup) as Record<string, string>

    expect(merged.legalName).toBe('Rascunho Anterior')
    expect(merged.tradeName).toBe('Nome Novo')
  })
})
