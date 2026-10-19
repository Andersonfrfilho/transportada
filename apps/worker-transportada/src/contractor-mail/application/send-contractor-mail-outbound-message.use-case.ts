/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import {
  COMPANY_LOGO_CONTENT_ID,
  CONTRACTOR_MAIL_MAX_RECIPIENTS,
} from '../domain/contractor-mail.constant.js'
import { sanitizeSenderDisplayName } from '../domain/sender-display-name.policy.js'
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { CompanyLogoReader } from '../infrastructure/drizzle-company-logo.reader.js'
import { buildReplyAddress, deriveReplyToken } from '../domain/reply-token.policy.js'
import {
  ResendInvalidRecipientsError,
  ResendProviderUnauthorizedError,
} from '../domain/resend-provider.error.js'
import type { ContractorMailCredentialSecretService } from './contractor-mail-credential-secret.service.js'
import type {
  ContractorMailOutboundMessageRecord,
  ContractorMailOutboundWorkerRepository,
} from '../infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'
import type {
  ResendEmailAttachment,
  ResendMailGateway,
} from '../infrastructure/resend-mail.gateway.js'
import { SandboxSmtpRecipientsRejectedError } from '../domain/sandbox-smtp.error.js'
import type { SandboxSmtpMailGateway } from '../infrastructure/sandbox-smtp-mail.gateway.js'
import type { ContractorMailOutboundEnvelopeV1 } from '../../messaging/contractor-mail-outbound-envelope.schema.js'

