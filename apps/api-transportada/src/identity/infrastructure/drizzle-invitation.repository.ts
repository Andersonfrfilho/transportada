/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'

import {
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
  userInvitationRoles,
  userInvitations,
} from '../../database/database.schema.js'
import type {
  CompanyRole,
  IdentityStatus,
  MembershipStatus,
} from '../../database/identity.schema.js'
import type {
  CreateInvitationInput,
  InvitationRecord,
  InvitationRepositoryPort,
} from '../application/invitation.port.js'

type InvitationDatabase = ReturnType<typeof createDrizzleProvider>['db']
type InvitationTransaction = Parameters<Parameters<InvitationDatabase['transaction']>[0]>[0]

type InvitationRow = {
  readonly acceptedAt: Date | null
  readonly attemptCount: number
  readonly codeHash: string
  readonly companyId: string
  readonly expiresAt: Date
  readonly id: string
  readonly status: InvitationRecord['status']
  readonly userId: string
}

/** ADR-0076 §8: a ativação (e o reenvio) precisam saber se o vínculo e a identidade seguem vivos. */
type InvitationStatuses = {
  readonly identityStatus: IdentityStatus
  readonly membershipStatus: MembershipStatus
}

const INVITATION_COLUMNS = {
  acceptedAt: userInvitations.acceptedAt,
  attemptCount: userInvitations.attemptCount,
  codeHash: userInvitations.codeHash,
  companyId: userInvitations.companyId,
  expiresAt: userInvitations.expiresAt,
  id: userInvitations.id,
  status: userInvitations.status,
  userId: userInvitations.userId,
} as const

export const buildInvitationUserFilters = (input: {
  readonly companyId: string
  readonly userId: string
}): readonly SQL[] => [
  eq(userInvitations.companyId, input.companyId),
  eq(userInvitations.userId, input.userId),
]

/**
 * Sem empresa no filtro de propósito: a ativação não é autenticada e o hash é único no banco
 * inteiro. É a linha encontrada que estabelece o tenant, e ela nunca sai daqui em claro.
 */
export const buildInvitationCodeFilters = (input: {
  readonly codeHash: string
}): readonly SQL[] => [eq(userInvitations.codeHash, input.codeHash)]

export const buildInvitationWriteFilters = (input: {
  readonly companyId: string
  readonly invitationId: string
}): readonly SQL[] => [
  eq(userInvitations.companyId, input.companyId),
  eq(userInvitations.id, input.invitationId),
]

export const buildInvitationAttemptFilters = (input: {
  readonly invitationId: string
}): readonly SQL[] => [
  eq(userInvitations.id, input.invitationId),
  eq(userInvitations.status, 'pending'),
]

export const buildInvitationRoleFilters = (input: {
  readonly companyId: string
  readonly invitationId: string
}): readonly SQL[] => [
  eq(userInvitationRoles.companyId, input.companyId),
  eq(userInvitationRoles.invitationId, input.invitationId),
]

export const buildCompanyAdministratorFilters = (input: {
  readonly companyId: string
}): readonly SQL[] => [
  eq(userCompanyMemberships.companyId, input.companyId),
  eq(userCompanyMemberships.status, 'active'),
  eq(membershipRoles.role, 'company-admin'),
]

const toRecord = (
  row: InvitationRow,
  roles: readonly CompanyRole[],
  statuses: InvitationStatuses,
): InvitationRecord => ({
  acceptedAt: row.acceptedAt ?? undefined,
  attemptCount: row.attemptCount,
  codeHash: row.codeHash,
  companyId: row.companyId,
  expiresAt: row.expiresAt,
  id: row.id,
  identityStatus: statuses.identityStatus,
  membershipStatus: statuses.membershipStatus,
  roles,
  status: row.status,
  userId: row.userId,
})

export class DrizzleInvitationRepository implements InvitationRepositoryPort {
  public constructor(private readonly database: InvitationDatabase) {}

