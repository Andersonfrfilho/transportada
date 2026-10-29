/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5 (D5, RF3/RF5/RF6): o mesmo boleto da 279, agora por WhatsApp (Evolution) aos números do cliente da nota.
 * Um envio por número, idempotente por (retorno, anexo, número): o clique repetido, a fila offline do app e o segundo
 * operador encontram a entrega que já existe, e o Evolution não é chamado de novo. "Tentar de novo" (falha do envio ou
 * instância caída) e "Reenviar" (já saiu) abrem uma tentativa nova, com a chave do pedido.
 *
 * Duas fases: a reserva (`queued`, com auditoria) numa transação com o retorno travado, e a chamada ao Evolution fora
 * dela, fechada em `sent` ou `failed`. Sem número conectado ou com o WhatsApp desligado nada é reservado e o erro é
 * tipado; a tela oferece o e-mail (RF5). O número sai da API só mascarado; o log não leva número, texto nem chave.
 */
import { createHash } from 'node:crypto'

import {
  WhatsAppEvolutionDisabledError,
  WhatsAppEvolutionNotConfiguredError,
} from '../../whatsapp/domain/whatsapp-evolution.error.js'
import {
  CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE,
  CONTRACTOR_REPLY_WHATSAPP_TARGET,
  type ContractorReplyDeliveryReason,
} from '../../shared/occurrence-contractor-reply.constant.js'
import {
  CLIENT_CHANNEL,
  DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
  type DeliveryClientEmailAuthorKind,
} from '../../shared/delivery-client-email.constant.js'
import { DeliveryClientNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { ContractorReplyEmailAttachmentNotFoundError } from '../domain/contractor-reply-email.error.js'
import {
  maskClientWhatsAppNumber,
  parseClientWhatsAppNumber,
} from '../domain/contractor-reply-whatsapp-number.policy.js'
import {
  ContractorReplyWhatsAppContactLimitReachedError,
  ContractorReplyWhatsAppContactNotFoundError,
  ContractorReplyWhatsAppDailyCapReachedError,
  ContractorReplyWhatsAppLimitReachedError,
  ContractorReplyWhatsAppNumberInvalidError,
  ContractorReplyWhatsAppOffError,
  ContractorReplyWhatsAppResendNotAllowedError,
} from '../domain/contractor-reply-whatsapp.error.js'
import { resolveForwardTexts } from './forward-contractor-reply-by-email.use-case.js'
import {
  ContractorReplyWhatsAppSendError,
  type ContractorReplyWhatsAppAttachment,
  type ContractorReplyWhatsAppAttachmentReaderPort,
  type ContractorReplyWhatsAppCompletionPort,
  type ContractorReplyWhatsAppContact,
  type ContractorReplyWhatsAppDeliveryRecord,
  type ContractorReplyWhatsAppSenderPort,
  type ContractorReplyWhatsAppSendFailure,
  type ContractorReplyWhatsAppTransactionPort,
  type ContractorReplyWhatsAppUnitOfWorkPort,
} from './forward-contractor-reply-by-whatsapp.port.js'

const MB = 1024 * 1024
/** RF1: o teto do arquivo no chat do WhatsApp; acima disso nem se chama o Evolution. */
export const CONTRACTOR_REPLY_WHATSAPP_MAX_BYTES = 25 * MB
/** O mesmo teto da 279 por ocorrência: o cadastro não vira disparo. */
export const CONTRACTOR_REPLY_WHATSAPP_MAX_PER_OCCURRENCE =
  CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE
/** A primeira tentativa e mais cinco ("Tentar de novo" ou "Reenviar") por número. */
const MAX_ATTEMPTS_PER_NUMBER = 6
const IDEMPOTENCY_DIGEST_LENGTH = 32
/** O dia do teto diário é o de Brasília (sem horário de verão desde 2019). */
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_FILE_NAME = 'boleto.pdf'

/**
 * "Tentar de novo" vale para o que pode dar certo na segunda; número sem WhatsApp e arquivo grande vão para o e-mail.
 * Spec 286 T3: o envio automático que parou sem modelo também vale, depois que o modelo for corrigido em Notificações.
 */
const RESENDABLE_FAILURES: readonly ContractorReplyDeliveryReason[] = [
  'send_failed',
  'template_missing',
  'whatsapp_disconnected',
]

const FAILURE_REASON: Readonly<
  Record<ContractorReplyWhatsAppSendFailure, ContractorReplyDeliveryReason>
> = {
  disconnected: 'whatsapp_disconnected',
  failed: 'send_failed',
  number_not_found: 'whatsapp_number_not_found',
}

export type ForwardContractorReplyByWhatsAppLogger = {
  info(event: string, fields?: Record<string, unknown>): void
}

export type ForwardContractorReplyByWhatsAppInput = {
  readonly actorUserId: string
  readonly attachmentId?: string
  /** Quem guarda: o escritório pelo painel, o motorista pelo app. */
  readonly authorKind: DeliveryClientEmailAuthorKind
  readonly companyId: string
  /** Os números de WhatsApp do cadastro do cliente, por id. */
  readonly contactIds: readonly string[]
  readonly correlationId: string
  readonly idempotencyKey: string
  /** O número novo, como a pessoa digitou; a API normaliza. Com `save`, entra no cadastro do cliente. */
  readonly number?: string
  readonly occurrenceId: string
  readonly save: boolean
}

/** "Tentar de novo" e "Reenviar": o número e o anexo vêm da entrega, nunca do corpo. */
export type ResendContractorReplyByWhatsAppInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly deliveryId: string
  readonly idempotencyKey: string
  readonly occurrenceId: string
}

