/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF9–RF12 (T4.7): o operador leva o boleto da contratante ao e-mail do cliente da nota ou a um
 * endereço informado. Um e-mail por vez, o anexo escolhido (ou o aceito do retorno) como arquivo, sem
 * thread de conversa e sem token de resposta — a resposta de quem recebe nunca cai na conversa da
 * contratante. A entrega fica em `occurrence_contractor_reply_deliveries`; o worker manda e fecha o estado.
 *
 * O endereço nunca sai da API em claro: a resposta e o log levam só a forma mascarada.
 */
import { createHash } from 'node:crypto'

import { createMailSendReadinessError } from '../../contractor-mail/domain/contractor-mail.error.js'
import { resolveMailSendReadiness } from '../../contractor-mail/domain/mail-send-readiness.policy.js'
import {
  CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE,
  type ContractorReplyDeliveryReason,
} from '../../shared/occurrence-contractor-reply.constant.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { contractorReplyConfigurationSchema } from '../domain/contractor-reply-configuration.policy.js'
import { parseContractorReplyEmailAddress } from '../domain/contractor-reply-email-address.policy.js'
import {
  ContractorReplyEmailAddressInvalidError,
  ContractorReplyEmailAttachmentNotFoundError,
  ContractorReplyEmailForwardDisabledError,
  ContractorReplyEmailLimitReachedError,
} from '../domain/contractor-reply-email.error.js'
import { CONVERSATION_ATTACHMENT_LIMITS } from '../domain/conversation-attachment.policy.js'
import { OccurrenceConversationIdempotencyKeyReusedError } from '../domain/occurrence-conversation.error.js'
import { buildOccurrenceMail } from '../domain/occurrence-mail.template.js'
import type {
  ContractorReplyEmailDeliveryRecord,
  ContractorReplyEmailTarget,
  ContractorReplyEmailTransactionPort,
  ContractorReplyEmailUnitOfWorkPort,
} from './forward-contractor-reply-by-email.port.js'

/** Chave de entrega: o alvo e o resumo de (retorno, chave do cliente) — cabe nos 120 caracteres da coluna. */
const IDEMPOTENCY_DIGEST_LENGTH = 32
const WHITESPACE_RUN = /\s+/gu

export type ForwardContractorReplyByEmailLogger = {
  info(event: string, fields?: Record<string, unknown>): void
}

export type ForwardContractorReplyByEmailInput = {
  readonly actorUserId: string
  /** Só no alvo `informed_email`; no alvo da nota o endereço vem da nota, nunca do corpo. */
  readonly address?: string
  readonly attachmentId?: string
  readonly companyId: string
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly occurrenceId: string
  readonly target: ContractorReplyEmailTarget
}

export type ForwardContractorReplyByEmailOutcome =
  | { readonly addressMasked: string; readonly deliveryId: string; readonly kind: 'queued' }
  | {
      readonly addressMasked: null | string
      readonly deliveryId: string
      readonly kind: 'already_queued'
    }
  | {
      readonly deliveryId: string
      readonly kind: 'failed' | 'skipped'
      readonly reason: ContractorReplyDeliveryReason
    }

export type ForwardContractorReplyByEmailUseCase = Readonly<{
  forward: (
    input: ForwardContractorReplyByEmailInput,
  ) => Promise<ForwardContractorReplyByEmailOutcome>
}>

function deriveDeliveryKey(params: {
  readonly clientKey: string
  readonly replyId: string
  readonly target: ContractorReplyEmailTarget
}): string {
  const digest = createHash('sha256')
    .update(`${params.replyId}:${params.clientKey}`)
    .digest('hex')
    .slice(0, IDEMPOTENCY_DIGEST_LENGTH)
  return `${params.target}:${digest}`
}

function resolveInformedAddress(input: ForwardContractorReplyByEmailInput): null | string {
  if (input.target !== 'informed_email') return null
  const address = parseContractorReplyEmailAddress(input.address ?? '')
  if (address === null) throw new ContractorReplyEmailAddressInvalidError()
  return address
}

function replayOutcome(
  existing: ContractorReplyEmailDeliveryRecord,
): ForwardContractorReplyByEmailOutcome {
  if (existing.status === 'skipped' || existing.status === 'failed') {
    return {
      deliveryId: existing.id,
      kind: existing.status,
      reason: existing.reason ?? 'send_failed',
    }
  }
  return {
    addressMasked: existing.address === null ? null : maskEmailAddress(existing.address),
    deliveryId: existing.id,
    kind: 'already_queued',
  }
}

function assertSameRequest(params: {
  readonly address: null | string
  readonly attachmentId: string
  readonly existing: ContractorReplyEmailDeliveryRecord
}): void {
  const { address, attachmentId, existing } = params
  if (existing.attachmentId !== attachmentId) {
    throw new OccurrenceConversationIdempotencyKeyReusedError()
  }
  if (address !== null && existing.address?.toLowerCase() !== address.toLowerCase()) {
    throw new OccurrenceConversationIdempotencyKeyReusedError()
  }
}

