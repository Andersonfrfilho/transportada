/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'
import type { InvitationSnapshot } from '../domain/invitation.policy.js'

export type InvitationRecord = InvitationSnapshot & {
  readonly roles: readonly CompanyRole[]
}

export type CreateInvitationInput = {
  readonly codeHash: string
  readonly companyId: string
  readonly expiresAt: Date
  readonly roles: readonly CompanyRole[]
  readonly supersededInvitationId: string | undefined
  readonly userId: string
}

export type InvitationRepositoryPort = {
  /** Substituir o convite anterior e criar o novo acontecem na mesma transação. */
  readonly create: (input: CreateInvitationInput) => Promise<InvitationRecord>
  /**
   * A ativação não é autenticada e não tem empresa no contexto: ela chega ao convite só pelo hash,
   * que é único no banco inteiro. É a própria linha encontrada que estabelece o tenant.
   */
  readonly findByCodeHash: (input: {
    readonly codeHash: string
  }) => Promise<InvitationRecord | undefined>
  readonly findLatestForUser: (input: {
    readonly companyId: string
    readonly userId: string
  }) => Promise<InvitationRecord | undefined>
  readonly listAdministratorUserIds: (input: {
    readonly companyId: string
  }) => Promise<readonly string[]>
  readonly markAccepted: (input: {
    readonly acceptedAt: Date
    readonly companyId: string
    readonly invitationId: string
  }) => Promise<void>
  readonly registerFailedAttempt: (input: { readonly invitationId: string }) => Promise<void>
}
