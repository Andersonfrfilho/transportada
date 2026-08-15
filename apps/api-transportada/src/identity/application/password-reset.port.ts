/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { PasswordResetSnapshot } from '../domain/password-reset.policy.js'

/** Um vínculo ativo que responde por um login. Quem tem dois recebe dois códigos. */
export type ActiveResetTarget = {
  readonly companyId: string
  readonly userId: string
}

export type CreatePasswordResetInput = {
  readonly codeHash: string
  readonly companyId: string
  readonly expiresAt: Date
  /**
   * Gerado pela aplicação, e não pelo banco, porque o AAD do envelope precisa do id antes de a
   * linha existir: selar depois deixaria a janela em que o pedido existe sem código entregável.
   */
  readonly id: string
  /** Envelope do código, para o worker poder entregá-lo: hash não se desfaz. */
  readonly sealedCode: SecretEnvelopeV1
  readonly userId: string
}

export type PasswordResetRepositoryPort = {
  /** Consome o pedido vivo anterior e cria o novo na mesma transação. */
  readonly create: (input: CreatePasswordResetInput) => Promise<void>
  /**
   * Resolve pelo login em `identity_user_profiles`, cruzando com vínculos e usuários **ativos**.
   * Login inexistente, usuário desabilitado e vínculo inativo devolvem lista vazia — a rota não
   * consegue distinguir os três porque aqui eles já são a mesma coisa.
   */
  readonly findActiveTargets: (input: {
    readonly username: string
  }) => Promise<readonly ActiveResetTarget[]>
  /**
   * A confirmação não é autenticada e não tem empresa no contexto: ela chega ao pedido só pelo
   * hash, que é único no banco inteiro. É a própria linha encontrada que estabelece o tenant.
   */
  readonly findByCodeHash: (input: {
    readonly codeHash: string
  }) => Promise<PasswordResetSnapshot | undefined>
  readonly markConsumed: (input: {
    readonly companyId: string
    readonly consumedAt: Date
    readonly requestId: string
  }) => Promise<void>
  readonly registerFailedAttempt: (input: { readonly requestId: string }) => Promise<void>
}

/**
 * Sem `actorUserId`: quem pede recuperação não está autenticado, e inventar um ator registraria
 * coisa que não aconteceu. O payload carrega referência — nunca o login, o contato ou o código.
 */
export type PasswordResetDeliveryOutboxPort = {
  readonly save: (input: {
    readonly companyId: string
    readonly correlationId: string
    readonly eventId: string
    readonly eventType: 'transportada.identity.password-reset.code.requested'
    readonly eventVersion: 1
    readonly payload: { readonly requestId: string; readonly userId: string }
    readonly requestId: string
  }) => Promise<void>
}
