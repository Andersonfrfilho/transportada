/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'

import {
  externalIdentities,
  identityUserProfiles,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
  userInvitations,
} from '../../database/database.schema.js'
import type { CompanyRole, MembershipStatus } from '../../database/identity.schema.js'
import { buildCompanyAdministratorFilters } from './drizzle-invitation.repository.js'
import type {
  CompanyUserPage,
  CompanyUserRecord,
  CompanyUserRepositoryPort,
  CreateInvitedUserInput,
  ListCompanyUsersInput,
} from '../application/company-user.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type MembershipRow = {
  readonly contactAddress: string
  readonly contactChannel: CompanyUserRecord['contactChannel']
  readonly membershipCreatedAt: Date
  readonly membershipId: string
  readonly membershipStatus: MembershipStatus
  readonly name: string
  readonly userId: string
}

const MEMBERSHIP_COLUMNS = {
  contactAddress: identityUserProfiles.contactAddress,
  contactChannel: identityUserProfiles.contactChannel,
  membershipCreatedAt: userCompanyMemberships.createdAt,
  membershipId: userCompanyMemberships.id,
  membershipStatus: userCompanyMemberships.status,
  name: identityUserProfiles.name,
  userId: userCompanyMemberships.userId,
} as const

export class DrizzleCompanyUserRepository implements CompanyUserRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async createInvitedUser(input: CreateInvitedUserInput): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.insert(identityUsers).values({ id: input.userId, status: 'active' })
      await transaction.insert(externalIdentities).values({
        id: crypto.randomUUID(),
        issuer: input.issuer,
        subject: input.subject,
        userId: input.userId,
      })
      await transaction.insert(userCompanyMemberships).values({
        companyId: input.companyId,
        id: crypto.randomUUID(),
        status: 'active',
        userId: input.userId,
      })
      await transaction.insert(identityUserProfiles).values({
        contactAddress: input.contactAddress,
        contactChannel: input.contactChannel,
        name: input.name,
        userId: input.userId,
      })
    })
  }

  public async findByUserId(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<CompanyUserRecord | undefined> {
    const [row] = await this.database
      .select(MEMBERSHIP_COLUMNS)
      .from(userCompanyMemberships)
      .innerJoin(
        identityUserProfiles,
        eq(identityUserProfiles.userId, userCompanyMemberships.userId),
      )
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.userId),
        ),
      )
      .limit(1)
    if (row === undefined) return undefined

    const [roles, pendingInvitations] = await Promise.all([
      this.fetchRoles({ companyId: input.companyId, userIds: [input.userId] }),
      this.fetchPendingInvitations({ companyId: input.companyId, userIds: [input.userId] }),
    ])

    return toRecord(row, roles, pendingInvitations)
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

  public async listPage(input: ListCompanyUsersInput): Promise<CompanyUserPage> {
    const cursor = decodeCursor(input.cursor)
    const rows = await this.database
      .select(MEMBERSHIP_COLUMNS)
      .from(userCompanyMemberships)
      .innerJoin(
        identityUserProfiles,
        eq(identityUserProfiles.userId, userCompanyMemberships.userId),
      )
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          cursor === null
            ? undefined
            : or(
                lt(userCompanyMemberships.createdAt, cursor.createdAt),
                and(
                  eq(userCompanyMemberships.createdAt, cursor.createdAt),
                  lt(userCompanyMemberships.id, cursor.id),
                ),
              ),
        ),
      )
      .orderBy(desc(userCompanyMemberships.createdAt), desc(userCompanyMemberships.id))
      .limit(input.limit + 1)

    const pageRows = rows.slice(0, input.limit)
    const userIds = pageRows.map((row) => row.userId)
    const [roles, pendingInvitations] = await Promise.all([
      this.fetchRoles({ companyId: input.companyId, userIds }),
      this.fetchPendingInvitations({ companyId: input.companyId, userIds }),
    ])

    const items = pageRows.map((row) => toRecord(row, roles, pendingInvitations))
    const last = pageRows.at(-1)
    return {
      items,
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? `${last.membershipCreatedAt.toISOString()}::${last.membershipId}`
          : null,
    }
  }

  public async removeMembership(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<void> {
    await this.database
      .delete(userCompanyMemberships)
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.userId),
        ),
      )
  }

  public async replaceRoles(input: {
    readonly companyId: string
    readonly roles: readonly CompanyRole[]
    readonly userId: string
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [membership] = await transaction
        .select({ id: userCompanyMemberships.id })
        .from(userCompanyMemberships)
        .where(
          and(
            eq(userCompanyMemberships.companyId, input.companyId),
            eq(userCompanyMemberships.userId, input.userId),
          ),
        )
        .limit(1)
      if (membership === undefined) return

      await transaction
        .delete(membershipRoles)
        .where(eq(membershipRoles.membershipId, membership.id))
      if (input.roles.length > 0) {
        await transaction
          .insert(membershipRoles)
          .values(input.roles.map((role) => ({ membershipId: membership.id, role })))
      }
    })
  }

  public async setMembershipStatus(input: {
    readonly companyId: string
    readonly status: MembershipStatus
    readonly userId: string
  }): Promise<void> {
    await this.database
      .update(userCompanyMemberships)
      .set({ status: input.status, updatedAt: new Date() })
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.userId),
        ),
      )
  }

  private async fetchPendingInvitations(input: {
    readonly companyId: string
    readonly userIds: readonly string[]
  }): Promise<ReadonlyMap<string, Date>> {
    if (input.userIds.length === 0) return new Map()

    const rows = await this.database
      .select({ expiresAt: userInvitations.expiresAt, userId: userInvitations.userId })
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.companyId, input.companyId),
          eq(userInvitations.status, 'pending'),
          inArray(userInvitations.userId, input.userIds),
        ),
      )

    return new Map(rows.map((row) => [row.userId, row.expiresAt]))
  }

  private async fetchRoles(input: {
    readonly companyId: string
    readonly userIds: readonly string[]
  }): Promise<ReadonlyMap<string, readonly CompanyRole[]>> {
    if (input.userIds.length === 0) return new Map()

    const rows = await this.database
      .select({ role: membershipRoles.role, userId: userCompanyMemberships.userId })
      .from(membershipRoles)
      .innerJoin(
        userCompanyMemberships,
        eq(userCompanyMemberships.id, membershipRoles.membershipId),
      )
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          inArray(userCompanyMemberships.userId, input.userIds),
        ),
      )

    const rolesByUser = new Map<string, CompanyRole[]>()
    for (const row of rows) {
      const roles = rolesByUser.get(row.userId) ?? []
      roles.push(row.role)
      rolesByUser.set(row.userId, roles)
    }
    return rolesByUser
  }
}

function decodeCursor(
  value: string | null,
): { readonly createdAt: Date; readonly id: string } | null {
  if (value === null) return null
  const separator = value.lastIndexOf('::')
  if (separator < 0) return null
  const createdAt = new Date(value.slice(0, separator))
  const id = value.slice(separator + 2)
  return Number.isNaN(createdAt.getTime()) || id.length === 0 ? null : { createdAt, id }
}

function toRecord(
  row: MembershipRow,
  rolesByUser: ReadonlyMap<string, readonly CompanyRole[]>,
  pendingInvitationsByUser: ReadonlyMap<string, Date>,
): CompanyUserRecord {
  const expiresAt = pendingInvitationsByUser.get(row.userId)
  return {
    contactAddress: row.contactAddress,
    contactChannel: row.contactChannel,
    membershipStatus: row.membershipStatus,
    name: row.name,
    pendingInvitation: expiresAt === undefined ? undefined : { expiresAt },
    roles: rolesByUser.get(row.userId) ?? [],
    userId: row.userId,
  }
}