export type ForwardContractorReplyByWhatsAppResult = {
  /** O número do cadastro; `null` no número novo que não foi guardado. */
  readonly contactId: null | string
  readonly deliveryId: string
  /**
   * `sent`: saiu agora. `already_sent`: já tinha saído (replay). `in_progress`: outro pedido está mandando.
   * `failed`: não saiu; `reason` diz por quê e se "Tentar de novo" vale.
   */
  readonly kind: 'already_sent' | 'failed' | 'in_progress' | 'sent'
  readonly numberMasked: string
  readonly reason: ContractorReplyDeliveryReason | null
}

export type ForwardContractorReplyByWhatsAppOutcome = {
  readonly results: readonly ForwardContractorReplyByWhatsAppResult[]
  /** O id do número novo no cadastro, quando `save` o guardou (ou ele já estava lá). */
  readonly savedContactId: null | string
}

export type ForwardContractorReplyByWhatsAppUseCase = Readonly<{
  forward: (
    input: ForwardContractorReplyByWhatsAppInput,
  ) => Promise<ForwardContractorReplyByWhatsAppOutcome>
  resend: (
    input: ResendContractorReplyByWhatsAppInput,
  ) => Promise<ForwardContractorReplyByWhatsAppOutcome>
}>

type Recipient = { readonly address: string; readonly contactId: null | string }

type Planned = {
  readonly existing: ContractorReplyWhatsAppDeliveryRecord | null
  readonly idempotencyKey: string
  readonly recipient: Recipient
}

type Reservation = {
  /** `null` só no replay, que não manda nada. */
  readonly attachment: ContractorReplyWhatsAppAttachment | null
  readonly caption: string
  readonly queued: readonly { readonly deliveryId: string; readonly recipient: Recipient }[]
  readonly results: ForwardContractorReplyByWhatsAppResult[]
  readonly savedContactId: null | string
}

function digestKey(parts: string): string {
  const digest = createHash('sha256')
    .update(parts)
    .digest('hex')
    .slice(0, IDEMPOTENCY_DIGEST_LENGTH)
  return `${CONTRACTOR_REPLY_WHATSAPP_TARGET}:${digest}`
}

/** D3 da 279, no WhatsApp: a primeira tentativa é do (retorno, anexo, número), sem depender da chave do pedido. */
function firstAttemptKey(params: {
  readonly address: string
  readonly attachmentId: string
  readonly replyId: string
}): string {
  return digestKey(`${params.replyId}:${params.attachmentId}:${params.address}`)
}

/** Uma tentativa nova a partir de uma entrega: a chave do pedido faz o clique repetido cair na mesma. */
function resendKey(params: {
  readonly deliveryId: string
  readonly idempotencyKey: string
}): string {
  return digestKey(`resend:${params.deliveryId}:${params.idempotencyKey}`)
}

export function startOfBrasiliaDay(now: Date): Date {
  const local = now.getTime() - BRASILIA_OFFSET_MS
  return new Date(Math.floor(local / DAY_MS) * DAY_MS + BRASILIA_OFFSET_MS)
}

