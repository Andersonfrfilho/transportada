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
  /** O id do vínculo, não o da pessoa: é ele que o motorista da frota referencia. */
  readonly membershipId: string
  readonly membershipStatus: MembershipStatus
  readonly name: string
  readonly pendingInvitation: PendingInvitationSummary
  readonly roles: readonly CompanyRole[]
  readonly userId: string
  readonly username: string
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
  /** Papéis do convite: o vínculo nasce com eles, senão o convidado autentica sem permissão. */
  readonly roles: readonly CompanyRole[]
  readonly subject: string
  readonly userId: string
  readonly username: string
}

export type UpdateCompanyUserProfileInput = {
  readonly contactAddress?: string
  readonly contactChannel?: ContactChannel
  readonly name?: string
  readonly userId: string
  readonly username?: string
}

export type CreateInvitedUserResult = {
  readonly membershipId: string
}

export type ListCompanyUsersInput = {
  readonly companyId: string
  readonly cursor: string | null
  readonly limit: number
}

export type CompanyUserRepositoryPort = {
  readonly createInvitedUser: (input: CreateInvitedUserInput) => Promise<CreateInvitedUserResult>
  readonly findByUserId: (input: {
    readonly companyId: string
    readonly userId: string
  }) => Promise<CompanyUserRecord | undefined>
  /** O `subject` do provedor de identidade; é ele que o Admin API entende, não o id da aplicação. */
  readonly findIdentitySubject: (input: { readonly userId: string }) => Promise<string | undefined>
  readonly listActiveMembershipCompanyIds: (input: {
    readonly userId: string
  }) => Promise<readonly string[]>
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
  /** Lança `DuplicateUsernameError` quando o login já pertence a outra pessoa do realm. */
  readonly updateProfile: (input: UpdateCompanyUserProfileInput) => Promise<void>
}
