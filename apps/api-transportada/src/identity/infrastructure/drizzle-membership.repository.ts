/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq } from 'drizzle-orm'

import { companies, membershipRoles, userCompanyMemberships } from '../../database/database.schema'
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

    return {
      membershipId: membership.membershipId,
      roles: memberships.flatMap(({ role }) => (role === null ? [] : [role])),
    }
  }
}