function replayed(params: {
  readonly existing: ContractorReplyWhatsAppDeliveryRecord
  readonly recipient: Recipient
}): ForwardContractorReplyByWhatsAppResult {
  const { existing, recipient } = params
  const base = {
    contactId: recipient.contactId,
    deliveryId: existing.id,
    numberMasked: maskClientWhatsAppNumber(recipient.address),
  }
  if (existing.status === 'sent') return { ...base, kind: 'already_sent', reason: null }
  if (existing.status === 'queued') return { ...base, kind: 'in_progress', reason: null }
  return { ...base, kind: 'failed', reason: existing.reason ?? 'send_failed' }
}

/** Spec 286 T3: a legenda é o corpo do modelo `whatsapp` (o texto livre antigo já vem como assunto + corpo). */
function caption(texts: { readonly body: string; readonly subject: string }): string {
  return texts.body
}

export function createForwardContractorReplyByWhatsAppUseCase(dependencies: {
  readonly attachments: ContractorReplyWhatsAppAttachmentReaderPort
  readonly completion: ContractorReplyWhatsAppCompletionPort
  readonly logger?: ForwardContractorReplyByWhatsAppLogger
  readonly now: () => Date
  readonly sender: ContractorReplyWhatsAppSenderPort
  readonly unitOfWork: ContractorReplyWhatsAppUnitOfWorkPort
}): ForwardContractorReplyByWhatsAppUseCase {
  async function send(params: {
    readonly companyId: string
    readonly reservation: Reservation
  }): Promise<ForwardContractorReplyByWhatsAppOutcome> {
    const { companyId, reservation } = params
    const results = [...reservation.results]
    if (reservation.attachment !== null && reservation.queued.length > 0) {
      results.push(
        ...(await deliver({
          attachment: reservation.attachment,
          companyId,
          dependencies,
          reservation,
        })),
      )
    }
    return { results, savedContactId: reservation.savedContactId }
  }

  function log(
    event: string,
    occurrenceId: string,
    outcome: ForwardContractorReplyByWhatsAppOutcome,
  ) {
    dependencies.logger?.info(event, {
      kinds: outcome.results.map((result) => result.kind),
      numbersMasked: outcome.results.map((result) => result.numberMasked),
      occurrenceId,
      reasons: outcome.results.map((result) => result.reason),
      saved: outcome.savedContactId !== null,
      target: CONTRACTOR_REPLY_WHATSAPP_TARGET,
    })
  }

  return {
    async forward(input) {
      const newNumber = resolveNewNumber(input)
      const reservation = await dependencies.unitOfWork.execute((transaction) =>
        reserveForward({ input, newNumber, now: dependencies.now(), transaction }),
      )
      const outcome = await send({ companyId: input.companyId, reservation })
      log('occurrence_contractor_reply_whatsapp_forward', input.occurrenceId, outcome)
      return outcome
    },

    async resend(input) {
      const reservation = await dependencies.unitOfWork.execute((transaction) =>
        reserveResend({ input, now: dependencies.now(), transaction }),
      )
      const outcome = await send({ companyId: input.companyId, reservation })
      log('occurrence_contractor_reply_whatsapp_resend', input.occurrenceId, outcome)
      return outcome
    },
  }
}

function resolveNewNumber(input: ForwardContractorReplyByWhatsAppInput): null | string {
  if (input.number === undefined) return null
  const number = parseClientWhatsAppNumber(input.number)
  if (number === null) throw new ContractorReplyWhatsAppNumberInvalidError()
  return number
}

/** O retorno travado, o canal ligado, o Evolution ativo, o texto e o anexo: o que todo envio confere antes. */
async function lockSendable(params: {
  readonly attachmentId: string | undefined
  readonly companyId: string
  readonly occurrenceId: string
  readonly transaction: ContractorReplyWhatsAppTransactionPort
}) {
  const { companyId, occurrenceId, transaction } = params
  const reply = await transaction.lockReply({ companyId, occurrenceId })
  if (reply === null) throw new TripOccurrenceNotFoundError()
  const channel = await transaction.findClientChannel({ companyId, occurrenceId })
  if (channel !== CLIENT_CHANNEL.WHATSAPP && channel !== CLIENT_CHANNEL.BOTH) {
    throw new ContractorReplyWhatsAppOffError()
  }
  const settings = await transaction.findEvolutionSettings({ companyId })
  if (settings === null) throw new WhatsAppEvolutionNotConfiguredError()
  if (settings.status !== 'active') throw new WhatsAppEvolutionDisabledError()
  const texts = await resolveForwardTexts({
    channel: 'whatsapp',
    companyId,
    occurrenceId,
    reply,
    target: 'client_boleto_emails',
    transaction,
  })
  const attachmentId = params.attachmentId ?? reply.replyAttachmentId
  if (attachmentId === null) throw new ContractorReplyEmailAttachmentNotFoundError()
  const attachment = await transaction.findAttachment({ attachmentId, companyId, occurrenceId })
  if (attachment === null) throw new ContractorReplyEmailAttachmentNotFoundError()
  return { attachment, attachmentId, reply, settings, texts }
}

