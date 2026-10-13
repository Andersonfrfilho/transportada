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
  target: ContractorReplyEmailTarget
}>

/** O que o servidor diz do retorno desta ocorrência; o endereço da nota só chega mascarado. */
export type ContractorReplyEmailOptions = Readonly<{
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
    (CONTRACTOR_REPLY_EMAIL_TARGETS as readonly unknown[]).includes(value.target)
  )
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
