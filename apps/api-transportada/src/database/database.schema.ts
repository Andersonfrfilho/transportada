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
import { processedMessages, processingOutbox } from './processing.schema.js'
import { storedObjects } from './storage.schema.js'

export * from './fiscal.schema.js'
export * from './freight.schema.js'
export * from './identity.schema.js'
export * from './nfe.schema.js'
export * from './processing.schema.js'
export * from './storage.schema.js'

export const databaseSchema = {
  auditLogs,
  companies,
  companyFiscalProfiles,
  digitalCertificates,
  externalIdentities,
  fiscalSequenceReservations,
  fiscalSequences,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  identityUsers,
  idempotencyRecords,
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
  processingOutbox,
  storedObjects,
  userCompanyMemberships,
}
