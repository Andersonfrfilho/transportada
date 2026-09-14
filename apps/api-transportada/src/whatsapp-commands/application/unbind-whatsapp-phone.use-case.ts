/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../../identity/domain/company-user.error.js'
import type { MembershipStandingPort } from './whatsapp-actor.port.js'
import type { WhatsAppPhoneRepositoryPort } from './whatsapp-phone.port.js'

export type UnbindOwnWhatsAppPhoneInput = {
  readonly companyId: string
  readonly correlationId: string
  readonly userId: string
}

export type UnbindWhatsAppPhoneByAdministratorInput = UnbindOwnWhatsAppPhoneInput & {
  readonly actorUserId: string
}

export type UnbindWhatsAppPhoneUseCase = {
  unbindOwn(input: UnbindOwnWhatsAppPhoneInput): Promise<void>
  unbindByAdministrator(input: UnbindWhatsAppPhoneByAdministratorInput): Promise<void>
}

type UnbindWhatsAppPhoneDependencies = {
  readonly memberships: MembershipStandingPort
  readonly repository: Pick<WhatsAppPhoneRepositoryPort, 'unbindWithAudit'>
}

/**
 * Desfazer é idempotente: sem vínculo não há erro e não há trilha. O administrador só desfaz — nunca
 * verifica (A6) — e só alcança quem tem vínculo com a empresa dele; de fora é 404, sem confirmar que
 * a pessoa existe.
 */
export function createUnbindWhatsAppPhoneUseCase({
  memberships,
  repository,
}: UnbindWhatsAppPhoneDependencies): UnbindWhatsAppPhoneUseCase {
  return {
    async unbindOwn({ companyId, correlationId, userId }) {
      await repository.unbindWithAudit({
        audit: { actorUserId: userId, companyId, correlationId },
        userId,
      })
    },
    async unbindByAdministrator({ actorUserId, companyId, correlationId, userId }) {
      const standing = await memberships.findStanding({ companyId, userId })
      if (standing === 'absent') throw new CompanyUserNotFoundError()

      await repository.unbindWithAudit({
        audit: { actorUserId, companyId, correlationId },
        userId,
      })
    },
  }
}
