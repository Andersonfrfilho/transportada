/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 248 RF9–RF11 (T4.7): o boleto da contratante levado por e-mail ao cliente da nota ou a um endereço que o
 * operador informa. Aqui ficam os contratos de leitura (chaves exatas, tolerantes à ausência de dado), a regra do
 * endereço — a mesma da API: um endereço só, sem vírgula, ponto e vírgula, `<>` nem quebra de linha — e a
 * decisão pura de quando cada botão é oferecido, com o motivo à vista.
 */
import { isRecord, isString } from './occurrenceConversationGuards.validation'

export const CONTRACTOR_REPLY_EMAIL_TARGETS = ['note_recipient_email', 'informed_email'] as const
export type ContractorReplyEmailTarget = (typeof CONTRACTOR_REPLY_EMAIL_TARGETS)[number]

/** Spec 279 T3: o alvo que a 248 ganhou — os e-mails do cadastro do cliente; só aparece nas entregas. */
export const CLIENT_BOLETO_EMAILS_TARGET = 'client_boleto_emails'
const DELIVERY_TARGETS = [...CONTRACTOR_REPLY_EMAIL_TARGETS, CLIENT_BOLETO_EMAILS_TARGET] as const
export type ContractorReplyEmailDeliveryTarget = (typeof DELIVERY_TARGETS)[number]

/** Spec 279 RF9: `off` esconde o botão do cliente; os outros são os tipos de e-mail do cadastro (D1). */
export const CLIENT_EMAIL_TYPES = ['off', 'boleto', 'invoice', 'finance', 'general'] as const
export type ClientEmailType = (typeof CLIENT_EMAIL_TYPES)[number]

export const CONTRACTOR_REPLY_EMAIL_ADDRESS_MAX_LENGTH = 254

const DELIVERY_STATUSES = ['queued', 'sent', 'pending_window', 'skipped', 'failed'] as const
type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const CONTRACTOR_REPLY_EMAIL_ERROR = {
  ADDRESS_INVALID: 'CONTRACTOR_REPLY_EMAIL_ADDRESS_INVALID',
  FORWARD_DISABLED: 'CONTRACTOR_REPLY_EMAIL_FORWARD_DISABLED',
  KEY_REUSED: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED',
  LIMIT_REACHED: 'CONTRACTOR_REPLY_EMAIL_LIMIT_REACHED',
  MAIL_NOT_READY: ['CONTRACTOR_MAIL_NOT_CONFIGURED', 'CONTRACTOR_MAIL_SENDING_NOT_VERIFIED'],
} as const

export type ContractorReplyEmailDelivery = Readonly<{
  addressMasked: null | string
  createdAt: string
  id: string
  reason: null | string
  status: DeliveryStatus
  target: ContractorReplyEmailDeliveryTarget
}>

/** O que o servidor diz do retorno desta ocorrência; o endereço da nota só chega mascarado. */
export type ClientEmailOption = Readonly<{ addressMasked: string; emailId: string; label: string }>

export type ContractorReplyEmailOptions = Readonly<{
  /** Spec 279 T3: o tipo do e-mail do cliente que o tipo da ocorrência usa; `off` não oferece o envio. */
  clientEmailType: ClientEmailType
  /** Spec 279 T3: os e-mails do cadastro daquele tipo, mascarados; o envio escolhe por `emailId`. */
  clientEmails: readonly ClientEmailOption[]
  deliveries: readonly ContractorReplyEmailDelivery[]
  forwardToInformedEmail: 'manual' | 'off'
  forwardToNoteRecipient: 'automatic' | 'manual' | 'off'
  noteRecipient: Readonly<{ addressMasked: null | string; isAvailable: boolean }>
  sentCount: number
  sentLimit: number
}>

export type ContractorReplyEmailOutcome =
  | Readonly<{ addressMasked: null | string; kind: 'queued' }>
  | Readonly<{ addressMasked: null | string; kind: 'already_queued' }>
  | Readonly<{ kind: 'failed'; reason: string }>
  | Readonly<{ kind: 'skipped'; reason: string }>

function isDelivery(value: unknown): value is ContractorReplyEmailDelivery {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.createdAt) &&
    (value.addressMasked === null || isString(value.addressMasked)) &&
    (value.reason === null || isString(value.reason)) &&
    (DELIVERY_STATUSES as readonly unknown[]).includes(value.status) &&
    (DELIVERY_TARGETS as readonly unknown[]).includes(value.target)
  )
}

