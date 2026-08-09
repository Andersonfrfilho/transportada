/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const ENVIRONMENT_PROVISIONING_LOCK_ID = 14_026
export const ENVIRONMENT_PROVISIONING_ADMIN_ROLE = 'company-admin'
export const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const

export const PROVISIONED_ARTIFACTS = [
  'company',
  'company-admin-role',
  'external-identity',
  'identity-user',
  'membership',
] as const
export type ProvisionedArtifact = (typeof PROVISIONED_ARTIFACTS)[number]
