/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildReplyAddress, deriveReplyToken } from '../domain/reply-token.policy.js'
import {
  ResendInvalidRecipientsError,
  ResendProviderUnauthorizedError,
} from '../domain/resend-provider.error.js'
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
 * Correção pós-entrega da T009 (spec 143). A fila carrega só `{ messageId }` — endereço, assunto e
 * `Reply-To` **não viajam mais** por ela nem pelo `payload` do outbox (§6 do baseline de segurança:
 * job carrega referência, não dado). Tudo o que este caso de uso precisa vem de duas leituras:
 *
 * - a mensagem (`bodyText`, `bodyHtml`, `subject`, `toAddresses`, `threadId`) — gravados quando ela
 *   nasceu;
 * - a configuração (`senderName`, `senderAddress`, `replyDomain`, o envelope selado) — de onde sai
 *   `replyTokenSecret`, para **derivar** o mesmo `Reply-To` que a conversa sempre teve
 *   (`deriveReplyToken`, determinístico por `companyId` + `threadId`; RF7).
 *
 * Spec 150 T302: um e-mail só, com todos os contatos no `to` — a resposta de qualquer um cai na
 * conversa pelo `Reply-To`, e a `Idempotency-Key` segue uma por mensagem.
 */
export async function sendContractorMailOutboundMessage(
  envelope: ContractorMailOutboundEnvelopeV1,
  dependencies: SendContractorMailOutboundMessageDependencies,
): Promise<SendContractorMailOutboundMessageResult> {
  const { companyId } = envelope
  const { messageId } = envelope.payload

  const message = await dependencies.repository.findMessageById({ companyId, messageId })
  if (message === undefined) {
    throw new Error(`contractor mail message ${messageId} was not found for company ${companyId}`)
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

  const token = deriveReplyToken({
    companyId,
    replyTokenSecret: secret.replyTokenSecret,
    threadId: message.threadId,
  })
  const replyToAddress = buildReplyAddress({ replyDomain: settings.replyDomain, token })

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
      ...(message.bodyHtml === null ? {} : { html: message.bodyHtml }),
      idempotencyKey: messageId,
      replyTo: replyToAddress,
      subject: message.subject,
      text: message.bodyText,
      to: deduplicateRecipients(message.toAddresses),
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
    if (error instanceof ResendInvalidRecipientsError) {
      await dependencies.repository.markMessageFailed({ companyId, messageId })
      return { outcome: 'failed', reason: 'invalid_recipients', threadId: message.threadId }
    }
    throw error
  }
}

function deduplicateRecipients(addresses: readonly string[]): string[] {
  return [...new Set(addresses.map((address) => address.toLowerCase()))]
}
