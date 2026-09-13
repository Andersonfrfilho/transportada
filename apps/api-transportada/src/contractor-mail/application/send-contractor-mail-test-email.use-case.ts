/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  ContractorMailNotConfiguredError,
  ContractorMailTestRecipientUnavailableError,
} from '../domain/contractor-mail.error.js'
import { buildReplyAddress, generateReplyToken } from '../domain/reply-token.policy.js'
import type { ActorEmailResolver } from '../infrastructure/actor-email.repository.js'
import type { ContractorMailRepositoryPort } from './contractor-mail.port.js'

export type SendContractorMailTestEmailContext = {
  readonly companyId: string
  readonly userId: string
}

export type SendContractorMailTestEmailInput = {
  readonly context: SendContractorMailTestEmailContext
  readonly correlationId: string
}

export type SendContractorMailTestEmailResult = {
  readonly threadId: string
}

export type SendContractorMailTestEmailUseCase = {
  execute(input: SendContractorMailTestEmailInput): Promise<SendContractorMailTestEmailResult>
}

/**
 * Spec 143 T009 (P0, RF13). O destinatário é o e-mail do administrador autenticado — lido do
 * contexto, nunca do corpo — e a conversa `setup_test` nunca decide nada (ela só existe para o
 * round-trip da lista de verificação fechar).
 */
export function createSendContractorMailTestEmailUseCase(dependencies: {
  readonly actorEmailResolver: ActorEmailResolver
  readonly repository: ContractorMailRepositoryPort
}): SendContractorMailTestEmailUseCase {
  return {
    async execute({ context, correlationId }) {
      const settings = await dependencies.repository.findSettings({ companyId: context.companyId })
      if (settings === undefined) throw new ContractorMailNotConfiguredError()

      const recipientEmail = await dependencies.actorEmailResolver.resolve({
        companyId: context.companyId,
        userId: context.userId,
      })
      if (recipientEmail === undefined) throw new ContractorMailTestRecipientUnavailableError()

      const { token, tokenHash } = generateReplyToken()
      const replyToAddress = buildReplyAddress({ replyDomain: settings.replyDomain, token })

      const { threadId } = await dependencies.repository.openTestEmailThread({
        actorUserId: context.userId,
        bodyText: buildContractorMailTestEmailBody({ senderName: settings.senderName }),
        companyId: context.companyId,
        correlationId,
        fromAddress: settings.senderAddress,
        replyToAddress,
        replyTokenHash: tokenHash,
        toAddress: recipientEmail,
      })

      return { threadId }
    },
  }
}

/**
 * Texto simples, sem PII além do nome do remetente configurado (Objetivo, item 3). Pura e exportada
 * para o teste conferir a cópia sem passar pela transação inteira.
 */
export function buildContractorMailTestEmailBody(input: { readonly senderName: string }): string {
  return [
    `Este é um e-mail de teste do sistema de e-mail com contratantes de ${input.senderName}.`,
    '',
    'Para concluir a verificação, responda a esta mensagem com qualquer texto. A resposta confirma',
    'que o e-mail foi entregue e que a assinatura DKIM do seu provedor de e-mail está alinhada.',
  ].join('\n')
}
