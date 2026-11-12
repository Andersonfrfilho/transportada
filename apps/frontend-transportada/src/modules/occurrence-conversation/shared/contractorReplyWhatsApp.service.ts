/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 281 T7 (RF3, RF5): o boleto da contratante por WhatsApp (Evolution) ao cliente, pela tela do escritório. Aqui
 * ficam os contratos de leitura das três rotas da T5 (opções, envio e reenvio), a regra do número digitado — a
 * mesma da API (D4): só decide se vale tentar, quem normaliza e valida é a API — e a decisão pura de quando o botão
 * é oferecido, com o motivo à vista. Todo número chega mascarado.
 */
import { isRecord, isString } from './occurrenceConversationGuards.validation'

export const CLIENT_CHANNELS = ['off', 'email', 'whatsapp', 'both'] as const
export type ClientChannel = (typeof CLIENT_CHANNELS)[number]

const CONNECTION_STATES = ['close', 'connecting', 'open', 'unknown'] as const
type WhatsAppConnectionState = (typeof CONNECTION_STATES)[number]

const DELIVERY_STATUSES = ['queued', 'sent', 'pending_window', 'skipped', 'failed'] as const
type WhatsAppDeliveryStatus = (typeof DELIVERY_STATUSES)[number]

const RESULT_KINDS = ['already_sent', 'failed', 'in_progress', 'sent'] as const
export type WhatsAppSendResultKind = (typeof RESULT_KINDS)[number]

/** Cópia por valor dos motivos da API (`occurrence-contractor-reply.constant.ts`) que o WhatsApp grava. */
export const WHATSAPP_DELIVERY_REASON = {
  ATTACHMENT_TOO_LARGE: 'attachment_too_large_for_whatsapp',
  DISCONNECTED: 'whatsapp_disconnected',
  NUMBER_NOT_FOUND: 'whatsapp_number_not_found',
  SEND_FAILED: 'send_failed',
} as const

/** "Tentar de novo" vale para o que pode dar certo na segunda; os outros dois vão para o e-mail. */
const RETRYABLE_REASONS: readonly string[] = [
  WHATSAPP_DELIVERY_REASON.SEND_FAILED,
  WHATSAPP_DELIVERY_REASON.DISCONNECTED,
]

export const CONTRACTOR_REPLY_WHATSAPP_TARGET = 'client_boleto_whatsapp'

export type WhatsAppContactOption = Readonly<{
  contactId: string
  label: string
  numberMasked: string
}>

export type WhatsAppDelivery = Readonly<{
  createdAt: string
  id: string
  numberMasked: null | string
  reason: null | string
  sentAt: null | string
  status: WhatsAppDeliveryStatus
  /** Spec 286 T4: quem disparou o envio; a API anterior não manda. */
  trigger?: 'automatic' | 'operator'
}>

export type ContractorReplyWhatsAppOptions = Readonly<{
  clientChannel: ClientChannel
  contacts: readonly WhatsAppContactOption[]
  deliveries: readonly WhatsAppDelivery[]
  evolution: Readonly<{
    connectionState: null | WhatsAppConnectionState
    ready: boolean
    status: 'active' | 'disabled' | null
  }>
  sentCount: number
  sentLimit: number
}>

export type WhatsAppSendResult = Readonly<{
  contactId: null | string
  deliveryId: string
  kind: WhatsAppSendResultKind
  numberMasked: string
  reason: null | string
}>

export type WhatsAppSendOutcome = Readonly<{
  results: readonly WhatsAppSendResult[]
  savedContactId: null | string
}>

function isContact(value: unknown): value is WhatsAppContactOption {
  return (
    isRecord(value) &&
    isString(value.contactId) &&
    isString(value.label) &&
    isString(value.numberMasked)
  )
}

function isDelivery(value: unknown): value is WhatsAppDelivery {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.createdAt) &&
    (value.numberMasked === null || isString(value.numberMasked)) &&
    (value.reason === null || isString(value.reason)) &&
    (value.sentAt === null || isString(value.sentAt)) &&
    (DELIVERY_STATUSES as readonly unknown[]).includes(value.status)
  )
}

