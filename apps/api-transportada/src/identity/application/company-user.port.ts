/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole, MembershipStatus } from '../../database/identity.schema.js'
import type { ContactChannel } from '../../database/identity-user-profile.schema.js'
import type { LocalIdentityRecord } from '../domain/user-reconciliation.policy.js'

export type PendingInvitationSummary =
  | {
      readonly expiresAt: Date
    }
  | undefined

export type CompanyUserRecord = {
  readonly contactAddress: string
  readonly contactChannel: ContactChannel
  readonly email: string
  /** O id do vínculo, não o da pessoa: é ele que o motorista da frota referencia. */
  readonly membershipId: string
  readonly membershipStatus: MembershipStatus
  readonly name: string
  readonly pendingInvitation: PendingInvitationSummary
  readonly phone: string
  readonly roles: readonly CompanyRole[]
  readonly taxId: string
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
  readonly email: string
  readonly issuer: string
  readonly name: string
  readonly phone: string
  readonly taxId: string
  /** Papéis do convite: o vínculo nasce com eles, senão o convidado autentica sem permissão. */
  readonly roles: readonly CompanyRole[]
  readonly subject: string
  readonly userId: string
  readonly username: string
}

export type UpdateCompanyUserProfileInput = {
  readonly contactAddress?: string
  readonly contactChannel?: ContactChannel
  readonly email?: string
  readonly name?: string
  readonly phone?: string
  readonly taxId?: string
  readonly userId: string
  readonly username?: string
}

export type CreateInvitedUserResult = {
  /**
   * Se o CPF casou com uma ficha de frota que ainda não tinha vínculo. A tela precisa saber:
   * convidar alguém como Motorista sem ficha correspondente não é erro, mas é meia-verdade —
   * a pessoa entra no sistema e não aparece na frota até alguém cadastrar a ficha.
   */
  readonly linkedFleetDriverId: string | null
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
  /**
   * A reconciliação casa por e-mail e documento, e a view da listagem os entrega mascarados
   * (`t***@e***.com.br`) — casar por máscara casaria todo mundo com todo mundo. Esta leitura devolve
   * o valor cru, e é a única do módulo que o faz: a máscara volta na resposta, depois da regra.
   */
  readonly listForReconciliation: (input: {
    readonly companyId: string
  }) => Promise<readonly LocalIdentityRecord[]>
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
