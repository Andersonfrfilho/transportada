/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF9–RF12 (T4.7): o operador leva o boleto da contratante ao e-mail do cliente da nota ou a um
 * endereço informado. Um e-mail por vez, o anexo escolhido (ou o aceito do retorno) como arquivo, sem
 * thread de conversa e sem token de resposta — a resposta de quem recebe nunca cai na conversa da
 * contratante. A entrega fica em `occurrence_contractor_reply_deliveries`; o worker manda e fecha o estado.
 *
 * Spec 279 T3 (D3/D4): o alvo `client_boleto_emails` leva o mesmo boleto aos e-mails para boleto do cadastro do
 * cliente de entrega (escolhidos por `emailId`) e a um endereço novo, que só entra no cadastro com `save`. Um e-mail
 * por endereço, idempotente por (retorno, anexo, endereço), no mesmo trilho e no mesmo teto por ocorrência.
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
import { DeliveryClientNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import {
  DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
  type DeliveryClientEmailAuthorKind,
  type DeliveryClientEmailPurpose,
} from '../../shared/delivery-client-email.constant.js'
import { resolveClientEmailPurpose } from '../../trips/domain/occurrence-client-email.policy.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { contractorReplyConfigurationSchema } from '../domain/contractor-reply-configuration.policy.js'
import { parseContractorReplyEmailAddress } from '../domain/contractor-reply-email-address.policy.js'
import {
  ContractorReplyClientEmailLimitReachedError,
  ContractorReplyClientTemplateMissingError,
  ContractorReplyClientEmailNotFoundError,
  ContractorReplyEmailAddressInvalidError,
  ContractorReplyEmailAttachmentNotFoundError,
  ContractorReplyEmailDeliveryNotFoundError,
  ContractorReplyEmailForwardDisabledError,
  ContractorReplyEmailLimitReachedError,
  ContractorReplyEmailRetryNotAllowedError,
} from '../domain/contractor-reply-email.error.js'
import { CONVERSATION_ATTACHMENT_LIMITS } from '../domain/conversation-attachment.policy.js'
import { OccurrenceConversationIdempotencyKeyReusedError } from '../domain/occurrence-conversation.error.js'
import { buildOccurrenceMail } from '../domain/occurrence-mail.template.js'
import type {
  ContractorReplyClientEmail,
  ContractorReplyEmailDeliveryRecord,
  ContractorReplyEmailReply,
  ContractorReplyEmailTarget,
  ContractorReplyEmailTransactionPort,
  ContractorReplyEmailUnitOfWorkPort,
  RecordContractorReplyMailParams,
} from './forward-contractor-reply-by-email.port.js'

/** Chave de entrega: o alvo e o resumo de (retorno, chave do cliente) — cabe nos 120 caracteres da coluna. */
const IDEMPOTENCY_DIGEST_LENGTH = 32

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
  readonly target: Exclude<ContractorReplyEmailTarget, typeof CLIENT_TARGET>
}

const CLIENT_TARGET = 'client_boleto_emails'

/** Spec 279 T3 (RF3/RF4): os e-mails guardados por `emailId` e, no máximo, um endereço novo. */
export type ForwardContractorReplyToClientInput = {
  readonly actorUserId: string
  /** O endereço novo; com `save`, entra no cadastro do cliente, no tipo de e-mail que o tipo da ocorrência usa. */
  readonly address?: string
  readonly attachmentId?: string
  /** Quem guarda: o escritório pelo painel, o motorista pelo app (T4). */
  readonly authorKind: DeliveryClientEmailAuthorKind
  readonly companyId: string
  readonly correlationId: string
  readonly emailIds: readonly string[]
  readonly idempotencyKey: string
  readonly occurrenceId: string
  readonly save: boolean
}

/** Spec 279 T6b (RF12): "Tentar de novo" de uma entrega que o provedor recusou; o endereço e o anexo vêm dela. */
export type RetryContractorReplyToClientInput = {
  readonly actorUserId: string
  readonly authorKind: DeliveryClientEmailAuthorKind
  readonly companyId: string
  readonly correlationId: string
  readonly deliveryId: string
  readonly occurrenceId: string
}

export type ForwardContractorReplyToClientResult = {
  readonly addressMasked: string
  readonly deliveryId: string
  /** O e-mail do cadastro; `null` no endereço novo que não foi guardado. */
  readonly emailId: null | string
  readonly kind: 'already_queued' | 'failed' | 'queued' | 'skipped'
  readonly reason: ContractorReplyDeliveryReason | null
}

