/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq } from 'drizzle-orm'

import type { CompanyRole } from '../../database/database.schema'
import {
  companies,
  companyGroupPermissions,
  companyGroupRoles,
  membershipGroups,
  membershipPermissions,
  membershipRoles,
  userCompanyMemberships,
} from '../../database/database.schema'
import type {
  ActiveCompanyMembership,
  MembershipLookup,
  MembershipRepositoryPort,
} from '../application/tenant-context.port'

type IdentityDatabase = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleMembershipRepository implements MembershipRepositoryPort {
  private readonly database: IdentityDatabase

  public constructor(database: IdentityDatabase) {
    this.database = database
  }

  public async findActiveByUserAndCompany({
    companyId,
    userId,
  }: MembershipLookup): Promise<ActiveCompanyMembership | null> {
    const memberships = await this.database
      .select({
        membershipId: userCompanyMemberships.id,
        role: membershipRoles.role,
      })
      .from(userCompanyMemberships)
      .innerJoin(companies, eq(companies.id, userCompanyMemberships.companyId))
      .leftJoin(membershipRoles, eq(membershipRoles.membershipId, userCompanyMemberships.id))
      .where(
        and(
          eq(userCompanyMemberships.userId, userId),
          eq(userCompanyMemberships.companyId, companyId),
          eq(userCompanyMemberships.status, 'active'),
          eq(companies.status, 'active'),
        ),
      )
      .orderBy(asc(membershipRoles.role))

    const membership = memberships[0]
    if (membership === undefined) {
      return null
    }

    const roles = memberships.flatMap(({ role }) => (role === null ? [] : [role]))
    const { groupPermissions, groupRoles } = await this.readGroupGrants(membership.membershipId)
    const directPermissions = await this.readDirectPermissions(membership.membershipId)

    return {
      grantedPermissions: [...groupPermissions, ...directPermissions],
      membershipId: membership.membershipId,
      roles: [...new Set([...roles, ...groupRoles])],
    }
  }

  /**
   * O grupo carrega papéis **e** permissões avulsas, e as duas coisas somam ao que a pessoa já tem.
   * Duas consultas em vez de um `join` de três tabelas: o resultado seria produto cartesiano entre
   * papel e permissão do grupo, e deduplicar em memória o que o banco pode devolver separado é
   * trabalho inventado.
   */
  private async readGroupGrants(membershipId: string): Promise<{
    readonly groupPermissions: readonly string[]
    readonly groupRoles: readonly CompanyRole[]
  }> {
    const [roles, permissions] = await Promise.all([
      this.database
        .select({ role: companyGroupRoles.role })
        .from(membershipGroups)
        .innerJoin(companyGroupRoles, eq(companyGroupRoles.groupId, membershipGroups.groupId))
        .where(eq(membershipGroups.membershipId, membershipId)),
      this.database
        .select({ permission: companyGroupPermissions.permission })
        .from(membershipGroups)
        .innerJoin(
          companyGroupPermissions,
          eq(companyGroupPermissions.groupId, membershipGroups.groupId),
        )
        .where(eq(membershipGroups.membershipId, membershipId)),
    ])

    return {
      groupPermissions: permissions.map((row) => row.permission),
      groupRoles: roles.map((row) => row.role as CompanyRole),
    }
  }

  private async readDirectPermissions(membershipId: string): Promise<readonly string[]> {
    const rows = await this.database
      .select({ permission: membershipPermissions.permission })
      .from(membershipPermissions)
      .where(eq(membershipPermissions.membershipId, membershipId))

    return rows.map((row) => row.permission)
  }
}