async function resolveRecipients(params: {
  readonly input: ForwardContractorReplyByWhatsAppInput
  readonly newNumber: null | string
  readonly transaction: ContractorReplyWhatsAppTransactionPort
}): Promise<{ readonly recipients: readonly Recipient[]; readonly savedContactId: null | string }> {
  const { input, newNumber, transaction } = params
  const needsClient = input.contactIds.length > 0 || input.save
  const taxId = needsClient
    ? await transaction.findDeliveryClientTaxId({
        companyId: input.companyId,
        lock: input.save,
        occurrenceId: input.occurrenceId,
      })
    : null
  if (needsClient && taxId === null) {
    if (input.contactIds.length > 0) throw new ContractorReplyWhatsAppContactNotFoundError()
    throw new DeliveryClientNotFoundError()
  }
  const saved: readonly ContractorReplyWhatsAppContact[] =
    taxId === null
      ? []
      : await transaction.listClientWhatsAppContacts({ companyId: input.companyId, taxId })
  const picked: Recipient[] = [...new Set(input.contactIds)].map((contactId) => {
    const found = saved.find((contact) => contact.id === contactId)
    if (found === undefined) throw new ContractorReplyWhatsAppContactNotFoundError()
    return { address: found.address, contactId: found.id }
  })

  let savedContactId: null | string = null
  if (newNumber !== null && input.save && taxId !== null) {
    const existing = saved.find((contact) => contact.address === newNumber)
    if (existing !== undefined) {
      savedContactId = existing.id
    } else {
      if (saved.length >= DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE) {
        throw new ContractorReplyWhatsAppContactLimitReachedError()
      }
      savedContactId = (
        await transaction.saveClientWhatsAppContact({
          actorUserId: input.actorUserId,
          address: newNumber,
          authorKind: input.authorKind,
          companyId: input.companyId,
          correlationId: input.correlationId,
          occurrenceId: input.occurrenceId,
          taxId,
        })
      ).id
    }
  }

  const all =
    newNumber === null ? picked : [...picked, { address: newNumber, contactId: savedContactId }]
  const seen = new Set<string>()
  const recipients = all.filter((recipient) => {
    if (seen.has(recipient.address)) return false
    seen.add(recipient.address)
    return true
  })
  if (recipients.length === 0) throw new ContractorReplyWhatsAppNumberInvalidError()
  return { recipients, savedContactId }
}

/** Os tetos (por ocorrência e diário da empresa) contam só o que vai sair agora; o replay não conta. */
async function assertWithinCaps(params: {
  readonly companyId: string
  readonly dailyCap: number
  readonly fresh: number
  readonly now: Date
  readonly replyId: string
  readonly transaction: ContractorReplyWhatsAppTransactionPort
}): Promise<void> {
  const { companyId, fresh, transaction } = params
  if (fresh === 0) return
  const sentCount = await transaction.countDeliveries({ companyId, replyId: params.replyId })
  if (sentCount + fresh > CONTRACTOR_REPLY_WHATSAPP_MAX_PER_OCCURRENCE) {
    throw new ContractorReplyWhatsAppLimitReachedError()
  }
  const today = await transaction.countCompanyDeliveriesSince({
    companyId,
    since: startOfBrasiliaDay(params.now),
  })
  if (today + fresh > params.dailyCap) throw new ContractorReplyWhatsAppDailyCapReachedError()
}

