/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/database.schema'

export type MembershipLookup = {
  readonly companyId: string
  readonly userId: string
}

export type ActiveCompanyMembership = {
  readonly membershipId: string
  readonly roles: readonly CompanyRole[]
}

export type MembershipRepositoryPort = {
  findActiveByUserAndCompany(input: MembershipLookup): Promise<ActiveCompanyMembership | null>
}
