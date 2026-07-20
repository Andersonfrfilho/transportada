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

export * from './fiscal.schema.js'
export * from './identity.schema.js'

export const databaseSchema = {
  auditLogs,
  companies,
  companyFiscalProfiles,
  digitalCertificates,
  externalIdentities,
  fiscalSequenceReservations,
  fiscalSequences,
  identityUsers,
  idempotencyRecords,
  membershipRoles,
  userCompanyMemberships,
}