/** Grava as tentativas novas: `queued` para o envio ou `failed` quando o arquivo passa do teto. */
async function recordFresh(params: {
  readonly actorUserId: string
  readonly attachment: ContractorReplyWhatsAppAttachment
  readonly attachmentId: string
  readonly companyId: string
  readonly correlationId: string
  readonly occurrenceId: string
  readonly planned: readonly Planned[]
  readonly replyId: string
  readonly transaction: ContractorReplyWhatsAppTransactionPort
}) {
  const results: ForwardContractorReplyByWhatsAppResult[] = []
  const queued: { deliveryId: string; recipient: Recipient }[] = []
  const isTooLarge = params.attachment.sizeBytes > CONTRACTOR_REPLY_WHATSAPP_MAX_BYTES
  for (const item of params.planned) {
    if (item.existing !== null) {
      results.push(replayed({ existing: item.existing, recipient: item.recipient }))
      continue
    }
    const recorded = await params.transaction.recordDelivery({
      actorUserId: params.actorUserId,
      address: item.recipient.address,
      attachmentId: params.attachmentId,
      companyId: params.companyId,
      correlationId: params.correlationId,
      idempotencyKey: item.idempotencyKey,
      occurrenceId: params.occurrenceId,
      reason: isTooLarge ? 'attachment_too_large_for_whatsapp' : null,
      replyId: params.replyId,
      status: isTooLarge ? 'failed' : 'queued',
    })
    if (isTooLarge) {
      results.push({
        contactId: item.recipient.contactId,
        deliveryId: recorded.id,
        kind: 'failed',
        numberMasked: maskClientWhatsAppNumber(item.recipient.address),
        reason: 'attachment_too_large_for_whatsapp',
      })
    } else {
      queued.push({ deliveryId: recorded.id, recipient: item.recipient })
    }
  }
  return { queued, results }
}

async function reserveForward(params: {
  readonly input: ForwardContractorReplyByWhatsAppInput
  readonly newNumber: null | string
  readonly now: Date
  readonly transaction: ContractorReplyWhatsAppTransactionPort
}): Promise<Reservation> {
  const { input, newNumber, now, transaction } = params
  const { companyId } = input
  const { attachment, attachmentId, reply, settings, texts } = await lockSendable({
    attachmentId: input.attachmentId,
    companyId,
    occurrenceId: input.occurrenceId,
    transaction,
  })
  const { recipients, savedContactId } = await resolveRecipients({ input, newNumber, transaction })

  const planned: Planned[] = []
  for (const recipient of recipients) {
    const idempotencyKey = firstAttemptKey({
      address: recipient.address,
      attachmentId,
      replyId: reply.id,
    })
    const existing = await transaction.findDeliveryByKey({ companyId, idempotencyKey })
    planned.push({ existing, idempotencyKey, recipient })
  }
  await assertWithinCaps({
    companyId,
    dailyCap: settings.dailyCap,
    fresh: planned.filter((item) => item.existing === null).length,
    now,
    replyId: reply.id,
    transaction,
  })
  const { queued, results } = await recordFresh({
    actorUserId: input.actorUserId,
    attachment,
    attachmentId,
    companyId,
    correlationId: input.correlationId,
    occurrenceId: input.occurrenceId,
    planned,
    replyId: reply.id,
    transaction,
  })
  return { attachment, caption: caption(texts), queued, results, savedContactId }
}