/** Spec 183 T702e: um anexo da mensagem da conversa que aponta para este e-mail. */
export type ContractorMailOutboundAttachmentRecord = {
  /**
   * Spec 183 T903 (F1): `false` quando o objeto foi apagado (expurgo). O anexo continua na lista
   * para o envio falhar — filtrá-lo fazia o e-mail sair sem o arquivo, com status `sent`.
   */
  readonly available: boolean
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
  /** Spec 272: o logo inline; sem leitor, a mensagem com `has_inline_logo` sai sem a parte (como logo ausente). */
  readonly companyLogo?: CompanyLogoReader
  /** Spec 272: só `messageId` e motivo vão a log (nunca endereço, nome ou corpo). */
  readonly logger?: WorkerLogger
  readonly mailGateway: ResendMailGateway
  readonly repository: ContractorMailOutboundWorkerRepository
  /** Spec 268: presente só com `CONTRACTOR_MAIL_SANDBOX_SMTP` ligado neste worker (nunca em produção). */
  readonly sandboxMailGateway?: SandboxSmtpMailGateway
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

  /** Spec 267 / RF7: o teto vale para `To` + `Cc`, conferido uma vez, antes de escolher o transporte. */
  const recipients = deduplicateRecipients(message.toAddresses)
  const copied = deduplicateRecipients(message.ccAddresses).filter(
    (address) => !recipients.includes(address),
  )
  if (recipients.length + copied.length > CONTRACTOR_MAIL_MAX_RECIPIENTS) {
    await dependencies.repository.markMessageFailed({ companyId, messageId })
    return { outcome: 'failed', reason: 'invalid_recipients', threadId: message.threadId }
  }

  /** Spec 268: a linha diz por onde sai; `sandbox_smtp` nunca lê a configuração da empresa nem fala com o Resend. */
  if (message.transport === 'sandbox_smtp') {
    return sendThroughSandbox({ companyId, copied, dependencies, message, messageId, recipients })
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

  /**
   * Spec 248 T4.7: o boleto levado a um terceiro (cliente da nota ou e-mail informado) sai preso à thread da
   * ocorrência só por exigência da coluna. Sem token de resposta e sem `In-Reply-To`: a resposta de quem
   * recebe nunca cai na conversa da contratante; o `Reply-To` é o contato da empresa, quando houver.
   */
  const forward = await dependencies.repository.findContractorReplyForward({ companyId, messageId })
  const threadReplyTo = forward === undefined ? undefined : (forward.replyToAddress ?? undefined)
  const replyToAddress =
    forward === undefined
      ? buildReplyAddress({
          replyDomain: settings.replyDomain,
          token: deriveReplyToken({
            companyId,
            replyTokenSecret: secret.replyTokenSecret,
            threadId: message.threadId,
          }),
        })
      : threadReplyTo

  const referenceHeaders =
    forward === undefined
      ? await dependencies.repository.findLastInboundReferenceHeaders({
          companyId,
          threadId: message.threadId,
        })
      : undefined
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

  const inlineLogo = await loadInlineLogo({ companyId, dependencies, message, messageId })
  const allAttachments = [...attachments, ...inlineLogo]
  const displayName = resolveFromDisplayName(message)

  try {
    const sent = await dependencies.mailGateway.sendEmail({
      apiKey: secret.apiKey,
      ...(allAttachments.length === 0 ? {} : { attachments: allAttachments }),
      ...(copied.length === 0 ? {} : { cc: copied }),
      from: `${displayName === undefined ? settings.senderName : `"${displayName}"`} <${settings.senderAddress}>`,
      headers,
      ...(message.bodyHtml === null ? {} : { html: message.bodyHtml }),
      idempotencyKey: messageId,
      ...(replyToAddress === undefined ? {} : { replyTo: replyToAddress }),
      subject: message.subject,
      text: message.bodyText,
      to: recipients,
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

async function sendThroughSandbox(input: {
  readonly companyId: string
  readonly copied: readonly string[]
  readonly dependencies: SendContractorMailOutboundMessageDependencies
  readonly message: ContractorMailOutboundMessageRecord
  readonly messageId: string
  readonly recipients: readonly string[]
}): Promise<SendContractorMailOutboundMessageResult> {
  const { companyId, copied, dependencies, message, messageId, recipients } = input
  const { sandboxMailGateway } = dependencies
  if (sandboxMailGateway === undefined || message.fromAddress === null) {
    await dependencies.repository.markMessageFailed({ companyId, messageId })
    return {
      outcome: 'failed',
      reason: sandboxMailGateway === undefined ? 'sandbox_disabled' : 'sender_missing',
      threadId: message.threadId,
    }
  }

  const attachments = await loadAttachments({ companyId, messageId }, dependencies.attachments)
  if (attachments === 'unavailable') {
    await dependencies.repository.markMessageFailed({ companyId, messageId })
    return { outcome: 'failed', reason: 'attachment_unavailable', threadId: message.threadId }
  }

  const inlineLogo = await loadInlineLogo({ companyId, dependencies, message, messageId })
  const allAttachments = [...attachments, ...inlineLogo]
  const displayName = resolveFromDisplayName(message)

  try {
    const sent = await sandboxMailGateway.sendEmail({
      ...(allAttachments.length === 0 ? {} : { attachments: allAttachments }),
      ...(copied.length === 0 ? {} : { cc: copied }),
      from:
        displayName === undefined
          ? message.fromAddress
          : { address: message.fromAddress, name: displayName },
      ...(message.bodyHtml === null ? {} : { html: message.bodyHtml }),
      subject: message.subject,
      text: message.bodyText,
      to: recipients,
    })
    await dependencies.repository.markMessageSent({
      companyId,
      messageId,
      providerEmailId: sent.id,
    })
    return { outcome: 'sent', threadId: message.threadId }
  } catch (error) {
    if (error instanceof SandboxSmtpRecipientsRejectedError) {
      await dependencies.repository.markMessageFailed({ companyId, messageId })
      return { outcome: 'failed', reason: 'invalid_recipients', threadId: message.threadId }
    }
    throw error
  }
}

/** Spec 272 (ADR-0110 §8): só `outbound` e só o que sobra do saneamento; `undefined` é o comportamento de antes. */
function resolveFromDisplayName(message: ContractorMailOutboundMessageRecord): string | undefined {
  if (message.direction !== 'outbound' || message.fromDisplayName === null) return undefined
  const sanitized = sanitizeSenderDisplayName(message.fromDisplayName)
  return sanitized === '' ? undefined : sanitized
}

/**
 * Spec 272 (ADR-0110 §9): o logo da empresa **da mensagem** como parte inline (`Content-ID` `company-logo`). Logo
 * ausente não derruba o envio: sai sem a parte e o log leva só `messageId` e o motivo.
 */
async function loadInlineLogo(input: {
  readonly companyId: string
  readonly dependencies: SendContractorMailOutboundMessageDependencies
  readonly message: ContractorMailOutboundMessageRecord
  readonly messageId: string
}): Promise<readonly ResendEmailAttachment[]> {
  const { companyId, dependencies, message, messageId } = input
  if (!message.hasInlineLogo) return []
  const logo = await dependencies.companyLogo?.find({ companyId })
  if (logo === undefined) {
    if (dependencies.logger !== undefined) {
      safeLogWarn({
        logger: dependencies.logger,
        message: 'contractor_mail_inline_logo_missing',
        metadata: { messageId, reason: 'logo_not_found' },
      })
    }
    return []
  }
  return [
    {
      content: logo.contentBase64,
      contentId: COMPANY_LOGO_CONTENT_ID,
      contentType: logo.mimeType,
      fileName: logo.mimeType === 'image/png' ? 'logo.png' : 'logo.jpg',
    },
  ]
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
    if (!record.available) return 'unavailable'
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
