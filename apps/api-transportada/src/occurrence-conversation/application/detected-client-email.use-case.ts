/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 RF8/RF10(b) (T4b): o e-mail que o motorista escreve na conversa da ocorrência, depois do boleto aceito.
 * Reconhecer não é enviar: com o tipo em `manual` a mensagem só ganha `detected_email` e o cartão de confirmação
 * aparece ao motorista e ao operador (no WhatsApp, o aviso pede "1"); com `automatic` o boleto sai na hora, sem
 * cartão. O envio é sempre o `forwardToClient` do trilho da 248/T3, e o endereço só entra no cadastro com `save`
 * (o automático não guarda: nenhum toque disse que o endereço é do cliente).
 *
 * Falha aqui nunca derruba a mensagem do motorista, que já está gravada: o log leva só o nome do erro, e o endereço
 * em claro nunca sai do banco.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import { CLIENT_EMAIL_TYPE_OFF } from '../../shared/delivery-client-email.constant.js'
import type { DeliveryClientEmailAuthorKind } from '../../shared/delivery-client-email.constant.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { DetectedClientEmailNotFoundError } from '../domain/contractor-reply-email.error.js'
import {
  buildDetectedEmailWhatsAppPrompt,
  detectClientEmailAddress,
  isDetectedEmailConfirmation,
} from '../domain/client-email-detection.policy.js'
import type {
  DetectedClientEmailRecord,
  DetectedClientEmailSendState,
  DetectedClientEmailStorePort,
} from './detected-client-email.port.js'
import type {
  ForwardContractorReplyByEmailUseCase,
  ForwardContractorReplyToClientOutcome,
} from './forward-contractor-reply-by-email.use-case.js'

export const DETECTED_CLIENT_EMAIL_LOG = {
  failed: 'occurrence_conversation_detected_email_failed',
  handled: 'occurrence_conversation_detected_email',
} as const

const SENT_KINDS = new Set(['already_queued', 'queued'])

/** As respostas do WhatsApp ao motorista; nenhuma leva o endereço em claro. */
const WHATSAPP_SENT = (addressMasked: string) => `Boleto enviado para ${addressMasked}.`
const WHATSAPP_FAILED = 'Não saiu, o escritório foi avisado.'

/** O canal da mensagem do motorista; no WhatsApp, a resposta ao número dele (janela de 24 h aberta pela própria mensagem). */
export type DetectedClientEmailReplyChannel =
  | { readonly kind: 'app' }
  | {
      readonly kind: 'whatsapp'
      readonly send: (body: string) => Promise<{ readonly externalMessageId: null | string }>
    }

export type DriverMessageInput = {
  readonly bodyText: string
  readonly channel: DetectedClientEmailReplyChannel
  readonly companyId: string
  readonly conversationId: string
  readonly correlationId: string
  readonly driverUserId: string
  readonly messageId: string
}

export type DriverMessageOutcome =
  | { readonly kind: 'none' }
  | { readonly addressMasked: string; readonly kind: 'awaiting_confirmation' }
  | { readonly addressMasked: string; readonly kind: 'sent' }
  | { readonly kind: 'failed' }

export type PendingDetectedClientEmail = {
  readonly addressMasked: string
  readonly createdAt: string
  readonly messageId: string
}

export type SendDetectedClientEmailInput = {
  readonly actorUserId: string
  readonly authorKind: DeliveryClientEmailAuthorKind
  readonly companyId: string
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly messageId: string
  readonly occurrenceId: string
  readonly save: boolean
}

export type DetectedClientEmailUseCase = Readonly<{
  onDriverMessage: (input: DriverMessageInput) => Promise<DriverMessageOutcome>
  readPending: (params: {
    readonly companyId: string
    readonly occurrenceId: string
  }) => Promise<PendingDetectedClientEmail | null>
  send: (input: SendDetectedClientEmailInput) => Promise<ForwardContractorReplyToClientOutcome>
}>

/** O boleto aceito e o tipo ligado (RF9): só aí o e-mail da conversa vale alguma coisa. */
function isSendable(
  state: DetectedClientEmailSendState | null,
): state is DetectedClientEmailSendState {
  return state !== null && state.boletoAccepted && state.clientEmailType !== CLIENT_EMAIL_TYPE_OFF
}

function hasSent(outcome: ForwardContractorReplyToClientOutcome): boolean {
  return outcome.results.some((result) => SENT_KINDS.has(result.kind))
}

