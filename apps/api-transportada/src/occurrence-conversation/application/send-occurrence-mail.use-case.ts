/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T403 (RF7, P4; absorve a 143 T015): o e-mail da conversa com a contratante. Uma transação
 * só grava a conversa (na primeira vez), a thread da 143 com o hash do token de resposta (na primeira
 * vez), a mensagem da 143 com o evento de envio no outbox e a mensagem da conversa `queued` que aponta
 * para ela. A segunda mensagem é resposta: mesma conversa, mesma thread — e o worker já manda
 * `In-Reply-To` pela última recebida, então ela cai na mesma conversa da caixa da contratante.
 *
 * ⚠️ **A conversa não decide** (D4): nada aqui toca a tratativa, a taxa ou o acerto da 164.
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
import { resolveMailSendReadiness } from '../../contractor-mail/domain/mail-send-readiness.policy.js'
import {
  deriveReplyToken,
  hashReplyToken,
} from '../../contractor-mail/domain/reply-token.policy.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import {
  OCCURRENCE_MAIL_LIMITS,
  SEND_OCCURRENCE_MAIL_OPERATION,
} from '../domain/occurrence-conversation.constant.js'
import {
  ContractorReplyNotResendableError,
  ContractorReplyResendTooSoonError,
  OccurrenceConversationContractorUnknownError,
  OccurrenceConversationIdempotencyKeyReusedError,
  OccurrenceConversationMailInvalidError,
  OccurrenceConversationNoRecipientError,
  OccurrenceMailTemplateMissingError,
} from '../domain/occurrence-conversation.error.js'
import { buildOccurrenceMail } from '../domain/occurrence-mail.template.js'
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import { openContractorReplyWhenConfigured } from './open-contractor-reply.service.js'
import type { OpenContractorReplyLogger } from './open-contractor-reply.service.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import { attachConversationUploads } from './conversation-attachment.service.js'
import type {
  OccurrenceMailTransactionPort,
  OccurrenceMailUnitOfWorkPort,
  OccurrenceNotificationTemplate,
  SendOccurrenceMailResult,
} from './occurrence-mail.port.js'

const ENCODER = new TextEncoder()
/** RF12 da 150: caractere que injetaria cabeçalho ou trocaria o destinatário no `to` do gateway. */
const UNSAFE_EMAIL_CHARACTERS = /[\r\n,<>]/u
/** RF21: 144 bits aleatórios em base64url — opaco, sem o id interno. */
const PUBLIC_REF_BYTES = 18

export type SendOccurrenceMailInput = {
  /**
   * Quem escreveu. `null` só com `automatic`: o aviso que o tipo da ocorrência manda sozinho
   * (spec 183 T802), sem autor humano — nunca um envio manual anônimo.
   */
  readonly actorUserId: null | string
  readonly automatic?: boolean
  /** Spec 183 T702e: os arquivos que o operador subiu pelo canal e-mail. */
  readonly attachmentIds?: readonly string[]
  readonly bodyText: string
  readonly companyId: string
  readonly contactIds: readonly string[]
  /**
   * Spec 248 RF6: o reenvio do pedido à contratante. Dentro da transação do e-mail, trava o retorno,
   * confere que ele espera a contratante e que o intervalo do alarme passou, e grava o evento `user`.
   */
  readonly contractorReplyResend?: boolean
  readonly correlationId: string
  /** Spec 267 RF4: quem o operador tirou da cópia neste envio. Só remove: id fora da lista efetiva é ignorado. */
  readonly excludedWatcherUserIds?: readonly string[]
  readonly idempotencyKey: string
  readonly occurrenceId: string
  readonly subject: string
}

export type SendOccurrenceMailUseCase = Readonly<{
  send: (input: SendOccurrenceMailInput) => Promise<SendOccurrenceMailResult>
}>

export function createPublicRef(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(PUBLIC_REF_BYTES))).toString('base64url')
}

function assertMailContent(input: SendOccurrenceMailInput): void {
  const subject = input.subject.trim()
  const body = input.bodyText.trim()
  if (
    subject === '' ||
    body === '' ||
    subject.length > OCCURRENCE_MAIL_LIMITS.subject ||
    body.length > OCCURRENCE_MAIL_LIMITS.body
  ) {
    throw new OccurrenceConversationMailInvalidError()
  }
}

export type OccurrenceMailLogger = OpenContractorReplyLogger & MailCopyLogger

/** Só entra na impressão digital quando alguém saiu da cópia: sem isso, o hash de antes da 267 segue valendo. */
function excludedFingerprintFields(excluded: readonly string[] | undefined): string[] {
  const unique = [...new Set(excluded ?? [])].sort()
  return unique.length === 0 ? [] : [`excluded:${unique.join(',')}`]
}