/** `null` é "esta ocorrência não tem retorno": nenhum botão. Resposta malformada vira `null` também. */
export function readContractorReplyWhatsAppOptions(
  payload: unknown,
): ContractorReplyWhatsAppOptions | null {
  const data = isRecord(payload) ? payload.data : undefined
  if (!isRecord(data) || !isRecord(data.evolution)) return null
  const { evolution } = data
  const clientChannel = CLIENT_CHANNELS.find((channel) => channel === data.clientChannel)
  if (
    clientChannel === undefined ||
    !Array.isArray(data.contacts) ||
    !Array.isArray(data.deliveries) ||
    typeof evolution.ready !== 'boolean' ||
    typeof data.sentCount !== 'number' ||
    typeof data.sentLimit !== 'number'
  ) {
    return null
  }
  return {
    clientChannel,
    contacts: data.contacts.filter(isContact),
    deliveries: data.deliveries.filter(isDelivery),
    evolution: {
      connectionState:
        CONNECTION_STATES.find((state) => state === evolution.connectionState) ?? null,
      ready: evolution.ready,
      status:
        evolution.status === 'active' || evolution.status === 'disabled' ? evolution.status : null,
    },
    sentCount: data.sentCount,
    sentLimit: data.sentLimit,
  }
}

/** O resultado por número (mascarado); forma inesperada é erro, nunca "enviado". */
export function readWhatsAppSendOutcome(payload: unknown): WhatsAppSendOutcome {
  const data = isRecord(payload) ? payload.data : undefined
  if (isRecord(data) && Array.isArray(data.results)) {
    const results: WhatsAppSendResult[] = []
    for (const item of data.results) {
      const kind = isRecord(item) ? RESULT_KINDS.find((known) => known === item.kind) : undefined
      if (
        !isRecord(item) ||
        kind === undefined ||
        !isString(item.numberMasked) ||
        !isString(item.deliveryId)
      ) {
        throw new Error('CONTRACTOR_REPLY_WHATSAPP_RESPONSE_INVALID')
      }
      results.push({
        contactId: isString(item.contactId) ? item.contactId : null,
        deliveryId: item.deliveryId,
        kind,
        numberMasked: item.numberMasked,
        reason: isString(item.reason) ? item.reason : null,
      })
    }
    return { results, savedContactId: isString(data.savedContactId) ? data.savedContactId : null }
  }
  throw new Error('CONTRACTOR_REPLY_WHATSAPP_RESPONSE_INVALID')
}

const NUMBER_MAX_LENGTH = 100
const NUMBER_DIGITS = /^[+\d\s().-]+$/u

/**
 * Espelha só o suficiente da API (D4) para não mandar lixo: dígitos e a pontuação comum de telefone, com ao menos
 * 10 dígitos (DDD + número). A normalização para E.164 e a validação final são da API.
 */
export function parseInformedWhatsAppNumber(raw: string): null | string {
  const typed = raw.trim()
  if (typed.length === 0 || typed.length > NUMBER_MAX_LENGTH) return null
  if (!NUMBER_DIGITS.test(typed)) return null
  const digits = typed.replaceAll(/\D/gu, '')
  return digits.length >= 10 && digits.length <= 15 ? typed : null
}

/** Uma chave por tentativa; o envio seguinte (com outra escolha) ganha outra. */
export function createWhatsAppIdempotencyKey(randomId: () => string): string {
  return `client-whatsapp:${randomId()}`
}

export type ClientWhatsAppActionState =
  | Readonly<{ kind: 'hidden' }>
  | Readonly<{ kind: 'offline'; reason: 'disconnected' | 'disabled' | 'notConfigured' }>
  | Readonly<{ kind: 'send' }>
  | Readonly<{ kind: 'limitReached' }>

/**
 * O botão "Enviar por WhatsApp". O tipo manda: sem `whatsapp` ou `both` nem aparece. Com o Evolution fora do ar o
 * botão fica à vista, desligado e com o motivo — o e-mail segue ao lado (RF5) —, e o teto por ocorrência desliga também.
 */
export function resolveClientWhatsAppAction(
  options: ContractorReplyWhatsAppOptions,
): ClientWhatsAppActionState {
  if (options.clientChannel !== 'whatsapp' && options.clientChannel !== 'both') {
    return { kind: 'hidden' }
  }
  if (!options.evolution.ready) {
    if (options.evolution.status === null) return { kind: 'offline', reason: 'notConfigured' }
    if (options.evolution.status === 'disabled') return { kind: 'offline', reason: 'disabled' }
    return { kind: 'offline', reason: 'disconnected' }
  }
  if (options.sentCount >= options.sentLimit) return { kind: 'limitReached' }
  return { kind: 'send' }
}

