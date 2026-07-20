/* Copyright (c) 2026 Ada Technology. MIT License. */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import companySettingsLocale from '@/modules/company-settings/locales/companySettings.locale.json'
import companySettingsEnglishLocale from '@/modules/company-settings/locales/companySettings.en.locale.json'
import foundationLocale from '@/modules/foundation/locales/foundation.locale.json'
import foundationEnglishLocale from '@/modules/foundation/locales/foundation.en.locale.json'

void i18n.use(initReactI18next).init({
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
  lng: 'pt-BR',
  resources: {
    en: { companySettings: companySettingsEnglishLocale, translation: foundationEnglishLocale },
    'pt-BR': { companySettings: companySettingsLocale, translation: foundationLocale },
  },
})

export { i18n }
