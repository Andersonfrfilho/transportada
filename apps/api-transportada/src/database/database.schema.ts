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

export * from './identity.schema.js'

export const databaseSchema = {
  companies,
  externalIdentities,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
}
