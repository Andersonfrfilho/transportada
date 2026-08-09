/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { CompanyRole } from '../../database/identity.schema.js'
import type { UserInvitationStatus } from '../../database/user-invitation.schema.js'
import { INVITATION_MAX_ATTEMPTS, INVITATION_TTL_MINUTES } from './invitation.constant.js'
import {
  InvitationAlreadyAcceptedError,
  InvitationCodeRejectedError,
  LastCompanyAdminError,
} from './invitation.error.js'

export type InvitationSnapshot = {
  readonly acceptedAt: Date | undefined
  readonly attemptCount: number
  readonly codeHash: string
  readonly companyId: string
  readonly expiresAt: Date
  readonly id: string
  readonly status: UserInvitationStatus
  readonly userId: string
}

export type AcceptedInvitationActivation = {
  readonly acceptedAt: Date
  readonly companyId: string
  readonly invitationId: string
  readonly outcome: 'accepted'
  readonly userId: string
}

/**
 * A recusa não tem variante: nenhum campo aqui distingue expirado de já usado, de inexistente ou
 * de errado. Quem responde a requisição não teria como vazar o motivo mesmo se quisesse.
 */
export type InvitationActivationDecision =
  | AcceptedInvitationActivation
  | { readonly outcome: 'rejected' }

type DecideInvitationActivationParams = {
  readonly attemptedCodeHash: string
  readonly invitation: InvitationSnapshot | undefined
  readonly now: Date
}

type PlanInvitationResendParams = {
  readonly invitation: InvitationSnapshot | undefined
  readonly now: Date
}

export type InvitationResendPlan = {
  readonly expiresAt: Date
  readonly supersededInvitationId: string | undefined
}

type AssertCompanyKeepsAdministratorParams = {
  readonly administratorUserIds: readonly string[]
  readonly nextRoles: readonly CompanyRole[]
  readonly targetUserId: string
}

const REJECTED = { outcome: 'rejected' } as const

const COMPANY_ADMIN_ROLE: CompanyRole = 'company-admin'

const INVITATION_CODE_BYTES = 8

/** Único gerador do código em claro: convite e reenvio compartilham para nunca divergir do hash. */
export function generateInvitationCode(): string {
  return randomBytes(INVITATION_CODE_BYTES).toString('hex')
}

export function hashInvitationCode(code: string): string {
  return new Bun.CryptoHasher('sha256').update(code).digest('hex').toLowerCase()
}

const matchesCodeHash = (storedHash: string, attemptedHash: string): boolean => {
  const stored = Buffer.from(storedHash, 'hex')
  const attempted = Buffer.from(attemptedHash, 'hex')
  if (stored.length !== attempted.length || stored.length === 0) return false

  return timingSafeEqual(stored, attempted)
}

/**
 * A recusa de `decideInvitationActivation` não distingue motivo (§ acima), mas contar a tentativa
 * é decisão de negócio à parte: só faz sentido quando o convite existia, seguia elegível e o hash
 * não bateu — contra convite expirado, esgotado ou inexistente, contar não protege nada.
 */
export function shouldRegisterFailedAttempt({
  attemptedCodeHash,
  invitation,
  now,
}: DecideInvitationActivationParams): boolean {
  if (invitation === undefined) return false
  if (invitation.status !== 'pending') return false
  if (invitation.attemptCount >= INVITATION_MAX_ATTEMPTS) return false
  if (invitation.expiresAt.getTime() <= now.getTime()) return false

  return !matchesCodeHash(invitation.codeHash, attemptedCodeHash)
}

export function decideInvitationActivation({
  attemptedCodeHash,
  invitation,
  now,
}: DecideInvitationActivationParams): InvitationActivationDecision {
  if (invitation === undefined) return REJECTED
  if (invitation.status !== 'pending') return REJECTED
  // Tentativas esgotadas recusam até o código certo. Um erro próprio aqui contaria a quem sonda
  // códigos que existe convite de verdade — convite inexistente não tem contador para estourar.
  if (invitation.attemptCount >= INVITATION_MAX_ATTEMPTS) return REJECTED
  if (invitation.expiresAt.getTime() <= now.getTime()) return REJECTED
  if (!matchesCodeHash(invitation.codeHash, attemptedCodeHash)) return REJECTED

  return {
    acceptedAt: now,
    companyId: invitation.companyId,
    invitationId: invitation.id,
    outcome: 'accepted',
    userId: invitation.userId,
  }
}

/** O use case não faz try/catch: quem transforma a decisão recusada em erro é o domínio. */
export function assertInvitationAccepted(
  decision: InvitationActivationDecision,
): AcceptedInvitationActivation {
  if (decision.outcome !== 'accepted') throw new InvitationCodeRejectedError()

  return decision
}

export function planInvitationResend({
  invitation,
  now,
}: PlanInvitationResendParams): InvitationResendPlan {
  if (invitation?.status === 'accepted') throw new InvitationAlreadyAcceptedError()

  return {
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MINUTES * 60_000),
    supersededInvitationId: invitation?.status === 'pending' ? invitation.id : undefined,
  }
}

/**
 * Vale para troca de perfis e para remoção de vínculo: remover é ficar com `nextRoles` vazio.
 * Recebe a lista de administradores pronta porque a consulta é do use case, não do domínio.
 */
export function assertCompanyKeepsAdministrator({
  administratorUserIds,
  nextRoles,
  targetUserId,
}: AssertCompanyKeepsAdministratorParams): void {
  if (nextRoles.includes(COMPANY_ADMIN_ROLE)) return
  if (!administratorUserIds.includes(targetUserId)) return
  if (administratorUserIds.some((userId) => userId !== targetUserId)) return

  throw new LastCompanyAdminError()
}