function isClientEmailOption(value: unknown): value is ClientEmailOption {
  return (
    isRecord(value) &&
    isString(value.addressMasked) &&
    isString(value.emailId) &&
    isString(value.label)
  )
}

/** Resposta de API anterior à 279 não traz o campo: sem ele, o botão do cliente não existe. */
function readClientEmailType(value: unknown): ClientEmailType {
  return CLIENT_EMAIL_TYPES.find((type) => type === value) ?? 'off'
}

/** `null` é "esta ocorrência não tem retorno": nenhum botão. Resposta malformada vira `null` também. */
export function readContractorReplyEmailOptions(
  payload: unknown,
): ContractorReplyEmailOptions | null {
  const data = isRecord(payload) ? payload.data : undefined
  if (!isRecord(data) || !Array.isArray(data.deliveries) || !isRecord(data.noteRecipient)) {
    return null
  }
  const { noteRecipient } = data
  const isModeValid =
    (data.forwardToInformedEmail === 'off' || data.forwardToInformedEmail === 'manual') &&
    (data.forwardToNoteRecipient === 'off' ||
      data.forwardToNoteRecipient === 'manual' ||
      data.forwardToNoteRecipient === 'automatic')
  if (
    !isModeValid ||
    typeof noteRecipient.isAvailable !== 'boolean' ||
    !(noteRecipient.addressMasked === null || isString(noteRecipient.addressMasked)) ||
    typeof data.sentCount !== 'number' ||
    typeof data.sentLimit !== 'number'
  ) {
    return null
  }
  return {
    clientEmailType: readClientEmailType(data.clientEmailType),
    clientEmails: Array.isArray(data.clientEmails)
      ? data.clientEmails.filter(isClientEmailOption)
      : [],
    deliveries: data.deliveries.filter(isDelivery),
    forwardToInformedEmail: data.forwardToInformedEmail as 'manual' | 'off',
    forwardToNoteRecipient: data.forwardToNoteRecipient as 'automatic' | 'manual' | 'off',
    noteRecipient: {
      addressMasked: noteRecipient.addressMasked,
      isAvailable: noteRecipient.isAvailable,
    },
    sentCount: data.sentCount,
    sentLimit: data.sentLimit,
  }
}

export function readContractorReplyEmailOutcome(payload: unknown): ContractorReplyEmailOutcome {
  const data = isRecord(payload) ? payload.data : undefined
  if (isRecord(data)) {
    const addressMasked = isString(data.addressMasked) ? data.addressMasked : null
    const reason = isString(data.reason) ? data.reason : ''
    if (data.kind === 'queued') return { addressMasked, kind: 'queued' }
    if (data.kind === 'already_queued') return { addressMasked, kind: 'already_queued' }
    if (data.kind === 'skipped') return { kind: 'skipped', reason }
    if (data.kind === 'failed') return { kind: 'failed', reason }
  }
  throw new Error('CONTRACTOR_REPLY_EMAIL_RESPONSE_INVALID')
}

const UNSAFE_ADDRESS_CHARACTERS = /[\r\n,;<>]/u
const SINGLE_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

/** Espelha a regra da API (RF11); a API segue sendo quem decide, e a recusa dela volta pelo código. */
export function parseInformedAddress(raw: string): null | string {
  const address = raw.trim()
  if (address.length === 0 || address.length > CONTRACTOR_REPLY_EMAIL_ADDRESS_MAX_LENGTH) {
    return null
  }
  if (UNSAFE_ADDRESS_CHARACTERS.test(address)) return null
  return SINGLE_ADDRESS_PATTERN.test(address) ? address : null
}

/** Uma chave por tentativa: o clique repetido reaproveita a mesma, e o envio seguinte ganha outra. */
export function createContractorReplyEmailIdempotencyKey(randomId: () => string): string {
  return `reply-email:${randomId()}`
}

export type EmailActionState =
  | Readonly<{ kind: 'disabled'; reason: 'limitReached' | 'noteWithoutEmail' }>
  | Readonly<{ kind: 'enabled' }>
  | Readonly<{ kind: 'hidden' }>