function readForwardTexts(params: {
  readonly config: unknown
  readonly target: ContractorReplyEmailTarget
}): { readonly body: string; readonly subject: string } {
  const parsed = contractorReplyConfigurationSchema.safeParse(params.config)
  if (!parsed.success) throw new ContractorReplyEmailForwardDisabledError()
  const configuration = parsed.data
  const mode =
    params.target === 'informed_email'
      ? configuration.forwardToInformedEmail
      : configuration.forwardToNoteRecipient
  const subject = configuration.forwardEmailSubject.replace(WHITESPACE_RUN, ' ').trim()
  const body = configuration.forwardEmailBody.trim()
  if (mode === 'off' || subject === '' || body === '') {
    throw new ContractorReplyEmailForwardDisabledError()
  }
  return { body, subject }
}

async function resolveAddress(params: {
  readonly informedAddress: null | string
  readonly occurrenceId: string
  readonly companyId: string
  readonly transaction: ContractorReplyEmailTransactionPort
}): Promise<null | string> {
  if (params.informedAddress !== null) return params.informedAddress
  const noteAddress = await params.transaction.findNoteRecipientEmail({
    companyId: params.companyId,
    occurrenceId: params.occurrenceId,
  })
  if (noteAddress === null) return null
  return parseContractorReplyEmailAddress(noteAddress)
}

export function createForwardContractorReplyByEmailUseCase(dependencies: {
  readonly logger?: ForwardContractorReplyByEmailLogger
  readonly unitOfWork: ContractorReplyEmailUnitOfWorkPort
}): ForwardContractorReplyByEmailUseCase {
  return {
    async forward(input) {
      const informedAddress = resolveInformedAddress(input)
      const outcome = await dependencies.unitOfWork.execute((transaction) =>
        executeForward({ informedAddress, input, transaction }),
      )
      dependencies.logger?.info('occurrence_contractor_reply_email_forward', {
        addressMasked: 'addressMasked' in outcome ? outcome.addressMasked : null,
        kind: outcome.kind,
        occurrenceId: input.occurrenceId,
        target: input.target,
      })
      return outcome
    },
  }
}

async function executeForward(params: {
  readonly informedAddress: null | string
  readonly input: ForwardContractorReplyByEmailInput
  readonly transaction: ContractorReplyEmailTransactionPort
}): Promise<ForwardContractorReplyByEmailOutcome> {
  const { informedAddress, input, transaction } = params
  const { companyId, occurrenceId, target } = input

  const reply = await transaction.lockReply({ companyId, occurrenceId })
  if (reply === null) throw new TripOccurrenceNotFoundError()
  const texts = readForwardTexts({ config: reply.config, target })

  const attachmentId = input.attachmentId ?? reply.replyAttachmentId
  if (attachmentId === null) throw new ContractorReplyEmailAttachmentNotFoundError()
  const attachment = await transaction.findAttachment({ attachmentId, companyId, occurrenceId })
  if (attachment === null) throw new ContractorReplyEmailAttachmentNotFoundError()

  const idempotencyKey = deriveDeliveryKey({
    clientKey: input.idempotencyKey,
    replyId: reply.id,
    target,
  })
  const existing = await transaction.findDeliveryByKey({ companyId, idempotencyKey })
  if (existing !== null) {
    assertSameRequest({ address: informedAddress, attachmentId, existing })
    return replayOutcome(existing)
  }

  const sentCount = await transaction.countEmailDeliveries({ companyId, replyId: reply.id })
  if (sentCount >= CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE) {
    throw new ContractorReplyEmailLimitReachedError()
  }

  const address = await resolveAddress({ companyId, informedAddress, occurrenceId, transaction })
  const record = {
    actorUserId: input.actorUserId,
    attachmentId,
    companyId,
    idempotencyKey,
    replyId: reply.id,
    target,
  }
  if (address === null) {
    const skipped = await transaction.recordDelivery({
      ...record,
      address: null,
      mailMessageId: null,
      reason: 'note_without_recipient_email',
      status: 'skipped',
    })
    return { deliveryId: skipped.id, kind: 'skipped', reason: 'note_without_recipient_email' }
  }

  if (attachment.sizeBytes > CONVERSATION_ATTACHMENT_LIMITS.email.document) {
    const failed = await transaction.recordDelivery({
      ...record,
      address,
      mailMessageId: null,
      reason: 'attachment_too_large_for_email',
      status: 'failed',
    })
    return { deliveryId: failed.id, kind: 'failed', reason: 'attachment_too_large_for_email' }
  }

  const readiness = resolveMailSendReadiness({
    settings: await transaction.findMailSettings({ companyId }),
  })
  if (!readiness.ready) throw createMailSendReadinessError(readiness.reason)

  const threadId = await transaction.findOccurrenceThreadId({
    companyId,
    occurrenceId,
    occurrenceKind: reply.occurrenceKind,
  })
  if (threadId === undefined) throw new TripOccurrenceNotFoundError()

  const mail = buildOccurrenceMail({
    bodyText: texts.body,
    carrierName: (await transaction.findCarrierName({ companyId })) ?? '',
    operatorName: '',
    subject: texts.subject,
  })
  const recorded = await transaction.recordMail({
    actorUserId: input.actorUserId,
    bodyHtml: mail.html,
    bodyText: mail.text,
    companyId,
    correlationId: input.correlationId,
    fromAddress: readiness.settings.senderAddress,
    subject: mail.subject,
    threadId,
    toAddress: address,
  })
  const queued = await transaction.recordDelivery({
    ...record,
    address,
    mailMessageId: recorded.messageId,
    reason: null,
    status: 'queued',
  })
  return { addressMasked: maskEmailAddress(address), deliveryId: queued.id, kind: 'queued' }
}
