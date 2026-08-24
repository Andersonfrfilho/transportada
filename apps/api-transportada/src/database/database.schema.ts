/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  companies,
  externalIdentities,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from './identity.schema.js'
import {
  auditLogs,
  companyFiscalProfiles,
  digitalCertificates,
  fiscalSequenceReservations,
  fiscalSequences,
  idempotencyRecords,
} from './fiscal.schema.js'
import {
  fleetDriverRegions,
  freightRegionCities,
  freightRegionDriverRates,
  freightRegions,
} from './freight-region.schema.js'
import { freightCalculations, freightRules, freightRuleVersions } from './freight.schema.js'
import {
  nfeAddresses,
  nfeDistributionCursors,
  nfeDocuments,
  nfeEvents,
  nfeImportItems,
  nfeImports,
  nfeParticipants,
  nfeProducts,
  nfeVolumes,
} from './nfe.schema.js'
import { passwordResetDeliveryOutbox, passwordResetRequests } from './password-reset.schema.js'
import { jobExecutions, jobSchedules } from './job-schedule.schema.js'
import { processedMessages, processingJobs, processingOutbox } from './processing.schema.js'
import { storedObjects } from './storage.schema.js'
import {
  cteBatches,
  cteBatchEvents,
  cteBatchItemCharges,
  cteBatchItemDocuments,
  cteBatchItems,
  cteSubmissionRecords,
} from './cte-batch.schema.js'
import {
  cteFiscalDocuments,
  cteIssuanceAttempts,
  cteIssuanceEvents,
  cteIssuanceOutbox,
  cteRetrySchedules,
} from './cte-issuance.schema.js'
import {
  billingInvoiceDocuments,
  billingInvoiceEvents,
  billingInvoiceItems,
  billingInvoices,
} from './billing.schema.js'
import { billingDescriptionTemplates } from './billing-description-template.schema.js'
import { fleetDriverVehicleAssignments, fleetDrivers, fleetVehicles } from './fleet.schema.js'
import { fuelPriceReferences } from './fuel-reference.schema.js'
import { companyFuelPrices } from './company-fuel-prices.schema.js'
import { energyTariffReferences } from './energy-tariff.schema.js'
import { companyEnergySettings } from './company-energy-settings.schema.js'
import {
  mdfeFiscalDocuments,
  mdfeIssuanceAttempts,
  mdfeIssuanceEvents,
  mdfeIssuanceOutbox,
  mdfeIssuancePayloads,
  mdfeManifestDrivers,
  mdfeManifestItems,
  mdfeManifestLoadingCities,
  mdfeManifests,
  mdfeProcessedMessages,
} from './mdfe.schema.js'
import {
  nfseEmissionProfiles,
  nfseFiscalDocuments,
  nfseIssuanceAttempts,
  nfseIssuanceEvents,
  nfseIssuanceOutbox,
  nfseIssuancePayloads,
  nfseProcessedMessages,
  nfseProviderCredentials,
  nfseServiceInvoiceCharges,
  nfseServiceInvoiceDocuments,
  nfseServiceInvoices,
} from './nfse.schema.js'
import { viewPreferences } from './view-preferences.schema.js'
import { companyDistributionSettings } from './company-distribution-settings.schema.js'
import { companyLogos } from './company-logo.schema.js'
import {
  cteEmissionProfileComponents,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
} from './cte-emission-profile.schema.js'
import { userInvitationRoles, userInvitations } from './user-invitation.schema.js'
import { identityUserProfiles } from './identity-user-profile.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from './trip.schema.js'

export * from './company-energy-settings.schema.js'
export * from './company-fuel-prices.schema.js'
export * from './energy-tariff.schema.js'
export * from './fiscal.schema.js'
export * from './fleet.schema.js'
export * from './fuel-reference.schema.js'
export * from './freight-region.schema.js'
export * from './freight.schema.js'
export * from './mdfe.schema.js'
export * from './nfse.schema.js'
export * from './identity.schema.js'
export * from './nfe.schema.js'
export * from './job-schedule.schema.js'
export * from './processing.schema.js'
export * from './storage.schema.js'
export * from './cte-batch.schema.js'
export * from './cte-issuance.schema.js'
export * from './billing.schema.js'
export * from './billing-description-template.schema.js'
export * from './view-preferences.schema.js'
export * from './company-distribution-settings.schema.js'
export * from './company-logo.schema.js'
export * from './cte-emission-profile.schema.js'
export * from './password-reset.schema.js'
export * from './user-invitation.schema.js'
export * from './identity-user-profile.schema.js'
export * from './trip.schema.js'

export const databaseSchema = {
  auditLogs,
  companies,
  companyDistributionSettings,
  companyEnergySettings,
  companyFiscalProfiles,
  companyFuelPrices,
  companyLogos,
  digitalCertificates,
  energyTariffReferences,
  externalIdentities,
  fiscalSequenceReservations,
  fiscalSequences,
  fleetDriverRegions,
  fleetDriverVehicleAssignments,
  fleetDrivers,
  fleetVehicles,
  freightCalculations,
  freightRegionCities,
  freightRegionDriverRates,
  freightRegions,
  freightRules,
  freightRuleVersions,
  fuelPriceReferences,
  identityUserProfiles,
  identityUsers,
  idempotencyRecords,
  mdfeFiscalDocuments,
  mdfeIssuanceAttempts,
  mdfeIssuanceEvents,
  mdfeIssuanceOutbox,
  mdfeIssuancePayloads,
  mdfeManifestDrivers,
  mdfeManifestItems,
  mdfeManifestLoadingCities,
  mdfeManifests,
  mdfeProcessedMessages,
  membershipRoles,
  nfeAddresses,
  nfeDistributionCursors,
  nfeDocuments,
  nfeEvents,
  nfeImportItems,
  nfeImports,
  nfeParticipants,
  nfeProducts,
  nfeVolumes,
  nfseEmissionProfiles,
  nfseFiscalDocuments,
  nfseIssuanceAttempts,
  nfseIssuanceEvents,
  nfseIssuanceOutbox,
  nfseIssuancePayloads,
  nfseProcessedMessages,
  nfseProviderCredentials,
  nfseServiceInvoiceCharges,
  nfseServiceInvoiceDocuments,
  nfseServiceInvoices,
  passwordResetDeliveryOutbox,
  passwordResetRequests,
  jobExecutions,
  jobSchedules,
  processedMessages,
  processingJobs,
  processingOutbox,
  cteBatches,
  cteBatchEvents,
  cteBatchItemCharges,
  cteBatchItemDocuments,
  cteBatchItems,
  cteEmissionProfileComponents,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  cteIssuanceEvents,
  cteIssuanceOutbox,
  cteRetrySchedules,
  cteSubmissionRecords,
  billingDescriptionTemplates,
  billingInvoiceDocuments,
  billingInvoiceEvents,
  billingInvoiceItems,
  billingInvoices,
  storedObjects,
  tripDocuments,
  tripDrivers,
  tripStops,
  trips,
  userCompanyMemberships,
  userInvitationRoles,
  userInvitations,
  viewPreferences,
}
