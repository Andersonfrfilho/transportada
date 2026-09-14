/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { maskPhone } from '../../logging/phone-mask.policy.js'
import { WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS } from '../domain/whatsapp-phone-verification.constant.js'
import type { WhatsAppPhoneRepositoryPort } from './whatsapp-phone.port.js'

export type WhatsAppPhoneStatus = 'expired' | 'none' | 'pending' | 'verified'

export type WhatsAppPhonePendingRequest = {
  readonly expiresAt: Date
}

export type WhatsAppPhoneState = {
  readonly expiresAt: Date | undefined
  readonly pendingRequest: WhatsAppPhonePendingRequest | undefined
  readonly phone: string | undefined
  readonly status: WhatsAppPhoneStatus
  readonly verifiedAt: Date | undefined
}

export type ReadWhatsAppPhoneStateInput = {
  readonly companyId: string
  readonly userId: string
}

export type ReadWhatsAppPhoneState = (
  input: ReadWhatsAppPhoneStateInput,
) => Promise<WhatsAppPhoneState>

type ReadWhatsAppPhoneStateDependencies = {
  readonly clock: () => Date
  readonly repository: Pick<WhatsAppPhoneRepositoryPort, 'findByUserId' | 'findLiveRequestByUserId'>
}

/**
 * Spec 144 T017 Passo 0. O código nunca sai daqui — só o `expiresAt` do pedido vivo — e o número
 * volta sempre mascarado, mesmo verificado e mesmo para o dono. `status` é o que a tela decide por
 * cima: `verified` vira `expired` sozinho, sem ninguém varrer o banco por conta.
 */
export function createReadWhatsAppPhoneStateUseCase({
  clock,
  repository,
}: ReadWhatsAppPhoneStateDependencies): ReadWhatsAppPhoneState {
  return async function readWhatsAppPhoneState({ companyId, userId }) {
    const [binding, liveRequest] = await Promise.all([
      repository.findByUserId({ userId }),
      repository.findLiveRequestByUserId({ companyId, userId }),
    ])

    const pendingRequest =
      liveRequest === undefined ? undefined : { expiresAt: liveRequest.expiresAt }

    if (binding?.verifiedAt === undefined) {
      return {
        expiresAt: undefined,
        pendingRequest,
        phone: undefined,
        status: liveRequest === undefined ? 'none' : 'pending',
        verifiedAt: undefined,
      }
    }

    const validityExpiresAt = new Date(
      binding.verifiedAt.getTime() + WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS,
    )
    const status: WhatsAppPhoneStatus = clock() > validityExpiresAt ? 'expired' : 'verified'

    return {
      expiresAt: validityExpiresAt,
      pendingRequest,
      phone: maskPhone(binding.phone),
      status,
      verifiedAt: binding.verifiedAt,
    }
  }
}
