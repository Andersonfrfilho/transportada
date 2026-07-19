/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, or } from 'drizzle-orm'

import {
  LOCAL_COMPANY_ID,
  LOCAL_EXTERNAL_IDENTITY_ID,
  LOCAL_IDENTITY_ROLES,
  LOCAL_IDENTITY_USER_ID,
  LOCAL_KEYCLOAK_ISSUER,
  LOCAL_KEYCLOAK_SUBJECT,
  LOCAL_MEMBERSHIP_ID,
} from './local-identity-seed.constant'
import { LocalIdentitySeedConflictError } from './local-identity-seed.error'
import {
  companies,
  externalIdentities,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from './database.schema'

type IdentityDatabase = ReturnType<typeof createDrizzleProvider>['db']
type IdentityTransaction = Parameters<Parameters<IdentityDatabase['transaction']>[0]>[0]

export class LocalIdentitySeedRepository {
  private readonly transaction: IdentityTransaction

  public constructor(transaction: IdentityTransaction) {
    this.transaction = transaction
  }

  public async ensureExpectedState(): Promise<void> {
    await this.ensureCompany()
    await this.ensureIdentityUser()
    await this.ensureExternalIdentity()
    await this.ensureMembership()
    await this.ensureMembershipRoles()
  }

  private async ensureCompany(): Promise<void> {
    const [company] = await this.transaction
      .select({ id: companies.id, status: companies.status })
      .from(companies)
      .where(eq(companies.id, LOCAL_COMPANY_ID))
      .limit(1)

    if (company === undefined) {
      await this.transaction.insert(companies).values({ id: LOCAL_COMPANY_ID, status: 'active' })
      return
    }
    if (company.status !== 'active') {
      throw new LocalIdentitySeedConflictError('company')
    }
  }

  private async ensureIdentityUser(): Promise<void> {
    const [user] = await this.transaction
      .select({ id: identityUsers.id, status: identityUsers.status })
      .from(identityUsers)
      .where(eq(identityUsers.id, LOCAL_IDENTITY_USER_ID))
      .limit(1)

    if (user === undefined) {
      await this.transaction
        .insert(identityUsers)
        .values({ id: LOCAL_IDENTITY_USER_ID, status: 'active' })
      return
    }
    if (user.status !== 'active') {
      throw new LocalIdentitySeedConflictError('identity user')
    }
  }

  private async ensureExternalIdentity(): Promise<void> {
    const identities = await this.transaction
      .select({
        id: externalIdentities.id,
        issuer: externalIdentities.issuer,
        subject: externalIdentities.subject,
        userId: externalIdentities.userId,
      })
      .from(externalIdentities)
      .where(
        or(
          eq(externalIdentities.id, LOCAL_EXTERNAL_IDENTITY_ID),
          and(
            eq(externalIdentities.issuer, LOCAL_KEYCLOAK_ISSUER),
            eq(externalIdentities.subject, LOCAL_KEYCLOAK_SUBJECT),
          ),
        ),
      )
      .limit(2)
    const identity = identities[0]

    if (identity === undefined) {
      await this.transaction.insert(externalIdentities).values({
        id: LOCAL_EXTERNAL_IDENTITY_ID,
        issuer: LOCAL_KEYCLOAK_ISSUER,
        subject: LOCAL_KEYCLOAK_SUBJECT,
        userId: LOCAL_IDENTITY_USER_ID,
      })
      return
    }
    if (
      identities.length !== 1 ||
      identity.id !== LOCAL_EXTERNAL_IDENTITY_ID ||
      identity.issuer !== LOCAL_KEYCLOAK_ISSUER ||
      identity.subject !== LOCAL_KEYCLOAK_SUBJECT ||
      identity.userId !== LOCAL_IDENTITY_USER_ID
    ) {
      throw new LocalIdentitySeedConflictError('external identity')
    }
  }

  private async ensureMembership(): Promise<void> {
    const memberships = await this.transaction
      .select({
        companyId: userCompanyMemberships.companyId,
        id: userCompanyMemberships.id,
        status: userCompanyMemberships.status,
        userId: userCompanyMemberships.userId,
      })
      .from(userCompanyMemberships)
      .where(
        or(
          eq(userCompanyMemberships.id, LOCAL_MEMBERSHIP_ID),
          and(
            eq(userCompanyMemberships.userId, LOCAL_IDENTITY_USER_ID),
            eq(userCompanyMemberships.companyId, LOCAL_COMPANY_ID),
          ),
        ),
      )
      .limit(2)
    const membership = memberships[0]

    if (membership === undefined) {
      await this.transaction.insert(userCompanyMemberships).values({
        companyId: LOCAL_COMPANY_ID,
        id: LOCAL_MEMBERSHIP_ID,
        status: 'active',
        userId: LOCAL_IDENTITY_USER_ID,
      })
      return
    }
    if (
      memberships.length !== 1 ||
      membership.companyId !== LOCAL_COMPANY_ID ||
      membership.id !== LOCAL_MEMBERSHIP_ID ||
      membership.status !== 'active' ||
      membership.userId !== LOCAL_IDENTITY_USER_ID
    ) {
      throw new LocalIdentitySeedConflictError('company membership')
    }
  }

  private async ensureMembershipRoles(): Promise<void> {
    const rows = await this.transaction
      .select({ role: membershipRoles.role })
      .from(membershipRoles)
      .where(eq(membershipRoles.membershipId, LOCAL_MEMBERSHIP_ID))
    const existingRoles = new Set(rows.map(({ role }) => role))
    const expectedRoles: ReadonlySet<string> = new Set(LOCAL_IDENTITY_ROLES)

    if ([...existingRoles].some((role) => !expectedRoles.has(role))) {
      throw new LocalIdentitySeedConflictError('membership roles')
    }

    const missingRoles = LOCAL_IDENTITY_ROLES.filter((role) => !existingRoles.has(role))
    if (missingRoles.length > 0) {
      await this.transaction
        .insert(membershipRoles)
        .values(missingRoles.map((role) => ({ membershipId: LOCAL_MEMBERSHIP_ID, role })))
    }
  }
}
