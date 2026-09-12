/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O repositório do número em memória, com as mesmas regras que o banco impõe: um número verificado
 * por pessoa na instalação, um pedido vivo por (empresa, usuário), teto de tentativas.
 */
import type {
  CompleteWhatsAppPhoneVerificationInput,
  WhatsAppPhoneAuditInput,
  WhatsAppPhoneRepositoryPort,
  WhatsAppPhoneVerificationRequest,
} from '../../src/whatsapp-commands/application/whatsapp-phone.port.js'
import { maskPhone } from '../../src/logging/phone-mask.policy.js'
import {
  WHATSAPP_PHONE_AUDIT,
  WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS,
} from '../../src/whatsapp-commands/domain/whatsapp-phone-verification.constant.js'
import { WhatsAppPhoneTakenError } from '../../src/whatsapp-commands/domain/whatsapp-phone.error.js'

type MutableRequest = {
  -readonly [Key in keyof WhatsAppPhoneVerificationRequest]: WhatsAppPhoneVerificationRequest[Key]
} & { readonly createdOrder: number }

export type RecordedAudit = {
  readonly action: string
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly metadata: Record<string, unknown>
  readonly result: 'allowed' | 'denied'
  readonly targetId: string
}

export type WhatsAppPhoneBindingRow = { phone: string; verifiedAt: Date | undefined }

export function createWhatsAppPhoneRepositoryFake(
  options: { readonly companyNumber?: string | undefined } = {},
) {
  const bindings = new Map<string, WhatsAppPhoneBindingRow>()
  const requests: MutableRequest[] = []
  const audits: RecordedAudit[] = []
  let order = 0

  function recordAudit(input: {
    readonly action: string
    readonly audit: WhatsAppPhoneAuditInput
    readonly phone: string
    readonly result: 'allowed' | 'denied'
    readonly userId: string
  }): void {
    audits.push({
      action: input.action,
      actorUserId: input.audit.actorUserId,
      companyId: input.audit.companyId,
      correlationId: input.audit.correlationId,
      metadata: { phone: maskPhone(input.phone) },
      result: input.result,
      targetId: input.userId,
    })
  }

  function findLive(input: CompleteWhatsAppPhoneVerificationInput): MutableRequest | undefined {
    return requests.find(
      (request) =>
        request.id === input.requestId &&
        request.companyId === input.audit.companyId &&
        request.consumedAt === undefined,
    )
  }

  const repository: WhatsAppPhoneRepositoryPort = {
    async closeRequestAfterCollision(input) {
      const request = findLive(input)
      if (request !== undefined) request.consumedAt = input.verifiedAt
      recordAudit({
        action: WHATSAPP_PHONE_AUDIT.collision,
        audit: input.audit,
        phone: input.phone,
        result: 'denied',
        userId: input.userId,
      })
    },
    async completeVerification(input) {
      const request = findLive(input)
      if (request === undefined) return 'stale'
      for (const [userId, binding] of bindings) {
        if (userId !== input.userId && binding.phone === input.phone && binding.verifiedAt) {
          throw new WhatsAppPhoneTakenError()
        }
      }
      request.consumedAt = input.verifiedAt
      bindings.set(input.userId, { phone: input.phone, verifiedAt: input.verifiedAt })
      recordAudit({
        action: WHATSAPP_PHONE_AUDIT.verified,
        audit: input.audit,
        phone: input.phone,
        result: 'allowed',
        userId: input.userId,
      })
      return 'verified'
    },
    async consumeRequest({ companyId, consumedAt, requestId }) {
      const request = requests.find(
        (candidate) => candidate.id === requestId && candidate.companyId === companyId,
      )
      if (request !== undefined && request.consumedAt === undefined) request.consumedAt = consumedAt
    },
    async findByUserId({ userId }) {
      const binding = bindings.get(userId)
      return binding === undefined ? undefined : { ...binding, userId }
    },
    async findCompanyNumber() {
      return options.companyNumber === '' ? undefined : options.companyNumber
    },
    async findLiveRequestByCompanyAndPhone({ companyId, phone }) {
      return requests
        .filter(
          (request) =>
            request.companyId === companyId &&
            request.phone === phone &&
            request.consumedAt === undefined,
        )
        .sort((first, second) => second.createdOrder - first.createdOrder)
        .map((request) => ({
          attemptCount: request.attemptCount,
          codeHash: request.codeHash,
          companyId: request.companyId,
          consumedAt: request.consumedAt,
          expiresAt: request.expiresAt,
          id: request.id,
          phone: request.phone,
          userId: request.userId,
        }))
    },
    async findVerifiedByPhone({ phone }) {
      for (const [userId, binding] of bindings) {
        if (binding.phone === phone && binding.verifiedAt !== undefined) {
          return { userId, verifiedAt: binding.verifiedAt }
        }
      }
      return undefined
    },
    async hasUnverifiedBindingByPhone({ phone }) {
      return [...bindings.values()].some(
        (binding) => binding.phone === phone && binding.verifiedAt === undefined,
      )
    },
    async incrementAttempt({ companyId, requestId }) {
      const request = requests.find(
        (candidate) =>
          candidate.id === requestId &&
          candidate.companyId === companyId &&
          candidate.consumedAt === undefined,
      )
      if (
        request !== undefined &&
        request.attemptCount < WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS
      ) {
        request.attemptCount += 1
      }
    },
    async openVerificationRequest(input) {
      for (const request of requests) {
        if (
          request.companyId === input.companyId &&
          request.userId === input.userId &&
          request.consumedAt === undefined
        ) {
          request.consumedAt = new Date()
        }
      }
      order += 1
      requests.push({ ...input, attemptCount: 0, consumedAt: undefined, createdOrder: order })
    },
    async saveVerified({ phone, userId, verifiedAt }) {
      bindings.set(userId, { phone, verifiedAt })
    },
    async unbindByUserId({ userId }) {
      bindings.delete(userId)
    },
    async unbindWithAudit({ audit, userId }) {
      const binding = bindings.get(userId)
      if (binding === undefined) return false
      bindings.delete(userId)
      recordAudit({
        action: WHATSAPP_PHONE_AUDIT.unbound,
        audit,
        phone: binding.phone,
        result: 'allowed',
        userId,
      })
      return true
    },
  }

  return { audits, bindings, repository, requests }
}
