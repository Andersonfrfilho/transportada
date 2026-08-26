/* Copyright (c) 2026 Ada Technology. MIT License. */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import billingWorkspaceLocale from '@/modules/billing/locales/billingWorkspace.locale.json'
import billingWorkspaceEnglishLocale from '@/modules/billing/locales/billingWorkspace.en.locale.json'
import companySettingsLocale from '@/modules/company-settings/locales/companySettings.locale.json'
import companySettingsEnglishLocale from '@/modules/company-settings/locales/companySettings.en.locale.json'
import cteBatchLocale from '@/modules/cte-batch/locales/cteBatch.locale.json'
import cteBatchEnglishLocale from '@/modules/cte-batch/locales/cteBatch.en.locale.json'
import cteIssuanceLocale from '@/modules/cte-issuance/locales/cteIssuance.locale.json'
import cteIssuanceEnglishLocale from '@/modules/cte-issuance/locales/cteIssuance.en.locale.json'
import cteProfilesLocale from '@/modules/cte-profiles/locales/cteProfiles.locale.json'
import cteProfilesEnglishLocale from '@/modules/cte-profiles/locales/cteProfiles.en.locale.json'
import documentIntakeLocale from '@/modules/document-intake/locales/documentIntake.locale.json'
import documentIntakeEnglishLocale from '@/modules/document-intake/locales/documentIntake.en.locale.json'
import driverTripLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
import driverTripEnglishLocale from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import fleetLocale from '@/modules/fleet/locales/fleet.locale.json'
import fleetEnglishLocale from '@/modules/fleet/locales/fleet.en.locale.json'
import foundationLocale from '@/modules/foundation/locales/foundation.locale.json'
import foundationEnglishLocale from '@/modules/foundation/locales/foundation.en.locale.json'
import identityLocale from '@/modules/identity/locales/identity.locale.json'
import identityEnglishLocale from '@/modules/identity/locales/identity.en.locale.json'
import mdfeManifestLocale from '@/modules/mdfe-manifest/locales/mdfeManifest.locale.json'
import mdfeManifestEnglishLocale from '@/modules/mdfe-manifest/locales/mdfeManifest.en.locale.json'
import nfeWorkspaceLocale from '@/modules/nfe-workspace/locales/nfeWorkspace.locale.json'
import nfeWorkspaceEnglishLocale from '@/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'
import nfseInvoiceLocale from '@/modules/nfse-invoice/locales/nfseInvoice.locale.json'
import nfseInvoiceEnglishLocale from '@/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'
import notificationLocale from '@/modules/notification/locales/notification.locale.json'
import notificationEnglishLocale from '@/modules/notification/locales/notification.en.locale.json'
import operationsWorkspaceLocale from '@/modules/operations/locales/operationsWorkspace.locale.json'
import operationsWorkspaceEnglishLocale from '@/modules/operations/locales/operationsWorkspace.en.locale.json'
import routingLocale from '@/modules/routing/locales/routing.locale.json'
import routingEnglishLocale from '@/modules/routing/locales/routing.en.locale.json'
import tripLocale from '@/modules/trip/locales/trip.locale.json'
import tripEnglishLocale from '@/modules/trip/locales/trip.en.locale.json'

void i18n.use(initReactI18next).init({
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
  lng: 'pt-BR',
  resources: {
    en: {
      billingWorkspace: billingWorkspaceEnglishLocale,
      companySettings: companySettingsEnglishLocale,
      cteBatch: cteBatchEnglishLocale,
      cteIssuance: cteIssuanceEnglishLocale,
      cteProfiles: cteProfilesEnglishLocale,
      documentIntake: documentIntakeEnglishLocale,
      driverTrip: driverTripEnglishLocale,
      fleet: fleetEnglishLocale,
      identity: identityEnglishLocale,
      mdfeManifest: mdfeManifestEnglishLocale,
      nfeWorkspace: nfeWorkspaceEnglishLocale,
      nfseInvoice: nfseInvoiceEnglishLocale,
      notification: notificationEnglishLocale,
      operationsWorkspace: operationsWorkspaceEnglishLocale,
      routing: routingEnglishLocale,
      translation: foundationEnglishLocale,
      trip: tripEnglishLocale,
    },
    'pt-BR': {
      billingWorkspace: billingWorkspaceLocale,
      companySettings: companySettingsLocale,
      cteBatch: cteBatchLocale,
      cteIssuance: cteIssuanceLocale,
      cteProfiles: cteProfilesLocale,
      documentIntake: documentIntakeLocale,
      driverTrip: driverTripLocale,
      fleet: fleetLocale,
      identity: identityLocale,
      mdfeManifest: mdfeManifestLocale,
      nfeWorkspace: nfeWorkspaceLocale,
      nfseInvoice: nfseInvoiceLocale,
      notification: notificationLocale,
      operationsWorkspace: operationsWorkspaceLocale,
      routing: routingLocale,
      translation: foundationLocale,
      trip: tripLocale,
    },
  },
})

export { i18n }
