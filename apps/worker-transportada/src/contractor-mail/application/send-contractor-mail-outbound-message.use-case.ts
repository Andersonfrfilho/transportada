/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveContractorMailSubject } from '../domain/contractor-mail-subject.constant.js'
import { ResendProviderUnauthorizedError } from '../domain/resend-provider.error.js'
import type { ContractorMailCredentialSecretService } from './contractor-mail-credential-secret.service.js'
import type { ContractorMailOutboundWorkerRepository } from '../infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'
import type { ResendMailGateway } from '../infrastructure/resend-mail.gateway.js'
import type { ContractorMailOutboundEnvelopeV1 } from '../../messaging/contractor-mail-outbound-envelope.schema.js'

export type SendContractorMailOutboundMessageDependencies = {
  readonly mailGateway: ResendMailGateway
  readonly repository: ContractorMailOutboundWorkerRepository
  readonly secretService: ContractorMailCredentialSecretService
}

export type SendContractorMailOutboundMessageResult = {
  readonly outcome: 'failed' | 'sent'
  readonly reason?: string
  readonly threadId: string
}

/**
 * Objetivo item 5 (spec 143 T009). Erro permanente (`ResendProviderUnauthorizedError` — a chave foi
 * recusada, e tentar de novo com a mesma chave nunca funciona) vira `failed` e o retorno é `failed`,
 * sem relançar — o consumidor faz `ack`. Qualquer outro erro (rede fora do ar, resposta fora do
 * schema, cofre que não abre) é relançado: transitório, entra no retry do broker com backoff (plan.md
 * § "Idempotência e concorrência" — a mesma `Idempotency-Key` no reenvio não duplica o e-mail).
 */
export async function sendContractorMailOutboundMessage(
  envelope: ContractorMailOutboundEnvelopeV1,
  dependencies: SendContractorMailOutboundMessageDependencies,
): Promise<SendContractorMailOutboundMessageResult> {
  const { companyId } = envelope
  const { messageId, replyToAddress, toAddress } = envelope.payload

  const message = await dependencies.repository.findMessageById({ companyId, messageId })
  if (message === undefined) {
    throw new Error(`contractor mail message ${messageId} was not found for company ${companyId}`)
  }

  const thread = await dependencies.repository.findThreadById({
    companyId,
    threadId: message.threadId,
  })
  if (thread === undefined) {
    throw new Error(`contractor mail thread ${message.threadId} was not found`)
  }

  const settings = await dependencies.repository.findSettingsByCompanyId({ companyId })
  if (settings === undefined) {
    throw new Error(`contractor mail settings were not found for company ${companyId}`)
  }

  const secret = await dependencies.secretService.decrypt({
    companyId,
    envelope: settings.secretEnvelope,
    settingsId: settings.id,
  })

  const referenceHeaders = await dependencies.repository.findLastInboundReferenceHeaders({
    companyId,
    threadId: message.threadId,
  })
  const headers: Record<string, string> =
    referenceHeaders === undefined
      ? {}
      : { 'In-Reply-To': referenceHeaders.rfcMessageId, References: referenceHeaders.rfcMessageId }

  try {
    const sent = await dependencies.mailGateway.sendEmail({
      apiKey: secret.apiKey,
      from: `${settings.senderName} <${settings.senderAddress}>`,
      headers,
      idempotencyKey: messageId,
      replyTo: replyToAddress,
      subject: resolveContractorMailSubject(thread.subjectType),
      text: message.bodyText,
      to: toAddress,
    })

    await dependencies.repository.markMessageSent({
      companyId,
      messageId,
      providerEmailId: sent.id,
    })
    return { outcome: 'sent', threadId: message.threadId }
  } catch (error) {
    if (error instanceof ResendProviderUnauthorizedError) {
      await dependencies.repository.markMessageFailed({ companyId, messageId })
      return { outcome: 'failed', reason: 'provider_unauthorized', threadId: message.threadId }
    }
    throw error
  }
}
