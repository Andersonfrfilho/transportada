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
  OccurrenceConversationContractorUnknownError,
  OccurrenceConversationIdempotencyKeyReusedError,
  OccurrenceConversationMailInvalidError,
  OccurrenceConversationNoRecipientError,
} from '../domain/occurrence-conversation.error.js'
import { buildOccurrenceMail } from '../domain/occurrence-mail.template.js'
import type {
  OccurrenceMailTransactionPort,
  OccurrenceMailUnitOfWorkPort,
  SendOccurrenceMailResult,
} from './occurrence-mail.port.js'

const ENCODER = new TextEncoder()
/** RF12 da 150: caractere que injetaria cabeçalho ou trocaria o destinatário no `to` do gateway. */
const UNSAFE_EMAIL_CHARACTERS = /[\r\n,<>]/u
/** RF21: 144 bits aleatórios em base64url — opaco, sem o id interno. */
const PUBLIC_REF_BYTES = 18

export type SendOccurrenceMailInput = {
  readonly actorUserId: string
  readonly bodyText: string
  readonly companyId: string
  readonly contactIds: readonly string[]
  readonly correlationId: string
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

/** Mesma regra do worker: minúsculas, primeira ocorrência vence. */
function deduplicateRecipients(addresses: readonly string[]): string[] {
  return [...new Set(addresses.map((address) => address.toLowerCase()))]
}

export function createSendOccurrenceMailUseCase(dependencies: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly now?: () => Date
  readonly secretService: ContractorMailCredentialSecretService
  readonly unitOfWork: OccurrenceMailUnitOfWorkPort
}): SendOccurrenceMailUseCase {
  const now = dependencies.now ?? (() => new Date())
  return {
    send: async (input) => {
      assertMailContent(input)
      return dependencies.unitOfWork.execute((transaction) =>
        executeSend({ ...dependencies, input, now: now(), transaction }),
      )
    },
  }
}

async function executeSend(params: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly input: SendOccurrenceMailInput
  readonly now: Date
  readonly secretService: ContractorMailCredentialSecretService
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
      input.subject.trim(),
      input.bodyText.trim(),
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

  /**
   * O modelo do e-mail de ocorrência é o texto do tipo (spec 079) mais o que o operador escreveu —
   * não um `contractor_mail_templates` da 150. Sem `template`, a prontidão confere só a
   * configuração: chave aceita e remetente verificado.
   */
  const readiness = resolveMailSendReadiness({
    settings: await transaction.findMailSettings({ companyId }),
  })
  if (!readiness.ready) throw createMailSendReadinessError(readiness.reason)
  const { settings } = readiness

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

  const [carrierName, operatorName] = await Promise.all([
    transaction.findCarrierName({ companyId }),
    transaction.findOperatorName({ companyId, userId: input.actorUserId }),
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
  const existingThread = await transaction.findOccurrenceThread({
    companyId,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
  })
  const threadId = existingThread?.id ?? crypto.randomUUID()
  const secret = await params.secretService.decrypt({
    companyId,
    envelope: settings.secretEnvelope as SecretEnvelopeV1,
    settingsId: settings.id,
  })
  const replyTokenHash = hashReplyToken(
    deriveReplyToken({ companyId, replyTokenSecret: secret.replyTokenSecret, threadId }),
  )

  const recorded = await transaction.recordMail({
    actorUserId: input.actorUserId,
    bodyHtml: mail.html,
    bodyText: mail.text,
    companyId,
    contractorId,
    correlationId: input.correlationId,
    createThread: existingThread === undefined,
    fromAddress: settings.senderAddress,
    occurrenceId: input.occurrenceId,
    occurrenceKind: target.kind,
    replyTokenHash,
    subject: mail.subject,
    threadId,
    toAddresses: recipients,
  })
  const conversationMessage = await transaction.recordConversationMessage({
    authorUserId: input.actorUserId,
    bodyText: input.bodyText.trim(),
    companyId,
    conversationId: conversation.id,
    mailMessageId: recorded.messageId,
    queuedAt: params.now.toISOString(),
  })

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
