/* Cópia por valor, reduzida, de apps/frontend-transportada/src/modules/shared/i18n/i18n.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ Reduzida: o painel registra um namespace por módulo (mais de vinte). Este app tem três —
 * `driverTrip` (o módulo da viagem), `conversation` (o chat) e `identity` (o painel do WhatsApp do Perfil) — e é só isso que
 * se registra aqui.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import conversationLocale from '@/modules/conversation/locales/conversation.locale.json'
import conversationEnglishLocale from '@/modules/conversation/locales/conversation.en.locale.json'
import driverTripLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
import driverTripEnglishLocale from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import identityLocale from '@/modules/identity/locales/identity.locale.json'
import identityEnglishLocale from '@/modules/identity/locales/identity.en.locale.json'

void i18n.use(initReactI18next).init({
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
  lng: 'pt-BR',
  resources: {
    en: {
      conversation: conversationEnglishLocale,
      driverTrip: driverTripEnglishLocale,
      identity: identityEnglishLocale,
    },
    'pt-BR': {
      conversation: conversationLocale,
      driverTrip: driverTripLocale,
      identity: identityLocale,
    },
  },
})

export { i18n }