async function reserveResend(params: {
  readonly input: ResendContractorReplyByWhatsAppInput
  readonly now: Date
  readonly transaction: ContractorReplyWhatsAppTransactionPort
}): Promise<Reservation> {
  const { input, now, transaction } = params
  const { companyId, occurrenceId } = input
  const reply = await transaction.lockReply({ companyId, occurrenceId })
  if (reply === null) throw new TripOccurrenceNotFoundError()
  const source = await transaction.findDeliveryById({
    companyId,
    deliveryId: input.deliveryId,
    replyId: reply.id,
  })
  if (
    source === null ||
    source.target !== CONTRACTOR_REPLY_WHATSAPP_TARGET ||
    source.address === null
  ) {
    throw new ContractorReplyWhatsAppResendNotAllowedError()
  }
  const recipient: Recipient = { address: source.address, contactId: null }
  const idempotencyKey = resendKey({
    deliveryId: source.id,
    idempotencyKey: input.idempotencyKey,
  })
  const existing = await transaction.findDeliveryByKey({ companyId, idempotencyKey })
  if (existing !== null) {
    return {
      attachment: null,
      caption: '',
      queued: [],
      results: [replayed({ existing, recipient })],
      savedContactId: null,
    }
  }
  const isResendable =
    source.status === 'sent' ||
    (source.status === 'failed' && RESENDABLE_FAILURES.includes(source.reason ?? 'send_failed'))
  if (!isResendable) throw new ContractorReplyWhatsAppResendNotAllowedError()

  const { attachment, settings, texts } = await lockSendable({
    attachmentId: source.attachmentId,
    companyId,
    occurrenceId,
    transaction,
  })
  const attempts = await transaction.countDeliveries({
    address: source.address,
    companyId,
    replyId: reply.id,
  })
  if (attempts >= MAX_ATTEMPTS_PER_NUMBER) throw new ContractorReplyWhatsAppLimitReachedError()
  await assertWithinCaps({
    companyId,
    dailyCap: settings.dailyCap,
    fresh: 1,
    now,
    replyId: reply.id,
    transaction,
  })
  const { queued, results } = await recordFresh({
    actorUserId: input.actorUserId,
    attachment,
    attachmentId: source.attachmentId,
    companyId,
    correlationId: input.correlationId,
    occurrenceId,
    planned: [{ existing: null, idempotencyKey, recipient }],
    replyId: reply.id,
    transaction,
  })
  return { attachment, caption: caption(texts), queued, results, savedContactId: null }
}

/**
 * Fora da transação: o arquivo é lido uma vez, a conexão é conferida (instância caída fecha tudo em
 * `whatsapp_disconnected`, sem chamar o envio) e cada número sai em sequência. Toda entrega reservada termina fechada.
 */
async function deliver(params: {
  readonly attachment: ContractorReplyWhatsAppAttachment
  readonly companyId: string
  readonly dependencies: {
    readonly attachments: ContractorReplyWhatsAppAttachmentReaderPort
    readonly completion: ContractorReplyWhatsAppCompletionPort
    readonly sender: ContractorReplyWhatsAppSenderPort
  }
  readonly reservation: Reservation
}): Promise<readonly ForwardContractorReplyByWhatsAppResult[]> {
  const { attachment, companyId, dependencies, reservation } = params
  const fail = async (
    item: Reservation['queued'][number],
    reason: ContractorReplyDeliveryReason,
  ): Promise<ForwardContractorReplyByWhatsAppResult> => {
    await dependencies.completion.markFailed({ companyId, deliveryId: item.deliveryId, reason })
    return {
      contactId: item.recipient.contactId,
      deliveryId: item.deliveryId,
      kind: 'failed',
      numberMasked: maskClientWhatsAppNumber(item.recipient.address),
      reason,
    }
  }

  const connected = await dependencies.sender.isConnected({ companyId }).catch(() => false)
  if (!connected) {
    return Promise.all(reservation.queued.map((item) => fail(item, 'whatsapp_disconnected')))
  }
  let bytes: Uint8Array
  try {
    bytes = await dependencies.attachments.read({
      bucket: attachment.bucket,
      key: attachment.objectKey,
    })
  } catch {
    return Promise.all(reservation.queued.map((item) => fail(item, 'send_failed')))
  }

  const results: ForwardContractorReplyByWhatsAppResult[] = []
  for (const item of reservation.queued) {
    let sent: { readonly providerMessageId: null | string }
    try {
      sent = await dependencies.sender.sendDocument({
        bytes,
        caption: reservation.caption,
        companyId,
        fileName: attachment.fileName === '' ? DEFAULT_FILE_NAME : attachment.fileName,
        mimeType: attachment.contentType,
        number: item.recipient.address,
      })
    } catch (error) {
      const failure = error instanceof ContractorReplyWhatsAppSendError ? error.failure : 'failed'
      results.push(await fail(item, FAILURE_REASON[failure]))
      continue
    }
    // Saiu: se o fechamento falhar, a entrega fica `queued` (em andamento) e nunca vira "Tentar de novo" — melhor
    // um estado parado do que o mesmo boleto duas vezes no WhatsApp do cliente.
    await dependencies.completion.markSent({
      companyId,
      deliveryId: item.deliveryId,
      providerMessageId: sent.providerMessageId,
    })
    results.push({
      contactId: item.recipient.contactId,
      deliveryId: item.deliveryId,
      kind: 'sent',
      numberMasked: maskClientWhatsAppNumber(item.recipient.address),
      reason: null,
    })
  }
  return results
}
