/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildWhatsAppPhoneCandidates } from '../domain/whatsapp-phone-candidates.policy.js'
import { WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS } from '../domain/whatsapp-phone-verification.constant.js'
import { WhatsAppPhoneTakenError } from '../domain/whatsapp-phone.error.js'
import { toWhatsAppPhone } from '../domain/whatsapp-phone.policy.js'
import { matchesWhatsAppVerificationCode } from './whatsapp-verification-code.service.js'
import type {
  CompleteWhatsAppPhoneVerificationInput,
  WhatsAppPhoneRepositoryPort,
  WhatsAppPhoneVerificationRequest,
} from './whatsapp-phone.port.js'

export type VerifyWhatsAppPhoneParams = {
  readonly code: string
  readonly companyId: string
  readonly correlationId: string
  readonly fromPhone: string
  readonly now: Date
}

/** Para log, nunca para o número: toda recusa sai como a mesma resposta neutra. */
export type WhatsAppPhoneVerificationRejection =
  | 'code_mismatch'
  | 'invalid_phone'
  | 'no_live_request'
  | 'phone_taken'
  | 'stale'

export type VerifyWhatsAppPhoneResult =
  | {
      /** Nome de exibição da conta, para a confirmação dizer para quem o número foi (T005b B2). */
      readonly displayName?: string
      readonly status: 'verified'
      readonly userId: string
    }
  | { readonly status: 'rejected'; readonly reason: WhatsAppPhoneVerificationRejection }

export type VerifyWhatsAppPhone = (
  params: VerifyWhatsAppPhoneParams,
) => Promise<VerifyWhatsAppPhoneResult>

type VerifyWhatsAppPhoneDependencies = {
  readonly repository: Pick<
    WhatsAppPhoneRepositoryPort,
    | 'closeRequestAfterCollision'
    | 'completeVerification'
    | 'findLiveRequestByCompanyAndPhone'
    | 'findUserDisplayName'
    | 'incrementAttempt'
  >
}

/**
 * O pedido é buscado **pelo `from`**: o código certo vindo de outro número não acha pedido nenhum, e
 * é isso que faz a mensagem provar a posse do WhatsApp. Erro gasta tentativa de todo pedido vivo
 * daquele número na empresa; na quinta ele morre.
 */
export function createVerifyWhatsAppPhoneUseCase({
  repository,
}: VerifyWhatsAppPhoneDependencies): VerifyWhatsAppPhone {
  return async function verifyWhatsAppPhone({ code, companyId, correlationId, fromPhone, now }) {
    const phone = toWhatsAppPhone(fromPhone)
    if (phone === undefined) return reject('invalid_phone')

    const found = await Promise.all(
      buildWhatsAppPhoneCandidates(phone).map((candidate) =>
        repository.findLiveRequestByCompanyAndPhone({ companyId, phone: candidate }),
      ),
    )
    const live = found.flat().filter((request) => isUsable({ now, request }))
    if (live.length === 0) return reject('no_live_request')

    const matched = findMatchingRequest({ code, requests: live })
    if (matched === undefined) {
      await Promise.all(
        live.map((request) => repository.incrementAttempt({ companyId, requestId: request.id })),
      )
      return reject('code_mismatch')
    }

    const completion: CompleteWhatsAppPhoneVerificationInput = {
      audit: { actorUserId: matched.userId, companyId, correlationId },
      phone,
      requestId: matched.id,
      userId: matched.userId,
      verifiedAt: now,
    }
    return complete({ completion, repository })
  }
}

async function complete(input: {
  readonly completion: CompleteWhatsAppPhoneVerificationInput
  readonly repository: VerifyWhatsAppPhoneDependencies['repository']
}): Promise<VerifyWhatsAppPhoneResult> {
  try {
    const outcome = await input.repository.completeVerification(input.completion)
    if (outcome === 'stale') return reject('stale')
    const { userId } = input.completion
    const displayName = await input.repository.findUserDisplayName({ userId })
    return { ...(displayName === undefined ? {} : { displayName }), status: 'verified', userId }
  } catch (error) {
    if (!(error instanceof WhatsAppPhoneTakenError)) throw error
    await input.repository.closeRequestAfterCollision(input.completion)
    return reject('phone_taken')
  }
}

function isUsable(input: {
  readonly now: Date
  readonly request: WhatsAppPhoneVerificationRequest
}): boolean {
  return (
    input.request.expiresAt.getTime() > input.now.getTime() &&
    input.request.attemptCount < WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS
  )
}

/** Compara contra todos, sem parar no primeiro: o tempo não diz quantos pedidos existem. */
function findMatchingRequest(input: {
  readonly code: string
  readonly requests: readonly WhatsAppPhoneVerificationRequest[]
}): WhatsAppPhoneVerificationRequest | undefined {
  const matches = input.requests.filter((request) =>
    matchesWhatsAppVerificationCode({ code: input.code, codeHash: request.codeHash }),
  )
  return matches[0]
}

function reject(reason: WhatsAppPhoneVerificationRejection): VerifyWhatsAppPhoneResult {
  return { reason, status: 'rejected' }
}