export type ForwardContractorReplyToClientOutcome = {
  readonly results: readonly ForwardContractorReplyToClientResult[]
  /** O id do endereço novo no cadastro, quando `save` o guardou (ou ele já estava lá). */
  readonly savedEmailId: null | string
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
  forwardToClient: (
    input: ForwardContractorReplyToClientInput,
  ) => Promise<ForwardContractorReplyToClientOutcome>
  retryToClient: (
    input: RetryContractorReplyToClientInput,
  ) => Promise<ForwardContractorReplyToClientOutcome>
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

/**
 * Quem liga cada alvo. O do cadastro do cliente é ligado pelo `client_email_type` do tipo (RF9, conferido antes, com
 * `409 OCCURRENCE_CLIENT_EMAIL_OFF`); da cópia do retorno ele só exige o texto do e-mail (248), como os outros.
 */
function resolveForwardMode(params: {
  readonly configuration: {
    readonly forwardToInformedEmail: string
    readonly forwardToNoteRecipient: string
  }
  readonly target: ContractorReplyEmailTarget
}): string {
  const { configuration, target } = params
  if (target === 'informed_email') return configuration.forwardToInformedEmail
  if (target === 'note_recipient_email') return configuration.forwardToNoteRecipient
  return 'manual'
}

/**
 * Spec 286 T3: o alvo ligado na cópia do retorno (248) e o texto do canal, do modelo do módulo de notificação escolhido
 * no tipo — ou o texto livre antigo, enquanto o tipo não escolheu modelo. Sem texto utilizável o canal não sai (409).
 */
export async function resolveForwardTexts(params: {
  readonly channel: 'email' | 'whatsapp'
  readonly companyId: string
  readonly occurrenceId: string
  readonly reply: ContractorReplyEmailReply
  readonly target: ContractorReplyEmailTarget
  readonly transaction: Pick<ContractorReplyEmailTransactionPort, 'resolveClientTexts'>
}): Promise<{ readonly body: string; readonly subject: string }> {
  const parsed = contractorReplyConfigurationSchema.safeParse(params.reply.config)
  if (!parsed.success) throw new ContractorReplyEmailForwardDisabledError()
  if (resolveForwardMode({ configuration: parsed.data, target: params.target }) === 'off') {
    throw new ContractorReplyEmailForwardDisabledError()
  }
  const found = await params.transaction.resolveClientTexts({
    channel: params.channel,
    companyId: params.companyId,
    config: params.reply.config,
    occurrenceId: params.occurrenceId,
  })
  if (found.kind === 'template_missing') {
    if (found.legacy) throw new ContractorReplyEmailForwardDisabledError()
    throw new ContractorReplyClientTemplateMissingError()
  }
  return found.texts
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

    async forwardToClient(input) {
      const newAddress = resolveClientNewAddress(input)
      const outcome = await dependencies.unitOfWork.execute((transaction) =>
        executeForwardToClient({ input, newAddress, retry: false, transaction }),
      )
      dependencies.logger?.info('occurrence_contractor_reply_email_forward', {
        addressesMasked: outcome.results.map((result) => result.addressMasked),
        kinds: outcome.results.map((result) => result.kind),
        occurrenceId: input.occurrenceId,
        saved: outcome.savedEmailId !== null,
        target: CLIENT_TARGET,
      })
      return outcome
    },

    async retryToClient(input) {
      const outcome = await dependencies.unitOfWork.execute((transaction) =>
        executeForwardToClient({ input, newAddress: null, retry: true, transaction }),
      )
      dependencies.logger?.info('occurrence_contractor_reply_email_retry', {
        addressesMasked: outcome.results.map((result) => result.addressMasked),
        kinds: outcome.results.map((result) => result.kind),
        occurrenceId: input.occurrenceId,
        target: CLIENT_TARGET,
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
  const texts = await resolveForwardTexts({
    channel: 'email',
    companyId,
    occurrenceId,
    reply,
    target,
    transaction,
  })

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

function resolveClientNewAddress(input: ForwardContractorReplyToClientInput): null | string {
  if (input.address === undefined) return null
  const address = parseContractorReplyEmailAddress(input.address)
  if (address === null) throw new ContractorReplyEmailAddressInvalidError()
  return address
}

/** Spec 279 T6b: o teto de tentativas por endereço; a primeira não conta, e cada "Tentar de novo" ganha a seguinte. */
const CLIENT_DELIVERY_MAX_RETRIES = 5

/**
 * D3: a chave é do (retorno, anexo, endereço) — o mesmo boleto nunca sai duas vezes ao mesmo endereço. A primeira
 * tentativa mantém a chave da T3 (a do envio automático, a do clique repetido e a do app na fila); cada "Tentar de
 * novo" depois de uma recusa do provedor leva o número da tentativa, e assim ganha chave nova sem soltar a antiga.
 */
function deriveClientDeliveryKey(params: {
  readonly address: string
  readonly attachmentId: string
  readonly attempt: number
  readonly replyId: string
}): string {
  const base = `${params.replyId}:${params.attachmentId}:${params.address.toLowerCase()}`
  const digest = createHash('sha256')
    .update(params.attempt === 0 ? base : `${base}:retry:${params.attempt}`)
    .digest('hex')
    .slice(0, IDEMPOTENCY_DIGEST_LENGTH)
  return `${CLIENT_TARGET}:${digest}`
}

function isRetryable(delivery: ContractorReplyEmailDeliveryRecord): boolean {
  return delivery.status === 'failed' && delivery.reason === 'send_failed'
}

/**
 * A última tentativa do endereço. Sem `retry` ela volta como está (replay); com `retry` e recusada pelo provedor, a
 * próxima tentativa é nova (`existing` nulo, chave seguinte) — e a que já está na fila ou saiu volta como está.
 */
async function planClientAttempt(params: {
  readonly address: string
  readonly attachmentId: string
  readonly companyId: string
  readonly replyId: string
  readonly retry: boolean
  readonly transaction: ContractorReplyEmailTransactionPort
}): Promise<{
  readonly existing: ContractorReplyEmailDeliveryRecord | null
  readonly idempotencyKey: string
}> {
  const { address, attachmentId, companyId, replyId, retry, transaction } = params
  const keyOf = (attempt: number) =>
    deriveClientDeliveryKey({ address, attachmentId, attempt, replyId })
  let attempt = 0
  let latest: { existing: ContractorReplyEmailDeliveryRecord; idempotencyKey: string } | null = null
  while (attempt <= CLIENT_DELIVERY_MAX_RETRIES) {
    const idempotencyKey = keyOf(attempt)
    const existing = await transaction.findDeliveryByKey({ companyId, idempotencyKey })
    if (existing === null) break
    latest = { existing, idempotencyKey }
    attempt += 1
  }
  if (latest === null) return { existing: null, idempotencyKey: keyOf(0) }
  if (!retry || !isRetryable(latest.existing)) return latest
  if (attempt > CLIENT_DELIVERY_MAX_RETRIES) throw new ContractorReplyEmailLimitReachedError()
  return { existing: null, idempotencyKey: keyOf(attempt) }
}

type ClientRecipient = { readonly address: string; readonly emailId: null | string }

function pickSavedEmails(params: {
  readonly emailIds: readonly string[]
  readonly saved: readonly ContractorReplyClientEmail[]
}): readonly ClientRecipient[] {
  return [...new Set(params.emailIds)].map((emailId) => {
    const found = params.saved.find((email) => email.id === emailId)
    if (found === undefined) throw new ContractorReplyClientEmailNotFoundError()
    return { address: found.address, emailId: found.id }
  })
}

async function saveNewAddress(params: {
  readonly address: string
  readonly input: ForwardContractorReplyToClientInput
  readonly purpose: DeliveryClientEmailPurpose
  readonly saved: readonly ContractorReplyClientEmail[]
  readonly taxId: string
  readonly transaction: ContractorReplyEmailTransactionPort
}): Promise<string> {
  const { address, input, purpose, saved, taxId, transaction } = params
  const existing = saved.find((email) => email.address.toLowerCase() === address.toLowerCase())
  if (existing !== undefined) return existing.id
  if (saved.length >= DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE) {
    throw new ContractorReplyClientEmailLimitReachedError()
  }
  const created = await transaction.saveClientEmail({
    actorUserId: input.actorUserId,
    address,
    authorKind: input.authorKind,
    companyId: input.companyId,
    correlationId: input.correlationId,
    occurrenceId: input.occurrenceId,
    purpose,
    taxId,
  })
  return created.id
}

/** Os endereços do envio, sem repetir (sem distinguir caixa), e o id do endereço novo guardado. */
async function resolveClientRecipients(params: {
  readonly input: ForwardContractorReplyToClientInput
  readonly newAddress: null | string
  readonly purpose: DeliveryClientEmailPurpose
  readonly transaction: ContractorReplyEmailTransactionPort
}): Promise<{
  readonly recipients: readonly ClientRecipient[]
  readonly savedEmailId: null | string
}> {
  const { input, newAddress, purpose, transaction } = params
  const needsClient = input.emailIds.length > 0 || input.save
  const taxId = needsClient
    ? await transaction.findDeliveryClientTaxId({
        companyId: input.companyId,
        lock: input.save,
        occurrenceId: input.occurrenceId,
      })
    : null
  if (needsClient && taxId === null) {
    if (input.emailIds.length > 0) throw new ContractorReplyClientEmailNotFoundError()
    throw new DeliveryClientNotFoundError()
  }
  const saved =
    taxId === null
      ? []
      : await transaction.listClientEmails({
          companyId: input.companyId,
          purpose,
          taxId,
        })
  const picked = pickSavedEmails({ emailIds: input.emailIds, saved })
  let savedEmailId: null | string = null
  if (newAddress !== null && input.save && taxId !== null) {
    savedEmailId = await saveNewAddress({
      address: newAddress,
      input,
      purpose,
      saved,
      taxId,
      transaction,
    })
  }
  const all: ClientRecipient[] = [...picked]
  if (newAddress !== null) all.push({ address: newAddress, emailId: savedEmailId })
  const seen = new Set<string>()
  const recipients = all.filter((recipient) => {
    const key = recipient.address.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (recipients.length === 0) throw new ContractorReplyEmailAddressInvalidError()
  return { recipients, savedEmailId }
}

function toClientResult(params: {
  readonly existing: ContractorReplyEmailDeliveryRecord
  readonly recipient: ClientRecipient
}): ForwardContractorReplyToClientResult {
  const { existing, recipient } = params
  const replayed = replayOutcome(existing)
  return {
    addressMasked: maskEmailAddress(recipient.address),
    deliveryId: existing.id,
    emailId: recipient.emailId,
    kind: replayed.kind,
    reason: 'reason' in replayed ? replayed.reason : null,
  }
}

async function lockClientReply(params: {
  readonly input: ForwardContractorReplyToClientInput
  readonly transaction: ContractorReplyEmailTransactionPort
}): Promise<{
  readonly attachment: { readonly id: string; readonly sizeBytes: number }
  readonly purpose: DeliveryClientEmailPurpose
  readonly reply: ContractorReplyEmailReply
  readonly texts: { readonly body: string; readonly subject: string }
}> {
  const { input, transaction } = params
  const { companyId, occurrenceId } = input
  const reply = await transaction.lockReply({ companyId, occurrenceId })
  if (reply === null) throw new TripOccurrenceNotFoundError()
  const purpose = resolveClientEmailPurpose(
    await transaction.findClientEmailType({ companyId, occurrenceId }),
  )
  const texts = await resolveForwardTexts({
    channel: 'email',
    companyId,
    occurrenceId,
    reply,
    target: CLIENT_TARGET,
    transaction,
  })
  const attachmentId = input.attachmentId ?? reply.replyAttachmentId
  if (attachmentId === null) throw new ContractorReplyEmailAttachmentNotFoundError()
  const found = await transaction.findAttachment({ attachmentId, companyId, occurrenceId })
  if (found === null) throw new ContractorReplyEmailAttachmentNotFoundError()
  return { attachment: { id: attachmentId, sizeBytes: found.sizeBytes }, purpose, reply, texts }
}

/**
 * O "Tentar de novo": o retorno trava primeiro (é o que serializa as tentativas), a entrega recusada dá o endereço e o
 * anexo, e o resto é o envio de sempre a esse único endereço — sem cadastrar nada e sem mexer nos outros.
 */
async function resolveRetryTarget(params: {
  readonly input: RetryContractorReplyToClientInput
  readonly transaction: ContractorReplyEmailTransactionPort
}): Promise<{ readonly address: string; readonly attachmentId: string }> {
  const { input, transaction } = params
  const { companyId, deliveryId, occurrenceId } = input
  const reply = await transaction.lockReply({ companyId, occurrenceId })
  if (reply === null) throw new TripOccurrenceNotFoundError()
  const failed = await transaction.findDeliveryById({ companyId, deliveryId, replyId: reply.id })
  if (failed === null || failed.target !== CLIENT_TARGET || failed.address === null) {
    throw new ContractorReplyEmailDeliveryNotFoundError()
  }
  if (!isRetryable(failed)) throw new ContractorReplyEmailRetryNotAllowedError()
  return { address: failed.address, attachmentId: failed.attachmentId }
}

async function executeForwardToClient(params: {
  readonly input: ForwardContractorReplyToClientInput | RetryContractorReplyToClientInput
  readonly newAddress: null | string
  readonly retry: boolean
  readonly transaction: ContractorReplyEmailTransactionPort
}): Promise<ForwardContractorReplyToClientOutcome> {
  const { newAddress, retry, transaction } = params
  const retryTarget =
    'deliveryId' in params.input
      ? await resolveRetryTarget({ input: params.input, transaction })
      : null
  const input: ForwardContractorReplyToClientInput =
    'deliveryId' in params.input
      ? {
          actorUserId: params.input.actorUserId,
          address: retryTarget?.address ?? '',
          attachmentId: retryTarget?.attachmentId ?? '',
          authorKind: params.input.authorKind,
          companyId: params.input.companyId,
          correlationId: params.input.correlationId,
          emailIds: [],
          idempotencyKey: params.input.deliveryId,
          occurrenceId: params.input.occurrenceId,
          save: false,
        }
      : params.input
  const { companyId } = input
  const { attachment, purpose, reply, texts } = await lockClientReply({ input, transaction })
  const { recipients, savedEmailId } = await resolveClientRecipients({
    input,
    newAddress: retryTarget === null ? newAddress : retryTarget.address,
    purpose,
    transaction,
  })

  const planned: {
    readonly existing: ContractorReplyEmailDeliveryRecord | null
    readonly idempotencyKey: string
    readonly recipient: ClientRecipient
  }[] = []
  for (const recipient of recipients) {
    const { existing, idempotencyKey } = await planClientAttempt({
      address: recipient.address,
      attachmentId: attachment.id,
      companyId,
      replyId: reply.id,
      retry,
      transaction,
    })
    planned.push({ existing, idempotencyKey, recipient })
  }
  const fresh = planned.filter((item) => item.existing === null)
  const isTooLarge = attachment.sizeBytes > CONVERSATION_ATTACHMENT_LIMITS.email.document
  if (fresh.length > 0 && !isTooLarge) {
    const sentCount = await transaction.countEmailDeliveries({ companyId, replyId: reply.id })
    if (sentCount + fresh.length > CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE) {
      throw new ContractorReplyEmailLimitReachedError()
    }
  }

  const send =
    fresh.length > 0 && !isTooLarge
      ? await prepareClientMail({ input, reply, texts, transaction })
      : null
  const results: ForwardContractorReplyToClientResult[] = []
  for (const item of planned) {
    if (item.existing !== null) {
      results.push(toClientResult({ existing: item.existing, recipient: item.recipient }))
      continue
    }
    const record = {
      actorUserId: input.actorUserId,
      address: item.recipient.address,
      attachmentId: attachment.id,
      companyId,
      idempotencyKey: item.idempotencyKey,
      replyId: reply.id,
      target: CLIENT_TARGET,
    } as const
    if (send === null) {
      const failed = await transaction.recordDelivery({
        ...record,
        mailMessageId: null,
        reason: 'attachment_too_large_for_email',
        status: 'failed',
      })
      results.push({
        addressMasked: maskEmailAddress(item.recipient.address),
        deliveryId: failed.id,
        emailId: item.recipient.emailId,
        kind: 'failed',
        reason: 'attachment_too_large_for_email',
      })
      continue
    }
    const recorded = await transaction.recordMail({
      ...send.mail,
      toAddress: item.recipient.address,
    })
    const queued = await transaction.recordDelivery({
      ...record,
      mailMessageId: recorded.messageId,
      reason: null,
      status: 'queued',
    })
    results.push({
      addressMasked: maskEmailAddress(item.recipient.address),
      deliveryId: queued.id,
      emailId: item.recipient.emailId,
      kind: 'queued',
      reason: null,
    })
  }
  return { results, savedEmailId }
}

/** A prontidão do envio, a âncora e o texto: uma vez por pedido, o mesmo para cada endereço. */
async function prepareClientMail(params: {
  readonly input: ForwardContractorReplyToClientInput
  readonly reply: ContractorReplyEmailReply
  readonly texts: { readonly body: string; readonly subject: string }
  readonly transaction: ContractorReplyEmailTransactionPort
}): Promise<{ readonly mail: Omit<RecordContractorReplyMailParams, 'toAddress'> }> {
  const { input, reply, texts, transaction } = params
  const { companyId, occurrenceId } = input
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
  return {
    mail: {
      actorUserId: input.actorUserId,
      bodyHtml: mail.html,
      bodyText: mail.text,
      companyId,
      correlationId: input.correlationId,
      fromAddress: readiness.settings.senderAddress,
      subject: mail.subject,
      threadId,
    },
  }
}
