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
import { fleetDriverVehicleAssignments, fleetDrivers, fleetVehicles } from './fleet.schema.js'
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
import { viewPreferences } from './view-preferences.schema.js'
import { companyDistributionSettings } from './company-distribution-settings.schema.js'
import {
  cteEmissionProfileComponents,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
} from './cte-emission-profile.schema.js'

export * from './fiscal.schema.js'
export * from './fleet.schema.js'
export * from './freight.schema.js'
export * from './mdfe.schema.js'
export * from './identity.schema.js'
export * from './nfe.schema.js'
export * from './processing.schema.js'
export * from './storage.schema.js'
export * from './cte-batch.schema.js'
export * from './cte-issuance.schema.js'
export * from './billing.schema.js'
export * from './view-preferences.schema.js'
export * from './company-distribution-settings.schema.js'
export * from './cte-emission-profile.schema.js'

export const databaseSchema = {
  auditLogs,
  companies,
  companyDistributionSettings,
  companyFiscalProfiles,
  digitalCertificates,
  externalIdentities,
  fiscalSequenceReservations,
  fiscalSequences,
  fleetDriverVehicleAssignments,
  fleetDrivers,
  fleetVehicles,
  freightCalculations,
  freightRules,
  freightRuleVersions,
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
  billingInvoiceDocuments,
  billingInvoiceEvents,
  billingInvoiceItems,
  billingInvoices,
  storedObjects,
  userCompanyMemberships,
  viewPreferences,
}
