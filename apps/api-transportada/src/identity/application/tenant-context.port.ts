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

/** `absent`: nenhuma membership na empresa. `suspended`: existe, mas ela ou a empresa está desativada. */
export type MembershipStanding = 'absent' | 'suspended'

export type MembershipRepositoryPort = {
  findActiveByUserAndCompany(input: MembershipLookup): Promise<ActiveCompanyMembership | null>
}
