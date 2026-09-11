/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type VerifiedWhatsAppPhone = {
  readonly userId: string
  readonly verifiedAt: Date
}

export type WhatsAppPhoneBinding = {
  readonly phone: string
  readonly userId: string
  readonly verifiedAt: Date | undefined
}

export type WhatsAppPhoneVerificationRequest = {
  readonly attemptCount: number
  readonly codeHash: string
  readonly companyId: string
  readonly consumedAt: Date | undefined
  readonly expiresAt: Date
  readonly id: string
  readonly phone: string
  readonly userId: string
}

export type OpenWhatsAppPhoneVerificationInput = {
  readonly codeHash: string
  readonly companyId: string
  readonly expiresAt: Date
  readonly id: string
  readonly phone: string
  readonly userId: string
}

export type WhatsAppPhoneRepositoryPort = {
  readonly findVerifiedByPhone: (input: {
    readonly phone: string
  }) => Promise<VerifiedWhatsAppPhone | undefined>
  /** Número declarado e ainda sem verificação: só separa `unknown_phone` de `unverified_or_expired` no log. */
  readonly hasUnverifiedBindingByPhone: (input: { readonly phone: string }) => Promise<boolean>
  readonly findByUserId: (input: {
    readonly userId: string
  }) => Promise<WhatsAppPhoneBinding | undefined>
  /** Upsert por usuário. Número verificado de outra pessoa lança `WhatsAppPhoneTakenError`. */
  readonly saveVerified: (input: {
    readonly phone: string
    readonly userId: string
    readonly verifiedAt: Date
  }) => Promise<void>
  readonly unbindByUserId: (input: { readonly userId: string }) => Promise<void>
  /** Fecha o pedido vivo anterior do usuário na empresa e abre o novo na mesma transação. */
  readonly openVerificationRequest: (input: OpenWhatsAppPhoneVerificationInput) => Promise<void>
  /**
   * Lista, e não um só: dois usuários da mesma empresa podem ter declarado o mesmo número, e quem
   * desempata é o código. Mais recente primeiro.
   */
  readonly findLiveRequestByCompanyAndPhone: (input: {
    readonly companyId: string
    readonly phone: string
  }) => Promise<readonly WhatsAppPhoneVerificationRequest[]>
  readonly incrementAttempt: (input: {
    readonly companyId: string
    readonly requestId: string
  }) => Promise<void>
  readonly consumeRequest: (input: {
    readonly companyId: string
    readonly consumedAt: Date
    readonly requestId: string
  }) => Promise<void>
}