  public async create(input: CreateInvitationInput): Promise<InvitationRecord> {
    return this.database.transaction(async (transaction) => {
      if (input.supersededInvitationId !== undefined) {
        await transaction
          .update(userInvitations)
          .set({ status: 'superseded', updatedAt: new Date() })
          .where(
            and(
              ...buildInvitationWriteFilters({
                companyId: input.companyId,
                invitationId: input.supersededInvitationId,
              }),
            ),
          )
      }

      const [row] = await transaction
        .insert(userInvitations)
        .values({
          codeHash: input.codeHash,
          companyId: input.companyId,
          expiresAt: input.expiresAt,
          sealedCode: input.sealedCode,
          userId: input.userId,
        })
        .returning(INVITATION_COLUMNS)
      if (row === undefined) throw new Error('Invitation row was not returned by the database')

      if (input.roles.length > 0) {
        await transaction.insert(userInvitationRoles).values(
          input.roles.map((role) => ({
            companyId: input.companyId,
            invitationId: row.id,
            role,
          })),
        )
      }

      const statuses = await this.fetchStatuses(transaction, {
        companyId: input.companyId,
        userId: input.userId,
      })

      return toRecord(row, input.roles, statuses)
    })
  }

  public async findByCodeHash(input: {
    readonly codeHash: string
  }): Promise<InvitationRecord | undefined> {
    return this.findOne(buildInvitationCodeFilters(input))
  }

  public async findLatestForUser(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<InvitationRecord | undefined> {
    return this.findOne(buildInvitationUserFilters(input))
  }

  public async listAdministratorUserIds(input: {
    readonly companyId: string
  }): Promise<readonly string[]> {
    const rows = await this.database
      .select({ userId: userCompanyMemberships.userId })
      .from(userCompanyMemberships)
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, userCompanyMemberships.id))
      .where(and(...buildCompanyAdministratorFilters(input)))

    return rows.map((row) => row.userId)
  }

  public async markAccepted(input: {
    readonly acceptedAt: Date
    readonly companyId: string
    readonly invitationId: string
  }): Promise<void> {
    await this.database
      .update(userInvitations)
      .set({ acceptedAt: input.acceptedAt, status: 'accepted', updatedAt: new Date() })
      .where(
        and(
          ...buildInvitationWriteFilters({
            companyId: input.companyId,
            invitationId: input.invitationId,
          }),
        ),
      )
  }

  public async registerFailedAttempt(input: { readonly invitationId: string }): Promise<void> {
    await this.database
      .update(userInvitations)
      .set({ attemptCount: sql`${userInvitations.attemptCount} + 1`, updatedAt: new Date() })
      .where(and(...buildInvitationAttemptFilters(input)))
  }

  /**
   * Junta a membership e a identidade da própria linha do convite: as duas FKs de `user_invitations`
   * (`company_id` e o composto `(user_id, company_id)` para a membership) garantem que a junção
   * nunca perde a linha — convite sem membership não existe no banco.
   */
  private async findOne(filters: readonly SQL[]): Promise<InvitationRecord | undefined> {
    const [row] = await this.database
      .select({
        ...INVITATION_COLUMNS,
        identityStatus: identityUsers.status,
        membershipStatus: userCompanyMemberships.status,
      })
      .from(userInvitations)
      .innerJoin(
        userCompanyMemberships,
        and(
          eq(userCompanyMemberships.userId, userInvitations.userId),
          eq(userCompanyMemberships.companyId, userInvitations.companyId),
        ),
      )
      .innerJoin(identityUsers, eq(identityUsers.id, userInvitations.userId))
      .where(and(...filters))
      .orderBy(desc(userInvitations.createdAt))
      .limit(1)
    if (row === undefined) return undefined

    const roles = await this.database
      .select({ role: userInvitationRoles.role })
      .from(userInvitationRoles)
      .where(and(...buildInvitationRoleFilters({ companyId: row.companyId, invitationId: row.id })))

    return toRecord(
      row,
      roles.map((entry) => entry.role),
      { identityStatus: row.identityStatus, membershipStatus: row.membershipStatus },
    )
  }

  private async fetchStatuses(
    executor: InvitationDatabase | InvitationTransaction,
    input: { readonly companyId: string; readonly userId: string },
  ): Promise<InvitationStatuses> {
    const [row] = await executor
      .select({
        identityStatus: identityUsers.status,
        membershipStatus: userCompanyMemberships.status,
      })
      .from(userCompanyMemberships)
      .innerJoin(identityUsers, eq(identityUsers.id, userCompanyMemberships.userId))
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.userId),
        ),
      )
      .limit(1)
    if (row === undefined) {
      throw new Error('Membership not found while resolving invitation statuses')
    }

    return row
  }
}
