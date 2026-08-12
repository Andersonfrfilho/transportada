/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

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
  /** Envelope do código, para o worker poder entregá-lo: hash não se desfaz. */
  readonly sealedCode: SecretEnvelopeV1
  readonly supersededInvitationId: string | undefined
  readonly userId: string
}

/**
 * Publicar a entrega é escrita na **mesma transação** que cria o convite: convite sem mensagem é
 * código que ninguém recebe — exatamente o defeito que a T013 flagrou.
 */
export type InvitationDeliveryOutboxPort = {
  readonly save: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
    readonly eventId: string
    readonly eventType: 'transportada.identity.invitation.code.requested'
    readonly eventVersion: 1
    readonly invitationId: string
    readonly payload: { readonly invitationId: string; readonly userId: string }
  }) => Promise<void>
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