/** O botão do cliente da nota: some com o modo desligado; fica à vista, desligado e com o motivo, quando não dá. */
export function resolveNoteEmailAction(options: ContractorReplyEmailOptions): EmailActionState {
  if (options.forwardToNoteRecipient === 'off') return { kind: 'hidden' }
  if (!options.noteRecipient.isAvailable) return { kind: 'disabled', reason: 'noteWithoutEmail' }
  if (options.sentCount >= options.sentLimit) return { kind: 'disabled', reason: 'limitReached' }
  return { kind: 'enabled' }
}

export function resolveInformedEmailAction(options: ContractorReplyEmailOptions): EmailActionState {
  if (options.forwardToInformedEmail === 'off') return { kind: 'hidden' }
  if (options.sentCount >= options.sentLimit) return { kind: 'disabled', reason: 'limitReached' }
  return { kind: 'enabled' }
}

/** O texto de erro do envio, pela chave do `occurrenceConversation.json`; o código nunca vira texto cru. */
export function resolveEmailFailureKey(code: string): string {
  if (code === CONTRACTOR_REPLY_EMAIL_ERROR.ADDRESS_INVALID) return 'addressInvalid'
  if (code === CONTRACTOR_REPLY_EMAIL_ERROR.LIMIT_REACHED) return 'limitReached'
  if (code === CONTRACTOR_REPLY_EMAIL_ERROR.FORWARD_DISABLED) return 'forwardDisabled'
  if ((CONTRACTOR_REPLY_EMAIL_ERROR.MAIL_NOT_READY as readonly string[]).includes(code)) {
    return 'mailNotReady'
  }
  return 'generic'
}

export type ClientEmailSendResult = Readonly<{
  addressMasked: string
  kind: 'already_queued' | 'failed' | 'queued' | 'skipped'
  reason: null | string
}>

export type ClientEmailSendOutcome = Readonly<{
  results: readonly ClientEmailSendResult[]
  savedEmailId: null | string
}>

const CLIENT_RESULT_KINDS = ['already_queued', 'failed', 'queued', 'skipped'] as const

/** O resultado por endereço (mascarado) do envio ao cliente; forma inesperada é erro, nunca "enviado". */
export function readClientEmailSendOutcome(payload: unknown): ClientEmailSendOutcome {
  const data = isRecord(payload) ? payload.data : undefined
  if (isRecord(data) && Array.isArray(data.results)) {
    const results: ClientEmailSendResult[] = []
    for (const item of data.results) {
      const kind = isRecord(item)
        ? CLIENT_RESULT_KINDS.find((known) => known === item.kind)
        : undefined
      if (!isRecord(item) || kind === undefined || !isString(item.addressMasked)) {
        throw new Error('CONTRACTOR_REPLY_EMAIL_RESPONSE_INVALID')
      }
      results.push({
        addressMasked: item.addressMasked,
        kind,
        reason: isString(item.reason) ? item.reason : null,
      })
    }
    return { results, savedEmailId: isString(data.savedEmailId) ? data.savedEmailId : null }
  }
  throw new Error('CONTRACTOR_REPLY_EMAIL_RESPONSE_INVALID')
}

export type ClientEmailActionState =
  | Readonly<{ kind: 'add' }>
  | Readonly<{ kind: 'hidden' }>
  | Readonly<{ kind: 'send' }>

/**
 * Spec 279 RF9/RF11/D6: o botão do cliente. `off` esconde; com e-mail guardado é "Enviar ao cliente"; sem
 * nenhum é "Adicionar e-mail" — o escritório nunca fica travado por falta de cadastro.
 */
export function resolveClientEmailAction(
  options: ContractorReplyEmailOptions,
): ClientEmailActionState {
  if (options.clientEmailType === 'off') return { kind: 'hidden' }
  return options.clientEmails.length === 0 ? { kind: 'add' } : { kind: 'send' }
}

/** Estados do retorno em que o boleto já foi aceito — a linha da lista só oferece o botão a partir daí. */
const BOLETO_ACCEPTED_STATUSES = ['reply_received', 'awaiting_operator', 'delivered', 'handled']

export function isContractorReplyBoletoAccepted(status: string): boolean {
  return BOLETO_ACCEPTED_STATUSES.includes(status)
}

/** Uma chave por tentativa; o envio seguinte (com outra escolha) ganha outra. */
export function createClientEmailIdempotencyKey(randomId: () => string): string {
  return `client-email:${randomId()}`
}