export function createDetectedClientEmailUseCase(dependencies: {
  readonly clock: () => Date
  readonly forwardByEmail: Pick<ForwardContractorReplyByEmailUseCase, 'forwardToClient'>
  readonly logger?: ApiLogger
  readonly store: DetectedClientEmailStorePort
}): DetectedClientEmailUseCase {
  const { clock, forwardByEmail, logger, store } = dependencies

  async function forward(params: {
    readonly actorUserId: string
    readonly authorKind: DeliveryClientEmailAuthorKind
    readonly companyId: string
    readonly correlationId: string
    readonly idempotencyKey: string
    readonly occurrenceId: string
    readonly record: DetectedClientEmailRecord
    readonly save: boolean
  }): Promise<ForwardContractorReplyToClientOutcome> {
    const outcome = await forwardByEmail.forwardToClient({
      actorUserId: params.actorUserId,
      address: params.record.address,
      authorKind: params.authorKind,
      companyId: params.companyId,
      correlationId: params.correlationId,
      emailIds: [],
      idempotencyKey: params.idempotencyKey,
      occurrenceId: params.occurrenceId,
      save: params.save,
    })
    if (hasSent(outcome) && params.record.sentAt === null) {
      await store.markSent({
        companyId: params.companyId,
        messageId: params.record.messageId,
        sentAt: clock(),
      })
    }
    return outcome
  }

  async function replyOnWhatsApp(input: DriverMessageInput, body: string): Promise<void> {
    if (input.channel.kind !== 'whatsapp') return
    const sent = await input.channel.send(body)
    await store.recordWhatsAppPrompt({
      bodyText: body,
      companyId: input.companyId,
      conversationId: input.conversationId,
      providerMessageId: sent.externalMessageId,
      sentAt: clock(),
    })
  }

  /** O "1" do WhatsApp: leva o boleto ao último e-mail detectado e ainda não enviado. */
  async function confirm(
    input: DriverMessageInput,
    occurrenceId: string,
  ): Promise<DriverMessageOutcome> {
    const pending = await store.findPending({ companyId: input.companyId, occurrenceId })
    if (pending === null) return { kind: 'none' }
    const addressMasked = maskEmailAddress(pending.address)
    const outcome = await forward({
      actorUserId: input.driverUserId,
      authorKind: 'driver',
      companyId: input.companyId,
      correlationId: input.correlationId,
      idempotencyKey: `detected-email:${pending.messageId}`,
      occurrenceId,
      record: pending,
      save: false,
    })
    const isSent = hasSent(outcome)
    await replyOnWhatsApp(input, isSent ? WHATSAPP_SENT(addressMasked) : WHATSAPP_FAILED)
    return isSent ? { addressMasked, kind: 'sent' } : { kind: 'failed' }
  }

  async function handle(input: DriverMessageInput): Promise<DriverMessageOutcome> {
    const { companyId } = input
    const occurrenceId = await store.findDriverOccurrence({
      companyId,
      conversationId: input.conversationId,
    })
    if (occurrenceId === null) return { kind: 'none' }
    const state = await store.readSendState({ companyId, occurrenceId })
    if (!isSendable(state)) return { kind: 'none' }
    if (input.channel.kind === 'whatsapp' && isDetectedEmailConfirmation(input.bodyText)) {
      return confirm(input, occurrenceId)
    }

    const address = detectClientEmailAddress(input.bodyText)
    if (address === null) return { kind: 'none' }
    await store.markDetected({ address, companyId, messageId: input.messageId })
    const addressMasked = maskEmailAddress(address)
    if (state.clientEmailSendMode !== 'automatic') {
      await replyOnWhatsApp(input, buildDetectedEmailWhatsAppPrompt(addressMasked))
      return { addressMasked, kind: 'awaiting_confirmation' }
    }

    /** RF10(b): no automático o e-mail da conversa sai sem cartão. */
    const outcome = await forward({
      actorUserId: input.driverUserId,
      authorKind: 'driver',
      companyId,
      correlationId: input.correlationId,
      idempotencyKey: `detected-email:${input.messageId}`,
      occurrenceId,
      record: {
        address,
        conversationId: input.conversationId,
        createdAt: clock(),
        messageId: input.messageId,
        sentAt: null,
      },
      save: false,
    })
    const isSent = hasSent(outcome)
    await replyOnWhatsApp(input, isSent ? WHATSAPP_SENT(addressMasked) : WHATSAPP_FAILED)
    return isSent ? { addressMasked, kind: 'sent' } : { kind: 'failed' }
  }

  return {
    async onDriverMessage(input) {
      try {
        const outcome = await handle(input)
        if (outcome.kind !== 'none') {
          logger?.info(DETECTED_CLIENT_EMAIL_LOG.handled, {
            channel: input.channel.kind,
            kind: outcome.kind,
            messageId: input.messageId,
          })
        }
        return outcome
      } catch (error) {
        logger?.warn(DETECTED_CLIENT_EMAIL_LOG.failed, {
          channel: input.channel.kind,
          errorName: error instanceof Error ? error.name : typeof error,
          messageId: input.messageId,
        })
        return { kind: 'failed' }
      }
    },

    async readPending({ companyId, occurrenceId }) {
      const state = await store.readSendState({ companyId, occurrenceId })
      if (!isSendable(state)) return null
      const pending = await store.findPending({ companyId, occurrenceId })
      if (pending === null) return null
      return {
        addressMasked: maskEmailAddress(pending.address),
        createdAt: pending.createdAt.toISOString(),
        messageId: pending.messageId,
      }
    },

    async send(input) {
      const state = await store.readSendState({
        companyId: input.companyId,
        occurrenceId: input.occurrenceId,
      })
      if (state === null) throw new TripOccurrenceNotFoundError()
      const record = await store.findDetected({
        companyId: input.companyId,
        messageId: input.messageId,
        occurrenceId: input.occurrenceId,
      })
      if (record === null) throw new DetectedClientEmailNotFoundError()
      return forward({ ...input, record })
    },
  }
}
