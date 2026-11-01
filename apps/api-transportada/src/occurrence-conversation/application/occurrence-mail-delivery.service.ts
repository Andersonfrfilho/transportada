/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 T3.5 (D5): a entrega do e-mail da conversa com a contratante, comum ao diálogo da 183 e ao chat
 * da 274. Prontidão (Resend ou sandbox), destinatários e cópia da 267, conversa/thread/trava, o transporte,
 * a gravação do e-mail + mensagem da conversa + outbox + anexos e a idempotência. O que é de cada porta de
 * entrada (modelo do tipo, composição do HTML, assunto, prévia) fica no caso de uso dela.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { IdempotencyFingerprintPort } from '../../companies/application/company-settings.port.js'
import type { ContractorMailCredentialSecretService } from '../../contractor-mail/application/contractor-mail-credential-secret.service.js'
import type { ContractorMailTransport } from '../../contractor-mail/domain/contractor-mail.constant.js'
import {
  resolveMailCopy,
  type MailCopyLogger,
} from '../../contractor-mail/application/resolve-mail-copy.service.js'
import { createMailSendReadinessError } from '../../contractor-mail/domain/contractor-mail.error.js'
import {
  resolveMailSendReadiness,
  type MailSendReadinessResult,
} from '../../contractor-mail/domain/mail-send-readiness.policy.js'
import {
  deriveReplyToken,
  hashReplyToken,
} from '../../contractor-mail/domain/reply-token.policy.js'
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import {
  OccurrenceConversationIdempotencyKeyReusedError,
  OccurrenceConversationNoRecipientError,
} from '../domain/occurrence-conversation.error.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import { attachConversationUploads } from './conversation-attachment.service.js'
import type { OpenContractorReplyLogger } from './open-contractor-reply.service.js'
import type {
  OccurrenceMailTransactionPort,
  OccurrenceNotificationTemplate,
  SendOccurrenceMailResult,
} from './occurrence-mail.port.js'

const ENCODER = new TextEncoder()
/** RF12 da 150: caractere que injetaria cabeçalho ou trocaria o destinatário no `to` do gateway. */
const UNSAFE_EMAIL_CHARACTERS = /[\r\n,<>]/u
/** RF21: 144 bits aleatórios em base64url — opaco, sem o id interno. */
const PUBLIC_REF_BYTES = 18

export type OccurrenceMailLogger = OpenContractorReplyLogger & MailCopyLogger

/**
 * Spec 268: o modo sandbox do ambiente (`CONTRACTOR_MAIL_SANDBOX_SMTP`, nunca em produção). Presente, uma
 * empresa sem o Resend pronto não é recusada: a mensagem é gravada para o SMTP do worker, de `fromAddress`.
 */
export type OccurrenceMailSandbox = { readonly fromAddress: string }

export type OccurrenceMailDelivery = {
  readonly fromAddress: string
  readonly replyTokenHash: string
  readonly transport: ContractorMailTransport
}

export type OccurrenceMailReadiness = MailSendReadinessResult<
  NonNullable<Awaited<ReturnType<OccurrenceMailTransactionPort['findMailSettings']>>>
>

export function createPublicRef(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(PUBLIC_REF_BYTES))).toString('base64url')
}

/** Mesma regra do worker: minúsculas, primeira ocorrência vence. */
function deduplicateRecipients(addresses: readonly string[]): string[] {
  return [...new Set(addresses.map((address) => address.toLowerCase()))]
}

/** A impressão digital: cada campo em bytes, na ordem dada, sob a operação da porta de entrada. */
export function createMailFingerprint(params: {
  readonly fields: readonly string[]
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly operation: string
}): Promise<string> {
  return params.fingerprintService.create({
    fields: params.fields.map((value) => ENCODER.encode(value)),
    operation: params.operation,
  })
}