/** Mesma regra do worker: minúsculas, primeira ocorrência vence. */
function deduplicateRecipients(addresses: readonly string[]): string[] {
  return [...new Set(addresses.map((address) => address.toLowerCase()))]
}

/**
 * Spec 268: o modo sandbox do ambiente (`CONTRACTOR_MAIL_SANDBOX_SMTP`, nunca em produção). Presente, uma
 * empresa sem o Resend pronto não é recusada: a mensagem é gravada para o SMTP do worker, de `fromAddress`.
 */
export type OccurrenceMailSandbox = { readonly fromAddress: string }

type OccurrenceMailDelivery = {
  readonly fromAddress: string
  readonly replyTokenHash: string
  readonly transport: ContractorMailTransport
}

export function createSendOccurrenceMailUseCase(dependencies: {
  readonly contractorMailSandbox?: OccurrenceMailSandbox
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly logger?: OccurrenceMailLogger
  readonly now?: () => Date
  readonly secretService: ContractorMailCredentialSecretService
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: OccurrenceMailUnitOfWorkPort
}): SendOccurrenceMailUseCase {
  const now = dependencies.now ?? (() => new Date())
  return {
    send: async (input) => {
      if ((input.actorUserId === null) !== (input.automatic === true)) {
        throw new Error('OCCURRENCE_MAIL_AUTHOR_REQUIRED')
      }
      if (input.contractorReplyResend === true && input.automatic === true) {
        throw new Error('OCCURRENCE_MAIL_RESEND_IS_NOT_AUTOMATIC')
      }
      assertMailContent(input)
      return dependencies.unitOfWork.execute((transaction) =>
        executeSend({ ...dependencies, input, now: now(), transaction }),
      )
    },
  }
}

