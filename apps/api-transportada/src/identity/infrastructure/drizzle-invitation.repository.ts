/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'

import {
  membershipRoles,
  userCompanyMemberships,
  userInvitationRoles,
  userInvitations,
} from '../../database/database.schema.js'
import type { CompanyRole } from '../../database/identity.schema.js'
import type {
  CreateInvitationInput,
  InvitationRecord,
  InvitationRepositoryPort,
} from '../application/invitation.port.js'

type InvitationDatabase = ReturnType<typeof createDrizzleProvider>['db']

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

const toRecord = (row: InvitationRow, roles: readonly CompanyRole[]): InvitationRecord => ({
  acceptedAt: row.acceptedAt ?? undefined,
  attemptCount: row.attemptCount,
  codeHash: row.codeHash,
  companyId: row.companyId,
  expiresAt: row.expiresAt,
  id: row.id,
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

      return toRecord(row, input.roles)
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

  private async findOne(filters: readonly SQL[]): Promise<InvitationRecord | undefined> {
    const [row] = await this.database
      .select(INVITATION_COLUMNS)
      .from(userInvitations)
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
    )
  }
}
