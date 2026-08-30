/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/database.schema'

export type MembershipLookup = {
  readonly companyId: string
  readonly userId: string
}

export type ActiveCompanyMembership = {
  /**
   * As permissões que não vêm de papel: as dos grupos da empresa e as concedidas direto à pessoa.
   * Chegam cruas — quem descarta nome fora do catálogo é `resolveCompanyPermissions`.
   */
  readonly grantedPermissions: readonly string[]
  readonly membershipId: string
  readonly roles: readonly CompanyRole[]
}

export type MembershipRepositoryPort = {
  findActiveByUserAndCompany(input: MembershipLookup): Promise<ActiveCompanyMembership | null>
}
