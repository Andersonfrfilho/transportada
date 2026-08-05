/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole, MembershipStatus } from '../../database/identity.schema.js'
import type { ContactChannel } from '../../database/identity-user-profile.schema.js'

export type PendingInvitationSummary =
  | {
      readonly expiresAt: Date
    }
  | undefined

export type CompanyUserRecord = {
  readonly contactAddress: string
  readonly contactChannel: ContactChannel
  readonly membershipStatus: MembershipStatus
  readonly name: string
  readonly pendingInvitation: PendingInvitationSummary
  readonly roles: readonly CompanyRole[]
  readonly userId: string
}

export type CompanyUserPage = {
  readonly items: readonly CompanyUserRecord[]
  readonly nextCursor: string | null
}

export type CreateInvitedUserInput = {
  readonly companyId: string
  readonly contactAddress: string
  readonly contactChannel: ContactChannel
  readonly issuer: string
  readonly name: string
  readonly subject: string
  readonly userId: string
}

export type ListCompanyUsersInput = {
  readonly companyId: string
  readonly cursor: string | null
  readonly limit: number
}

export type CompanyUserRepositoryPort = {
  readonly createInvitedUser: (input: CreateInvitedUserInput) => Promise<void>
  readonly findByUserId: (input: {
    readonly companyId: string
    readonly userId: string
  }) => Promise<CompanyUserRecord | undefined>
  readonly listAdministratorUserIds: (input: {
    readonly companyId: string
  }) => Promise<readonly string[]>
  readonly listPage: (input: ListCompanyUsersInput) => Promise<CompanyUserPage>
  readonly removeMembership: (input: {
    readonly companyId: string
    readonly userId: string
  }) => Promise<void>
  readonly replaceRoles: (input: {
    readonly companyId: string
    readonly roles: readonly CompanyRole[]
    readonly userId: string
  }) => Promise<void>
  readonly setMembershipStatus: (input: {
    readonly companyId: string
    readonly status: MembershipStatus
    readonly userId: string
  }) => Promise<void>
}
