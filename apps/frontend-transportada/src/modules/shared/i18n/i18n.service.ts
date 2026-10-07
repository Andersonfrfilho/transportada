/* Copyright (c) 2026 Ada Technology. MIT License. */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import billingWorkspaceLocale from '@/modules/billing/locales/billingWorkspace.locale.json'
import billingWorkspaceEnglishLocale from '@/modules/billing/locales/billingWorkspace.en.locale.json'
import cargoOccurrenceLocale from '@/modules/cargo-receiving/locales/cargoOccurrence.locale.json'
import cargoReceivingLocale from '@/modules/cargo-receiving/locales/cargoReceiving.locale.json'
import cargoOccurrenceEnglishLocale from '@/modules/cargo-receiving/locales/cargoOccurrence.en.locale.json'
import cargoReceivingEnglishLocale from '@/modules/cargo-receiving/locales/cargoReceiving.en.locale.json'
import companySettingsLocale from '@/modules/company-settings/locales/companySettings.locale.json'
import companySettingsEnglishLocale from '@/modules/company-settings/locales/companySettings.en.locale.json'
import cteBatchLocale from '@/modules/cte-batch/locales/cteBatch.locale.json'
import cteBatchEnglishLocale from '@/modules/cte-batch/locales/cteBatch.en.locale.json'
import cteIssuanceLocale from '@/modules/cte-issuance/locales/cteIssuance.locale.json'
import cteIssuanceEnglishLocale from '@/modules/cte-issuance/locales/cteIssuance.en.locale.json'
import cteProfilesLocale from '@/modules/cte-profiles/locales/cteProfiles.locale.json'
import cteProfilesEnglishLocale from '@/modules/cte-profiles/locales/cteProfiles.en.locale.json'
import contractorDirectoryLocale from '@/modules/delivery-clients/locales/contractorDirectory.locale.json'
import contractorDirectoryEnglishLocale from '@/modules/delivery-clients/locales/contractorDirectory.en.locale.json'
import previewEmailLocale from '@/modules/delivery-clients/locales/previewEmail.locale.json'
import previewEmailEnglishLocale from '@/modules/delivery-clients/locales/previewEmail.en.locale.json'
import deliveryClientsLocale from '@/modules/delivery-clients/locales/deliveryClients.locale.json'
import deliveryClientsEnglishLocale from '@/modules/delivery-clients/locales/deliveryClients.en.locale.json'
import documentIntakeLocale from '@/modules/document-intake/locales/documentIntake.locale.json'
import documentIntakeEnglishLocale from '@/modules/document-intake/locales/documentIntake.en.locale.json'
import driverTripLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
import driverTripEnglishLocale from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import extraChargesLocale from '@/modules/extra-charges/locales/extraCharges.locale.json'
import extraChargesEnglishLocale from '@/modules/extra-charges/locales/extraCharges.en.locale.json'
import spreadsheetLocale from '@/modules/shared/spreadsheet/locales/spreadsheet.locale.json'
import spreadsheetEnglishLocale from '@/modules/shared/spreadsheet/locales/spreadsheet.en.locale.json'
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
import occurrenceConversationLocale from '@/modules/occurrence-conversation/locales/occurrenceConversation.locale.json'
import occurrenceConversationEnglishLocale from '@/modules/occurrence-conversation/locales/occurrenceConversation.en.locale.json'
import operationsWorkspaceLocale from '@/modules/operations/locales/operationsWorkspace.locale.json'
import operationsWorkspaceEnglishLocale from '@/modules/operations/locales/operationsWorkspace.en.locale.json'
import pendingItemsLocale from '@/modules/pending-items/locales/pendingItems.locale.json'
import pendingItemsEnglishLocale from '@/modules/pending-items/locales/pendingItems.en.locale.json'
import routingLocale from '@/modules/routing/locales/routing.locale.json'
import routingEnglishLocale from '@/modules/routing/locales/routing.en.locale.json'
import tripFinancialsLocale from '@/modules/trip-financials/locales/tripFinancials.locale.json'
import tripFinancialsEnglishLocale from '@/modules/trip-financials/locales/tripFinancials.en.locale.json'
import tripLocale from '@/modules/trip/locales/trip.locale.json'
import tripEnglishLocale from '@/modules/trip/locales/trip.en.locale.json'

void i18n.use(initReactI18next).init({
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
  lng: 'pt-BR',
  resources: {
    en: {
      billingWorkspace: billingWorkspaceEnglishLocale,
      // A avaria da chegada tem arquivo próprio; o namespace é o mesmo e as chaves de topo não se cruzam.
      cargoReceiving: { ...cargoReceivingEnglishLocale, ...cargoOccurrenceEnglishLocale },
      companySettings: companySettingsEnglishLocale,
      cteBatch: cteBatchEnglishLocale,
      cteIssuance: cteIssuanceEnglishLocale,
      cteProfiles: cteProfilesEnglishLocale,
      contractorDirectory: contractorDirectoryEnglishLocale,
      deliveryClients: deliveryClientsEnglishLocale,
      documentIntake: documentIntakeEnglishLocale,
      driverTrip: driverTripEnglishLocale,
      extraCharges: extraChargesEnglishLocale,
      fleet: fleetEnglishLocale,
      identity: identityEnglishLocale,
      mdfeManifest: mdfeManifestEnglishLocale,
      nfeWorkspace: nfeWorkspaceEnglishLocale,
      nfseInvoice: nfseInvoiceEnglishLocale,
      notification: notificationEnglishLocale,
      occurrenceConversation: occurrenceConversationEnglishLocale,
      operationsWorkspace: operationsWorkspaceEnglishLocale,
      pendingItems: pendingItemsEnglishLocale,
      previewEmail: previewEmailEnglishLocale,
      routing: routingEnglishLocale,
      spreadsheet: spreadsheetEnglishLocale,
      translation: foundationEnglishLocale,
      trip: tripEnglishLocale,
      tripFinancials: tripFinancialsEnglishLocale,
    },
    'pt-BR': {
      billingWorkspace: billingWorkspaceLocale,
      cargoReceiving: { ...cargoReceivingLocale, ...cargoOccurrenceLocale },
      companySettings: companySettingsLocale,
      cteBatch: cteBatchLocale,
      cteIssuance: cteIssuanceLocale,
      cteProfiles: cteProfilesLocale,
      contractorDirectory: contractorDirectoryLocale,
      deliveryClients: deliveryClientsLocale,
      documentIntake: documentIntakeLocale,
      driverTrip: driverTripLocale,
      extraCharges: extraChargesLocale,
      fleet: fleetLocale,
      identity: identityLocale,
      mdfeManifest: mdfeManifestLocale,
      nfeWorkspace: nfeWorkspaceLocale,
      nfseInvoice: nfseInvoiceLocale,
      notification: notificationLocale,
      occurrenceConversation: occurrenceConversationLocale,
      operationsWorkspace: operationsWorkspaceLocale,
      pendingItems: pendingItemsLocale,
      previewEmail: previewEmailLocale,
      routing: routingLocale,
      spreadsheet: spreadsheetLocale,
      translation: foundationLocale,
      trip: tripLocale,
      tripFinancials: tripFinancialsLocale,
    },
  },
})

export { i18n }