/** Reenvio da mesma chave: o gravado; a mesma chave com outra impressão digital é 409. */
export async function findMailReplay(params: {
  readonly companyId: string
  readonly fingerprint: string
  readonly idempotencyKey: string
  /** Spec 274: a operação do chat; ausente, a do diálogo. */
  readonly operation?: string
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<null | SendOccurrenceMailResult> {
  const replay = await params.transaction.findIdempotency({
    companyId: params.companyId,
    idempotencyKey: params.idempotencyKey,
    ...(params.operation === undefined ? {} : { operation: params.operation }),
  })
  if (replay === null) return null
  if (replay.fingerprint !== params.fingerprint) {
    throw new OccurrenceConversationIdempotencyKeyReusedError()
  }
  return replay.response
}

/** A prontidão confere só a configuração: chave aceita e remetente verificado. Sem ela e sem sandbox, recusa. */
export async function resolveMailReadiness(params: {
  readonly companyId: string
  readonly sandbox: OccurrenceMailSandbox | undefined
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<OccurrenceMailReadiness> {
  const readiness = resolveMailSendReadiness({
    settings: await params.transaction.findMailSettings({ companyId: params.companyId }),
  })
  if (!readiness.ready && params.sandbox === undefined) {
    throw createMailSendReadinessError(readiness.reason)
  }
  return readiness
}

/** Os contatos da contratante viram o `To`: sem nenhum, ou com endereço inseguro, é 409. */
export async function resolveMailRecipients(params: {
  readonly companyId: string
  readonly contactIds: readonly string[]
  readonly contractorId: string
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<string[]> {
  const { contactIds } = params
  const contacts = await params.transaction.findOccurrenceContacts({
    companyId: params.companyId,
    contactIds,
    contractorId: params.contractorId,
  })
  const emailById = new Map(contacts.map((contact) => [contact.id, contact.email]))
  const toAddresses = contactIds.map((id) => emailById.get(id))
  if (
    contactIds.length === 0 ||
    toAddresses.some((email) => email === undefined || UNSAFE_EMAIL_CHARACTERS.test(email))
  ) {
    throw new OccurrenceConversationNoRecipientError()
  }
  return deduplicateRecipients(toAddresses as readonly string[])
}

/** A cópia da 267: quem acompanha a contratante e o tipo, menos quem o operador tirou. */
export function resolveMailCc(params: {
  readonly automatic: boolean
  readonly companyId: string
  readonly contractorId: string
  readonly excludedUserIds: readonly string[]
  readonly logger: MailCopyLogger | undefined
  readonly occurrenceTypeId: null | string
  readonly recipients: readonly string[]
  readonly transaction: OccurrenceMailTransactionPort
}) {
  const { transaction, ...rest } = params
  return resolveMailCopy({
    ...rest,
    loadCandidates: (query) => transaction.loadWatcherCandidates(query),
  })
}

/** Sandbox: ninguém responde pelo Mailpit; o hash existe só porque a thread o exige, único e opaco. */
function createSandboxDelivery(sandbox: OccurrenceMailSandbox): OccurrenceMailDelivery {
  return {
    fromAddress: sandbox.fromAddress,
    replyTokenHash: hashReplyToken(crypto.randomUUID()),
    transport: 'sandbox_smtp',
  }
}

async function createResendDelivery(params: {
  readonly companyId: string
  readonly secretService: ContractorMailCredentialSecretService
  readonly settings: {
    readonly id: string
    readonly secretEnvelope: unknown
    readonly senderAddress: string
  }
  readonly threadId: string
}): Promise<OccurrenceMailDelivery> {
  const { companyId, settings, threadId } = params
  const secret = await params.secretService.decrypt({
    companyId,
    envelope: settings.secretEnvelope as SecretEnvelopeV1,
    settingsId: settings.id,
  })
  return {
    fromAddress: settings.senderAddress,
    replyTokenHash: hashReplyToken(
      deriveReplyToken({ companyId, replyTokenSecret: secret.replyTokenSecret, threadId }),
    ),
    transport: 'resend',
  }
}

/**
 * A conversa da contratante (criada na primeira vez), a trava da thread da ocorrência, a thread existente
 * (ou o id da que será criada) e o transporte: Resend pronto → o token derivado; senão o sandbox.
 */
export async function prepareMailDelivery(params: {
  /** Spec 287: `client` usa a conversa de e-mail do cliente e o fio dele; o padrão é a contratante. */
  readonly client?: { readonly taxId: string }
  readonly companyId: string
  readonly contractorId: string
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceConversationKind
  readonly readiness: OccurrenceMailReadiness
  readonly sandbox: OccurrenceMailSandbox | undefined
  readonly secretService: ContractorMailCredentialSecretService
  readonly transaction: OccurrenceMailTransactionPort
}) {
  const { companyId, occurrenceId, occurrenceKind, transaction } = params
  const audience = params.client === undefined ? undefined : ('client' as const)
  const conversation =
    params.client === undefined
      ? await transaction.findOrCreateContractorConversation({
          companyId,
          contractorId: params.contractorId,
          occurrenceId,
          occurrenceKind,
          publicRef: createPublicRef(),
        })
      : await transaction.findOrCreateClientEmailConversation({
          clientTaxId: params.client.taxId,
          companyId,
          occurrenceId,
        })
  await transaction.lockOccurrenceThread({
    companyId,
    occurrenceId,
    occurrenceKind: audience === undefined ? occurrenceKind : `client-${occurrenceKind}`,
  })
  const existingThread = await transaction.findOccurrenceThread({
    ...(audience === undefined ? {} : { audience }),
    companyId,
    occurrenceId,
    occurrenceKind,
  })
  const threadId = existingThread?.id ?? crypto.randomUUID()
  const { readiness } = params
  const delivery = readiness.ready
    ? await createResendDelivery({
        companyId,
        secretService: params.secretService,
        settings: readiness.settings,
        threadId,
      })
    : createSandboxDelivery(params.sandbox as OccurrenceMailSandbox)
  return { conversation, delivery, existingThread, threadId }
}

/**
 * Grava o e-mail (143) com o outbox, a mensagem da conversa `queued` que aponta para ele, os anexos do
 * operador (bytes que não conferem desfazem tudo) e a resposta idempotente. O aviso automático não leva
 * anexo: anexo é sempre de quem pediu o upload.
 */
export async function recordMailDelivery(params: {
  readonly actorUserId: null | string
  readonly attachmentIds: readonly string[]
  readonly automatic: boolean
  readonly bodyHtml: string
  readonly bodyText: string
  readonly ccAddresses: readonly string[]
  readonly companyId: string
  readonly contractorId: string
  readonly conversationId: string
  readonly correlationId: string
  readonly delivery: OccurrenceMailDelivery
  readonly fingerprint: string
  readonly fromDisplayName: null | string
  readonly hasInlineLogo: boolean
  readonly idempotencyKey: string
  readonly messageText: string
  readonly notificationTemplate: null | OccurrenceNotificationTemplate
  readonly now: Date
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceConversationKind
  readonly recipients: readonly string[]
  readonly storage: ConversationAttachmentStoragePort
  readonly subject: string
  /** Spec 287: `client` grava o fio do cliente. */
  readonly threadAudience?: 'client'
  readonly threadExists: boolean
  readonly threadId: string
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<{
  readonly recorded: { readonly messageId: string }
  readonly response: SendOccurrenceMailResult
}> {
  const { companyId, transaction } = params
  const recorded = await transaction.recordMail({
    actorUserId: params.actorUserId,
    bodyHtml: params.bodyHtml,
    bodyText: params.bodyText,
    ccAddresses: params.ccAddresses,
    companyId,
    contractorId: params.contractorId,
    correlationId: params.correlationId,
    createThread: !params.threadExists,
    fromAddress: params.delivery.fromAddress,
    fromDisplayName: params.fromDisplayName,
    hasInlineLogo: params.hasInlineLogo,
    occurrenceId: params.occurrenceId,
    occurrenceKind: params.occurrenceKind,
    replyTokenHash: params.delivery.replyTokenHash,
    notificationTemplate: params.notificationTemplate,
    subject: params.subject,
    ...(params.threadAudience === undefined ? {} : { threadAudience: params.threadAudience }),
    threadId: params.threadId,
    toAddresses: params.recipients,
    transport: params.delivery.transport,
  })
  const conversationMessage = await transaction.recordConversationMessage({
    authorUserId: params.actorUserId,
    ...(params.automatic ? { automatic: true } : {}),
    bodyText: params.messageText,
    companyId,
    conversationId: params.conversationId,
    mailMessageId: recorded.messageId,
    queuedAt: params.now.toISOString(),
  })
  /** O anexo liga à mensagem **da conversa**; o worker o acha pela `mail_message_id` dela ao montar o envio. */
  if (params.actorUserId !== null) {
    await attachConversationUploads({
      messageId: conversationMessage.id,
      now: params.now,
      storage: params.storage,
      target: {
        channel: 'email',
        companyId,
        occurrenceId: params.occurrenceId,
        occurrenceKind: params.occurrenceKind,
        participant: 'contractor',
        requestedByUserId: params.actorUserId,
      },
      transaction: transaction.attachments,
      uploadIds: params.attachmentIds,
    })
  }
  const response: SendOccurrenceMailResult = {
    conversationId: params.conversationId,
    conversationMessageId: conversationMessage.id,
    mailMessageId: recorded.messageId,
    recipientCount: params.recipients.length,
    threadId: params.threadId,
  }
  return { recorded, response }
}

/** Grava a resposta idempotente (a última escrita da transação). */
export function saveMailReplay(params: {
  readonly companyId: string
  readonly fingerprint: string
  readonly idempotencyKey: string
  readonly operation?: string
  readonly response: SendOccurrenceMailResult
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<void> {
  return params.transaction.saveIdempotency({
    companyId: params.companyId,
    fingerprint: params.fingerprint,
    idempotencyKey: params.idempotencyKey,
    ...(params.operation === undefined ? {} : { operation: params.operation }),
    response: params.response,
  })
}
