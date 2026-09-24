/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, or } from 'drizzle-orm'

import {
  LOCAL_COMPANY_ID,
  LOCAL_KEYCLOAK_ISSUER,
  type LocalSeedActor,
} from './local-identity-seed.constant'
import { LocalIdentitySeedConflictError } from './local-identity-seed.error'
import {
  companies,
  externalIdentities,
  identityUserProfiles,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from './database.schema'

type IdentityDatabase = ReturnType<typeof createDrizzleProvider>['db']
type IdentityTransaction = Parameters<Parameters<IdentityDatabase['transaction']>[0]>[0]

export class LocalIdentitySeedRepository {
  private readonly actor: LocalSeedActor
  private readonly transaction: IdentityTransaction

  public constructor(input: {
    readonly actor: LocalSeedActor
    readonly transaction: IdentityTransaction
  }) {
    this.actor = input.actor
    this.transaction = input.transaction
  }

  public async ensureExpectedState(): Promise<void> {
    await this.ensureCompany()
    await this.ensureIdentityUser()
    await this.ensureIdentityUserProfile()
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
      .where(eq(identityUsers.id, this.actor.userId))
      .limit(1)

    if (user === undefined) {
      await this.transaction
        .insert(identityUsers)
        .values({ id: this.actor.userId, status: 'active' })
      return
    }
    if (user.status !== 'active') {
      throw new LocalIdentitySeedConflictError('identity user')
    }
  }

  /**
   * O perfil é onde mora o nome, e é dele que a autoria da linha do tempo lê. Sem esta linha o
   * `actorName` chega nulo e a tela afirma "por usuário removido" sobre um usuário ativo — foi o que
   * a bancada mostrou em 23/09. O seed parava no `identity_users`; produção sempre gravou os dois
   * juntos, na mesma transação.
   */
  private async ensureIdentityUserProfile(): Promise<void> {
    const [profile] = await this.transaction
      .select({ name: identityUserProfiles.name })
      .from(identityUserProfiles)
      .where(eq(identityUserProfiles.userId, this.actor.userId))
      .limit(1)

    if (profile !== undefined) return

    await this.transaction.insert(identityUserProfiles).values({
      contactAddress: this.actor.contactAddress,
      contactChannel: 'email',
      email: this.actor.contactAddress,
      name: this.actor.name,
      username: this.actor.userId,
      userId: this.actor.userId,
    })
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
          eq(externalIdentities.id, this.actor.externalIdentityId),
          and(
            eq(externalIdentities.issuer, LOCAL_KEYCLOAK_ISSUER),
            eq(externalIdentities.subject, this.actor.subject),
          ),
        ),
      )
      .limit(2)
    const identity = identities[0]

    if (identity === undefined) {
      await this.transaction.insert(externalIdentities).values({
        id: this.actor.externalIdentityId,
        issuer: LOCAL_KEYCLOAK_ISSUER,
        subject: this.actor.subject,
        userId: this.actor.userId,
      })
      return
    }
    if (
      identities.length !== 1 ||
      identity.id !== this.actor.externalIdentityId ||
      identity.issuer !== LOCAL_KEYCLOAK_ISSUER ||
      identity.subject !== this.actor.subject ||
      identity.userId !== this.actor.userId
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
          eq(userCompanyMemberships.id, this.actor.membershipId),
          and(
            eq(userCompanyMemberships.userId, this.actor.userId),
            eq(userCompanyMemberships.companyId, LOCAL_COMPANY_ID),
          ),
        ),
      )
      .limit(2)
    const membership = memberships[0]

    if (membership === undefined) {
      await this.transaction.insert(userCompanyMemberships).values({
        companyId: LOCAL_COMPANY_ID,
        id: this.actor.membershipId,
        status: 'active',
        userId: this.actor.userId,
      })
      return
    }
    if (
      memberships.length !== 1 ||
      membership.companyId !== LOCAL_COMPANY_ID ||
      membership.id !== this.actor.membershipId ||
      membership.status !== 'active' ||
      membership.userId !== this.actor.userId
    ) {
      throw new LocalIdentitySeedConflictError('company membership')
    }
  }

  private async ensureMembershipRoles(): Promise<void> {
    const rows = await this.transaction
      .select({ role: membershipRoles.role })
      .from(membershipRoles)
      .where(eq(membershipRoles.membershipId, this.actor.membershipId))
    const existingRoles = new Set(rows.map(({ role }) => role))
    const expectedRoles: ReadonlySet<string> = new Set(this.actor.roles)

    if ([...existingRoles].some((role) => !expectedRoles.has(role))) {
      throw new LocalIdentitySeedConflictError('membership roles')
    }

    const missingRoles = this.actor.roles.filter((role) => !existingRoles.has(role))
    if (missingRoles.length > 0) {
      await this.transaction
        .insert(membershipRoles)
        .values(missingRoles.map((role) => ({ membershipId: this.actor.membershipId, role })))
    }
  }
}