/** O texto do erro do envio, pela chave de `clientWhatsApp.failure`; o código nunca vira texto cru. */
export function resolveWhatsAppFailureKey(code: string): string {
  if (code === 'OCCURRENCE_CLIENT_WHATSAPP_OFF') return 'off'
  if (code === 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED') return 'keyReused'
  if (code === 'WHATSAPP_NUMBER_INVALID') return 'numberInvalid'
  if (code === 'WHATSAPP_CONTACT_NOT_FOUND') return 'numberGone'
  if (code === 'WHATSAPP_CONTACT_LIMIT_REACHED') return 'registryLimit'
  if (code === 'WHATSAPP_OCCURRENCE_LIMIT_REACHED') return 'limitReached'
  if (code === 'WHATSAPP_DAILY_CAP_REACHED') return 'dailyCap'
  if (code === 'WHATSAPP_RESEND_NOT_ALLOWED') return 'resendNotAllowed'
  if (code.startsWith('WHATSAPP_EVOLUTION_')) return 'unavailable'
  return 'generic'
}

/** O motivo da falha de um número: a chave de `clientWhatsApp.reason` e se a tela oferece o e-mail no lugar. */
export function describeWhatsAppFailure(reason: null | string): Readonly<{
  canRetry: boolean
  key: string
  offerEmail: boolean
}> {
  const known = Object.values(WHATSAPP_DELIVERY_REASON).find((value) => value === reason)
  const key = known ?? WHATSAPP_DELIVERY_REASON.SEND_FAILED
  return {
    canRetry: RETRYABLE_REASONS.includes(key),
    key,
    offerEmail:
      key === WHATSAPP_DELIVERY_REASON.NUMBER_NOT_FOUND ||
      key === WHATSAPP_DELIVERY_REASON.ATTACHMENT_TOO_LARGE ||
      key === WHATSAPP_DELIVERY_REASON.DISCONNECTED,
  }
}

export type WhatsAppSendStateItem = Readonly<{
  at: string
  canRetry: boolean
  deliveryId: string
  numberMasked: string
  offerEmail: boolean
  reason: null | string
  state: 'failed' | 'queued' | 'sent'
}>

/**
 * Uma linha por número, com a última tentativa (o "Tentar de novo" grava uma entrega nova e deixa a recusada no
 * histórico). A API manda a lista do mais novo para o mais antigo ou o inverso; a chave é só a data.
 */
export function describeWhatsAppSendState(
  deliveries: readonly WhatsAppDelivery[],
): readonly WhatsAppSendStateItem[] {
  const latest = new Map<string, WhatsAppDelivery>()
  for (const delivery of deliveries) {
    if (delivery.numberMasked === null) continue
    const current = latest.get(delivery.numberMasked)
    if (current === undefined || delivery.createdAt > current.createdAt) {
      latest.set(delivery.numberMasked, delivery)
    }
  }
  return [...latest.values()]
    .flatMap((delivery): WhatsAppSendStateItem[] => {
      const numberMasked = delivery.numberMasked ?? ''
      if (delivery.status === 'sent') {
        return [
          {
            at: delivery.sentAt ?? delivery.createdAt,
            canRetry: false,
            deliveryId: delivery.id,
            numberMasked,
            offerEmail: false,
            reason: null,
            state: 'sent',
          },
        ]
      }
      if (delivery.status === 'queued' || delivery.status === 'pending_window') {
        return [
          {
            at: delivery.createdAt,
            canRetry: false,
            deliveryId: delivery.id,
            numberMasked,
            offerEmail: false,
            reason: null,
            state: 'queued',
          },
        ]
      }
      if (delivery.status === 'failed') {
        const failure = describeWhatsAppFailure(delivery.reason)
        return [
          {
            at: delivery.createdAt,
            canRetry: failure.canRetry,
            deliveryId: delivery.id,
            numberMasked,
            offerEmail: failure.offerEmail,
            reason: failure.key,
            state: 'failed',
          },
        ]
      }
      return []
    })
    .toSorted((first, second) => first.at.localeCompare(second.at))
}
