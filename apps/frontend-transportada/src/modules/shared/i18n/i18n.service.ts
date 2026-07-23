/* Copyright (c) 2026 Ada Technology. MIT License. */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import billingWorkspaceLocale from '@/modules/billing/locales/billingWorkspace.locale.json'
import billingWorkspaceEnglishLocale from '@/modules/billing/locales/billingWorkspace.en.locale.json'
import companySettingsLocale from '@/modules/company-settings/locales/companySettings.locale.json'
import companySettingsEnglishLocale from '@/modules/company-settings/locales/companySettings.en.locale.json'
import foundationLocale from '@/modules/foundation/locales/foundation.locale.json'
import foundationEnglishLocale from '@/modules/foundation/locales/foundation.en.locale.json'
import nfeWorkspaceLocale from '@/modules/nfe-workspace/locales/nfeWorkspace.locale.json'
import nfeWorkspaceEnglishLocale from '@/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'
import operationsWorkspaceLocale from '@/modules/operations/locales/operationsWorkspace.locale.json'
import operationsWorkspaceEnglishLocale from '@/modules/operations/locales/operationsWorkspace.en.locale.json'

void i18n.use(initReactI18next).init({
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
  lng: 'pt-BR',
  resources: {
    en: {
      billingWorkspace: billingWorkspaceEnglishLocale,
      companySettings: companySettingsEnglishLocale,
      nfeWorkspace: nfeWorkspaceEnglishLocale,
      operationsWorkspace: operationsWorkspaceEnglishLocale,
      translation: foundationEnglishLocale,
    },
    'pt-BR': {
      billingWorkspace: billingWorkspaceLocale,
      companySettings: companySettingsLocale,
      nfeWorkspace: nfeWorkspaceLocale,
      operationsWorkspace: operationsWorkspaceLocale,
      translation: foundationLocale,
    },
  },
})

export { i18n }
