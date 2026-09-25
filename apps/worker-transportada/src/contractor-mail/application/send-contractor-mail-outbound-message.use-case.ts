/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { buildReplyAddress, deriveReplyToken } from '../domain/reply-token.policy.js'
import {
  ResendInvalidRecipientsError,
  ResendProviderUnauthorizedError,
} from '../domain/resend-provider.error.js'
import type { ContractorMailCredentialSecretService } from './contractor-mail-credential-secret.service.js'
import type { ContractorMailOutboundWorkerRepository } from '../infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'
import type {
  ResendEmailAttachment,
  ResendMailGateway,
} from '../infrastructure/resend-mail.gateway.js'
import type { ContractorMailOutboundEnvelopeV1 } from '../../messaging/contractor-mail-outbound-envelope.schema.js'

/** Spec 183 T702e: um anexo da mensagem da conversa que aponta para este e-mail. */
export type ContractorMailOutboundAttachmentRecord = {
  readonly bucket: string
  readonly contentType: string
  readonly fileName: string
  readonly key: string
  readonly sha256: string
  readonly sizeBytes: number
}

export type ContractorMailOutboundAttachmentsPort = {
  list(input: {
    readonly companyId: string
    readonly messageId: string
  }): Promise<readonly ContractorMailOutboundAttachmentRecord[]>
  /** `undefined` quando o objeto não existe; erro de rede ou do bucket **lança** (transitório). */
  read(input: { readonly bucket: string; readonly key: string }): Promise<Uint8Array | undefined>
}

export type SendContractorMailOutboundMessageDependencies = {
  readonly attachments: ContractorMailOutboundAttachmentsPort
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

  /**
   * Spec 183 T702e: os bytes saem do bucket e conferem com o `sha256` gravado quando a API os
   * aceitou. Objeto sumido ou trocado não melhora com nova tentativa: falha permanente, sem enviar
   * o e-mail pela metade. Nada do anexo (nome, tipo, tamanho) vai a log.
   */
  const attachments = await loadAttachments({ companyId, messageId }, dependencies.attachments)
  if (attachments === 'unavailable') {
    await dependencies.repository.markMessageFailed({ companyId, messageId })
    return { outcome: 'failed', reason: 'attachment_unavailable', threadId: message.threadId }
  }

  try {
    const sent = await dependencies.mailGateway.sendEmail({
      apiKey: secret.apiKey,
      ...(attachments.length === 0 ? {} : { attachments }),
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

async function loadAttachments(
  query: { readonly companyId: string; readonly messageId: string },
  port: ContractorMailOutboundAttachmentsPort,
): Promise<readonly ResendEmailAttachment[] | 'unavailable'> {
  const records = await port.list(query)
  const loaded: ResendEmailAttachment[] = []
  for (const record of records) {
    const bytes = await port.read({ bucket: record.bucket, key: record.key })
    if (
      bytes === undefined ||
      bytes.byteLength !== record.sizeBytes ||
      createHash('sha256').update(bytes).digest('hex') !== record.sha256
    ) {
      return 'unavailable'
    }
    loaded.push({
      content: Buffer.from(bytes).toString('base64'),
      contentType: record.contentType,
      fileName: record.fileName,
    })
  }
  return loaded
}
