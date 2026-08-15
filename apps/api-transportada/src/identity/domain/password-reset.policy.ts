/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { matchesCodeHash } from './invitation.policy.js'
import {
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_TTL_MINUTES,
} from './password-reset.constant.js'
import { PasswordResetCodeRejectedError } from './password-reset.error.js'

export type PasswordResetSnapshot = {
  readonly attemptCount: number
  readonly codeHash: string
  readonly companyId: string
  readonly consumedAt: Date | undefined
  readonly expiresAt: Date
  readonly id: string
  readonly userId: string
}

export type AcceptedPasswordReset = {
  readonly companyId: string
  readonly consumedAt: Date
  readonly outcome: 'accepted'
  readonly requestId: string
  readonly userId: string
}

/**
 * Nenhum campo aqui distingue pedido inexistente de expirado, consumido, esgotado ou código errado:
 * quem responde a requisição não teria como vazar o motivo nem se quisesse.
 *
 * E a decisão aceita **não** carrega instrução de habilitar conta. Recuperar senha é de quem já
 * entrava; reabrir acesso revogado com um código de e-mail seria escalada de privilégio.
 */
export type PasswordResetDecision = AcceptedPasswordReset | { readonly outcome: 'rejected' }

type DecidePasswordResetParams = {
  readonly attemptedCodeHash: string
  readonly now: Date
  readonly request: PasswordResetSnapshot | undefined
}

type PlanPasswordResetParams = {
  readonly now: Date
}

export type PasswordResetPlan = {
  readonly expiresAt: Date
}

const REJECTED = { outcome: 'rejected' } as const

const isLive = (request: PasswordResetSnapshot, now: Date): boolean => {
  if (request.consumedAt !== undefined) return false
  if (request.attemptCount >= PASSWORD_RESET_MAX_ATTEMPTS) return false

  return request.expiresAt.getTime() > now.getTime()
}

export function planPasswordReset({ now }: PlanPasswordResetParams): PasswordResetPlan {
  return { expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000) }
}

/**
 * Contar a tentativa é decisão à parte da recusa: só faz sentido contra pedido que existia, seguia
 * vivo e recebeu o código errado. Contra pedido expirado, consumido ou inexistente não há contador
 * que proteja coisa alguma.
 */
export function shouldRegisterFailedResetAttempt({
  attemptedCodeHash,
  now,
  request,
}: DecidePasswordResetParams): boolean {
  if (request === undefined) return false
  if (!isLive(request, now)) return false

  return !matchesCodeHash(request.codeHash, attemptedCodeHash)
}

export function decidePasswordReset({
  attemptedCodeHash,
  now,
  request,
}: DecidePasswordResetParams): PasswordResetDecision {
  if (request === undefined) return REJECTED
  if (!isLive(request, now)) return REJECTED
  if (!matchesCodeHash(request.codeHash, attemptedCodeHash)) return REJECTED

  return {
    companyId: request.companyId,
    consumedAt: now,
    outcome: 'accepted',
    requestId: request.id,
    userId: request.userId,
  }
}

/** O use case não faz try/catch: quem transforma a decisão recusada em erro é o domínio. */
export function assertPasswordResetAccepted(
  decision: PasswordResetDecision,
): AcceptedPasswordReset {
  if (decision.outcome !== 'accepted') throw new PasswordResetCodeRejectedError()

  return decision
}
