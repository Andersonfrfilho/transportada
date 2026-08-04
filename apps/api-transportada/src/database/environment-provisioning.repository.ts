/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  companies,
  externalIdentities,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from './database.schema'
import {
  ENVIRONMENT_PROVISIONING_ADMIN_ROLE,
  type ProvisionedArtifact,
} from './environment-provisioning.constant'
import { EnvironmentProvisioningConflictError } from './environment-provisioning.error'

type ProvisioningDatabase = ReturnType<typeof createDrizzleProvider>['db']
type ProvisioningTransaction = Parameters<Parameters<ProvisioningDatabase['transaction']>[0]>[0]

type EnsureExpectedStateParams = {
  readonly adminSubject: string
  readonly companyId: string
  readonly issuer: string
}

export type EnvironmentProvisioningState = {
  readonly adminMembershipId: string
  readonly adminUserId: string
  readonly companyId: string
  readonly created: readonly ProvisionedArtifact[]
}

export class EnvironmentProvisioningRepository {
  private readonly transaction: ProvisioningTransaction
  private readonly created: ProvisionedArtifact[] = []

  public constructor(transaction: ProvisioningTransaction) {
    this.transaction = transaction
  }

  public async ensureExpectedState({
    adminSubject,
    companyId,
    issuer,
  }: EnsureExpectedStateParams): Promise<EnvironmentProvisioningState> {
    await this.ensureCompany(companyId)
    const adminUserId = await this.ensureAdminIdentity({ adminSubject, issuer })
    const adminMembershipId = await this.ensureAdminMembership({ adminUserId, companyId })
    await this.ensureAdminRole(adminMembershipId)

    return { adminMembershipId, adminUserId, companyId, created: [...this.created] }
  }

  private async ensureCompany(companyId: string): Promise<void> {
    const [company] = await this.transaction
      .select({ status: companies.status })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    if (company === undefined) {
      await this.transaction.insert(companies).values({ id: companyId, status: 'active' })
      this.created.push('company')
      return
    }
    if (company.status !== 'active') {
      throw new EnvironmentProvisioningConflictError('company')
    }
  }

  private async ensureAdminIdentity({
    adminSubject,
    issuer,
  }: Readonly<{ adminSubject: string; issuer: string }>): Promise<string> {
    const [identity] = await this.transaction
      .select({ userId: externalIdentities.userId })
      .from(externalIdentities)
      .where(
        and(eq(externalIdentities.issuer, issuer), eq(externalIdentities.subject, adminSubject)),
      )
      .limit(1)

    if (identity !== undefined) {
      await this.assertActiveIdentityUser(identity.userId)
      return identity.userId
    }

    const adminUserId = crypto.randomUUID()
    await this.transaction.insert(identityUsers).values({ id: adminUserId, status: 'active' })
    this.created.push('identity-user')
    await this.transaction
      .insert(externalIdentities)
      .values({ id: crypto.randomUUID(), issuer, subject: adminSubject, userId: adminUserId })
    this.created.push('external-identity')

    return adminUserId
  }

  private async assertActiveIdentityUser(userId: string): Promise<void> {
    const [user] = await this.transaction
      .select({ status: identityUsers.status })
      .from(identityUsers)
      .where(eq(identityUsers.id, userId))
      .limit(1)

    if (user === undefined || user.status !== 'active') {
      throw new EnvironmentProvisioningConflictError('identity user')
    }
  }

  private async ensureAdminMembership({
    adminUserId,
    companyId,
  }: Readonly<{ adminUserId: string; companyId: string }>): Promise<string> {
    const [membership] = await this.transaction
      .select({ id: userCompanyMemberships.id, status: userCompanyMemberships.status })
      .from(userCompanyMemberships)
      .where(
        and(
          eq(userCompanyMemberships.userId, adminUserId),
          eq(userCompanyMemberships.companyId, companyId),
        ),
      )
      .limit(1)

    if (membership !== undefined) {
      // Reativar um vínculo desabilitado desfaria uma decisão humana: o comando recusa e reporta.
      if (membership.status !== 'active') {
        throw new EnvironmentProvisioningConflictError('company membership')
      }
      return membership.id
    }

    const adminMembershipId = crypto.randomUUID()
    await this.transaction.insert(userCompanyMemberships).values({
      companyId,
      id: adminMembershipId,
      status: 'active',
      userId: adminUserId,
    })
    this.created.push('membership')

    return adminMembershipId
  }

  private async ensureAdminRole(membershipId: string): Promise<void> {
    const [role] = await this.transaction
      .select({ role: membershipRoles.role })
      .from(membershipRoles)
      .where(
        and(
          eq(membershipRoles.membershipId, membershipId),
          eq(membershipRoles.role, ENVIRONMENT_PROVISIONING_ADMIN_ROLE),
        ),
      )
      .limit(1)

    if (role !== undefined) {
      return
    }

    await this.transaction
      .insert(membershipRoles)
      .values({ membershipId, role: ENVIRONMENT_PROVISIONING_ADMIN_ROLE })
    this.created.push('company-admin-role')
  }
}