async function assertContractorReplyResendRecorded(params: {
  readonly actorUserId: string
  readonly companyId: string
  readonly now: Date
  readonly occurrenceId: string
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<void> {
  const { transaction, ...rest } = params
  const outcome = await transaction.recordContractorReplyResend(rest)
  if (outcome === 'not_resendable') throw new ContractorReplyNotResendableError()
  if (outcome === 'too_soon') throw new ContractorReplyResendTooSoonError()
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
 * Spec 271 (ADR-0108, D9): o e-mail da ocorrência sai de um modelo do módulo de notificação, o do tipo. Sem modelo
 * utilizável, 409, nem à mão. O reenvio do retorno da contratante (248) não passa por aqui: continua a conversa que
 * já existe e grava o modelo (chave e versão) da mensagem original, ou nulo.
 */
async function resolveNotificationTemplate(params: {
  readonly input: SendOccurrenceMailInput
  readonly target: { readonly kind: OccurrenceConversationKind }
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<null | OccurrenceNotificationTemplate> {
  const { input, target, transaction } = params
  if (input.contractorReplyResend === true) {
    return transaction.findOriginalOccurrenceNotificationTemplate({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
      occurrenceKind: target.kind,
    })
  }
  const template = await transaction.findOccurrenceNotificationTemplate({
    companyId: input.companyId,
    occurrenceId: input.occurrenceId,
  })
  if (template === null) throw new OccurrenceMailTemplateMissingError()
  return template
}

async function executeSend(params: {
  readonly contractorMailSandbox?: OccurrenceMailSandbox
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly input: SendOccurrenceMailInput
  readonly logger?: OccurrenceMailLogger
  readonly now: Date
  readonly secretService: ContractorMailCredentialSecretService
  readonly storage: ConversationAttachmentStoragePort
  readonly transaction: OccurrenceMailTransactionPort
}): Promise<SendOccurrenceMailResult> {
  const { input, transaction } = params
  const { companyId } = input

  const target = await transaction.findOccurrenceTarget({
    companyId,
    occurrenceId: input.occurrenceId,
  })
  if (target === null) throw new TripOccurrenceNotFoundError()
  if (target.contractorId === null) throw new OccurrenceConversationContractorUnknownError()
  const { contractorId } = target

  const contactIds = [...new Set(input.contactIds)]
  const fingerprint = await params.fingerprintService.create({
    fields: [
      companyId,
      input.occurrenceId,
      [...contactIds].sort().join(','),
      ...excludedFingerprintFields(input.excludedWatcherUserIds),
      input.subject.trim(),
      input.bodyText.trim(),
      (input.attachmentIds ?? []).join(','),
    ].map((value) => ENCODER.encode(value)),
    operation: SEND_OCCURRENCE_MAIL_OPERATION,
  })
  const replay = await transaction.findIdempotency({
    companyId,
    idempotencyKey: input.idempotencyKey,
  })
  if (replay !== null) {
    if (replay.fingerprint !== fingerprint)
      throw new OccurrenceConversationIdempotencyKeyReusedError()
    return replay.response
  }

  /** A prontidão confere só a configuração: chave aceita e remetente verificado. */
  const readiness = resolveMailSendReadiness({
    settings: await transaction.findMailSettings({ companyId }),
  })
  if (!readiness.ready && params.contractorMailSandbox === undefined) {
    throw createMailSendReadinessError(readiness.reason)
  }

  const notificationTemplate = await resolveNotificationTemplate({ input, target, transaction })

  if (input.contractorReplyResend === true && input.actorUserId !== null) {
    await assertContractorReplyResendRecorded({
      actorUserId: input.actorUserId,
      companyId,
      now: params.now,
      occurrenceId: input.occurrenceId,
      transaction,
    })
  }

  const contacts = await transaction.findOccurrenceContacts({ companyId, contactIds, contractorId })
  const emailById = new Map(contacts.map((contact) => [contact.id, contact.email]))
  const toAddresses = contactIds.map((id) => emailById.get(id))
  if (
    contactIds.length === 0 ||
    toAddresses.some((email) => email === undefined || UNSAFE_EMAIL_CHARACTERS.test(email))
  ) {
    throw new OccurrenceConversationNoRecipientError()
  }
  const recipients = deduplicateRecipients(toAddresses as readonly string[])
  const copy = await resolveMailCopy({
    automatic: input.automatic === true,
    companyId,
    contractorId,
    excludedUserIds: input.excludedWatcherUserIds ?? [],
    loadCandidates: (query) => transaction.loadWatcherCandidates(query),
    logger: params.logger,
    recipients,
  })

  const [carrierName, operatorName] = await Promise.all([
    transaction.findCarrierName({ companyId }),
    input.actorUserId === null
      ? Promise.resolve(null)
      : transaction.findOperatorName({ companyId, userId: input.actorUserId }),
  ])
  const mail = buildOccurrenceMail({
    bodyText: input.bodyText,
    carrierName: carrierName ?? '',
    operatorName: operatorName ?? '',
    subject: input.subject,
  })

  const conversation = await transaction.findOrCreateContractorConversation({
    companyId,
    contractorId,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
    publicRef: createPublicRef(),
  })
  await transaction.lockOccurrenceThread({
    companyId,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
  })
  const existingThread = await transaction.findOccurrenceThread({
    companyId,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
  })
  const threadId = existingThread?.id ?? crypto.randomUUID()
  const delivery = readiness.ready
    ? await createResendDelivery({
        companyId,
        secretService: params.secretService,
        settings: readiness.settings,
        threadId,
      })
    : createSandboxDelivery(params.contractorMailSandbox as OccurrenceMailSandbox)

  const recorded = await transaction.recordMail({
    actorUserId: input.actorUserId,
    bodyHtml: mail.html,
    bodyText: mail.text,
    ccAddresses: copy,
    companyId,
    contractorId,
    correlationId: input.correlationId,
    createThread: existingThread === undefined,
    fromAddress: delivery.fromAddress,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
    replyTokenHash: delivery.replyTokenHash,
    notificationTemplate,
    subject: mail.subject,
    threadId,
    toAddresses: recipients,
    transport: delivery.transport,
  })
  const conversationMessage = await transaction.recordConversationMessage({
    authorUserId: input.actorUserId,
    ...(input.automatic === true ? { automatic: true } : {}),
    bodyText: input.bodyText.trim(),
    companyId,
    conversationId: conversation.id,
    mailMessageId: recorded.messageId,
    queuedAt: params.now.toISOString(),
  })
  /**
   * Spec 183 T702e: o anexo liga à mensagem **da conversa**; o worker o acha pela
   * `mail_message_id` dela ao montar o envio. Bytes que não conferem desfazem tudo — nem a
   * mensagem da 143 nem o outbox ficam.
   */
  /** O aviso automático não leva anexo: anexo é sempre de quem pediu o upload. */
  if (input.actorUserId !== null) {
    await attachConversationUploads({
      messageId: conversationMessage.id,
      now: params.now,
      storage: params.storage,
      target: {
        channel: 'email',
        companyId,
        occurrenceId: input.occurrenceId,
        occurrenceKind: target.kind,
        participant: 'contractor',
        requestedByUserId: input.actorUserId,
      },
      transaction: transaction.attachments,
      uploadIds: input.attachmentIds ?? [],
    })
  }

  if (input.automatic === true) {
    await openContractorReplyWhenConfigured({
      companyId,
      contractorId,
      conversationId: conversation.id,
      logger: params.logger,
      now: params.now,
      occurrenceId: input.occurrenceId,
      transaction,
    })
  }

  const response: SendOccurrenceMailResult = {
    conversationId: conversation.id,
    conversationMessageId: conversationMessage.id,
    mailMessageId: recorded.messageId,
    recipientCount: recipients.length,
    threadId,
  }
  await transaction.saveIdempotency({
    companyId,
    fingerprint,
    idempotencyKey: input.idempotencyKey,
    response,
  })
  return response
}
