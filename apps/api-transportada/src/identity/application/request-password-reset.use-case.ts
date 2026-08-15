/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { planPasswordReset } from '../domain/password-reset.policy.js'
import {
  issuePasswordResetCode,
  type PasswordResetCodeEnvelopeProviderPort,
} from './password-reset-code.service.js'
import type {
  PasswordResetDeliveryOutboxPort,
  PasswordResetRepositoryPort,
} from './password-reset.port.js'

const PASSWORD_RESET_DELIVERY_EVENT_TYPE =
  'transportada.identity.password-reset.code.requested' as const

type RequestPasswordResetDependencies = {
  readonly envelopeProvider: PasswordResetCodeEnvelopeProviderPort
  readonly now: () => Date
  readonly outbox: PasswordResetDeliveryOutboxPort
  readonly requests: Pick<PasswordResetRepositoryPort, 'create' | 'findActiveTargets'>
}

export type RequestPasswordResetInput = {
  readonly correlationId?: string
  readonly username: string
}

export type RequestPasswordResetUseCase = {
  execute(input: RequestPasswordResetInput): Promise<void>
}

/**
 * Silencioso por construção: login inexistente, usuário desabilitado e vínculo inativo saem daqui
 * pelo mesmo caminho de quem tem vínculo — sem erro, sem retorno. A rota não teria como responder
 * diferente nem por acidente.
 */
export function createRequestPasswordResetUseCase({
  envelopeProvider,
  now,
  outbox,
  requests,
}: RequestPasswordResetDependencies): RequestPasswordResetUseCase {
  return {
    async execute({ correlationId, username }): Promise<void> {
      const targets = await requests.findActiveTargets({ username })
      const plan = planPasswordReset({ now: now() })

      for (const target of targets) {
        const requestId = crypto.randomUUID()
        const { codeHash, sealedCode } = await issuePasswordResetCode({
          companyId: target.companyId,
          envelopeProvider,
          requestId,
        })

        await requests.create({
          codeHash,
          companyId: target.companyId,
          expiresAt: plan.expiresAt,
          id: requestId,
          sealedCode,
          userId: target.userId,
        })

        await outbox.save({
          companyId: target.companyId,
          correlationId: correlationId ?? crypto.randomUUID(),
          eventId: crypto.randomUUID(),
          eventType: PASSWORD_RESET_DELIVERY_EVENT_TYPE,
          eventVersion: 1,
          payload: { requestId, userId: target.userId },
          requestId,
        })
      }
    },
  }
}
