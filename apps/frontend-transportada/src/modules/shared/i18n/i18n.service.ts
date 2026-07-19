/* Copyright (c) 2026 Ada Technology. MIT License. */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import foundationLocale from '@/modules/foundation/locales/foundation.locale.json'
import foundationEnglishLocale from '@/modules/foundation/locales/foundation.en.locale.json'

void i18n.use(initReactI18next).init({
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
  lng: 'pt-BR',
  resources: {
    en: { translation: foundationEnglishLocale },
    'pt-BR': { translation: foundationLocale },
  },
})

export { i18n }
