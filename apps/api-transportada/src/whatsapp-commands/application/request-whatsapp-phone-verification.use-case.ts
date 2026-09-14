/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { randomUUID } from 'node:crypto'

import { WHATSAPP_PHONE_VERIFICATION_TTL_MS } from '../domain/whatsapp-phone-verification.constant.js'
import { WhatsAppChannelNumberMissingError } from '../domain/whatsapp-phone.error.js'
import {
  generateWhatsAppVerificationCode,
  hashWhatsAppVerificationCode,
} from './whatsapp-verification-code.service.js'
import type { WhatsAppPhoneRepositoryPort } from './whatsapp-phone.port.js'

/** `phone` já canônico: a fronteira HTTP recusa o que `toWhatsAppPhone` não reconhece. */
export type RequestWhatsAppPhoneVerificationInput = {
  readonly companyId: string
  readonly phone: string
  readonly userId: string
}

export type RequestWhatsAppPhoneVerificationResult = {
  readonly code: string
  readonly companyNumber: string
  readonly expiresAt: Date
}

export type RequestWhatsAppPhoneVerification = (
  input: RequestWhatsAppPhoneVerificationInput,
) => Promise<RequestWhatsAppPhoneVerificationResult>

type RequestWhatsAppPhoneVerificationDependencies = {
  readonly clock: () => Date
  readonly repository: Pick<
    WhatsAppPhoneRepositoryPort,
    'findCompanyNumber' | 'openVerificationRequest'
  >
}

/**
 * A verificação é de entrada (A3): o código volta na resposta porque é a pessoa quem o envia do
 * próprio WhatsApp para o número da empresa. Por isso ele nunca vai para log nem para o banco — só
 * o digest.
 */
export function createRequestWhatsAppPhoneVerificationUseCase({
  clock,
  repository,
}: RequestWhatsAppPhoneVerificationDependencies): RequestWhatsAppPhoneVerification {
  return async function requestWhatsAppPhoneVerification({ companyId, phone, userId }) {
    const companyNumber = await repository.findCompanyNumber({ companyId })
    if (companyNumber === undefined) throw new WhatsAppChannelNumberMissingError()

    const code = generateWhatsAppVerificationCode()
    const expiresAt = new Date(clock().getTime() + WHATSAPP_PHONE_VERIFICATION_TTL_MS)
    await repository.openVerificationRequest({
      codeHash: hashWhatsAppVerificationCode(code),
      companyId,
      expiresAt,
      id: randomUUID(),
      phone,
      userId,
    })
    return { code, companyNumber, expiresAt }
  }
}
