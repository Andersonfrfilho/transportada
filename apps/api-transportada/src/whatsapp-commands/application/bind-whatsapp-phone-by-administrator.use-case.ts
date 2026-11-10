/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../../identity/domain/company-user.error.js'
import { WhatsAppPhoneInvalidError } from '../domain/whatsapp-phone.error.js'
import { toWhatsAppPhone } from '../domain/whatsapp-phone.policy.js'
import type { MembershipStandingPort } from './whatsapp-actor.port.js'
import type { WhatsAppPhoneRepositoryPort } from './whatsapp-phone.port.js'

export type BindWhatsAppPhoneByAdministratorInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly phone: string
  readonly userId: string
}

export type BindWhatsAppPhoneByAdministrator = (
  input: BindWhatsAppPhoneByAdministratorInput,
) => Promise<void>

type Dependencies = {
  readonly clock: () => Date
  readonly memberships: MembershipStandingPort
  readonly repository: Pick<WhatsAppPhoneRepositoryPort, 'bindVerifiedWithAudit'>
}

/**
 * Decisão do dono (10/11/2026), que revê a regra A6 da spec 144 ("o administrador só desfaz"): quem tem `users.manage`
 * grava o WhatsApp de outra pessoa já verificado, sem pedido de código. A trilha diz quem gravou; o número sai
 * mascarado. Só alcança quem tem vínculo com a empresa do administrador (de fora é 404, sem confirmar que a pessoa
 * existe) e número verificado de outra pessoa dentro da validade continua sendo 409.
 */
export function createBindWhatsAppPhoneByAdministratorUseCase({
  clock,
  memberships,
  repository,
}: Dependencies): BindWhatsAppPhoneByAdministrator {
  return async function bindWhatsAppPhoneByAdministrator(input) {
    const phone = toWhatsAppPhone(input.phone)
    if (phone === undefined) throw new WhatsAppPhoneInvalidError()
    const standing = await memberships.findStanding({
      companyId: input.companyId,
      userId: input.userId,
    })
    if (standing === 'absent') throw new CompanyUserNotFoundError()

    await repository.bindVerifiedWithAudit({
      audit: {
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        correlationId: input.correlationId,
      },
      phone,
      userId: input.userId,
      verifiedAt: clock(),
    })
  }
}
