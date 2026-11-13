/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './occurrenceConversationGuards.validation'
import {
  OCCURRENCE_CONVERSATION_ERROR,
  OccurrenceConversationRequestError,
  requestJson,
  type ClientDependencies,
} from './occurrenceConversationClient.service'

/**
 * Spec 324 T4: o botão "Avisar a contratante". O estado vem de `GET /trip-occurrences/:id/contractor-notice` (T3) e o
 * envio é `POST` no mesmo caminho, sem corpo — o canal e o texto são do servidor (D2), o painel só mostra e confirma.
 */
export type ContractorNoticeChannel = 'email' | 'whatsapp_group'

export type ContractorNoticePreview = Readonly<{ bodyText: string; subject: null | string }>

export type ContractorNoticeState =
  | Readonly<{
      actorName: null | string
      at: string
      by: 'automatic' | 'manual'
      channel: ContractorNoticeChannel | null
      status: 'notified'
    }>
  | Readonly<{
      channel: ContractorNoticeChannel
      preview: ContractorNoticePreview | null
      recipientCount: number | null
      status: 'available'
    }>
  | Readonly<{ reason: 'blocked' | 'no_recipient' | 'no_template'; status: 'unavailable' }>

export type ContractorNoticeSkipReason =
  | 'mail_not_ready'
  | 'no_recipient'
  | 'no_template_selected'
  | 'other'

export type ContractorNoticeOutcome =
  | Readonly<{ channel: ContractorNoticeChannel; kind: 'sent' }>
  | Readonly<{ kind: 'failed' }>
  | Readonly<{ kind: 'skipped'; reason: ContractorNoticeSkipReason }>

export type ContractorNoticeClient = Readonly<{
  readContractorNoticeState: (input: { occurrenceId: string }) => Promise<ContractorNoticeState>
  sendContractorNotice: (input: { occurrenceId: string }) => Promise<ContractorNoticeOutcome>
}>

const CHANNELS: readonly string[] = ['email', 'whatsapp_group']
const UNAVAILABLE_REASONS: readonly string[] = ['blocked', 'no_recipient', 'no_template']

function invalid(): never {
  throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
}

function readChannel(value: unknown): ContractorNoticeChannel | null {
  return isString(value) && CHANNELS.includes(value) ? (value as ContractorNoticeChannel) : null
}

function readPreview(value: unknown): ContractorNoticePreview | null {
  if (!isRecord(value) || !isString(value.bodyText)) return null
  return { bodyText: value.bodyText, subject: isString(value.subject) ? value.subject : null }
}

export function readContractorNoticeState(payload: unknown): ContractorNoticeState {
  const data = isRecord(payload) ? payload.data : undefined
  if (!isRecord(data)) return invalid()
  if (data.status === 'notified') {
    if (!isString(data.at) || (data.by !== 'automatic' && data.by !== 'manual')) return invalid()
    return {
      actorName: isString(data.actorName) ? data.actorName : null,
      at: data.at,
      by: data.by,
      channel: readChannel(data.channel),
      status: 'notified',
    }
  }
  if (data.status === 'available') {
    const channel = readChannel(data.channel)
    if (channel === null) return invalid()
    return {
      channel,
      preview: readPreview(data.preview),
      recipientCount: typeof data.recipientCount === 'number' ? data.recipientCount : null,
      status: 'available',
    }
  }
  if (data.status === 'unavailable' && isString(data.reason)) {
    if (!UNAVAILABLE_REASONS.includes(data.reason)) return invalid()
    return {
      reason: data.reason as 'blocked' | 'no_recipient' | 'no_template',
      status: 'unavailable',
    }
  }
  return invalid()
}

function skipReason(value: unknown): ContractorNoticeSkipReason {
  if (value === 'mail_not_ready' || value === 'no_recipient' || value === 'no_template_selected') {
    return value
  }
  return 'other'
}

/** `group_failed` com a reserva por e-mail enviada conta como enviado, pelo e-mail (o servidor já fechou o aviso). */
export function readContractorNoticeOutcome(payload: unknown): ContractorNoticeOutcome {
  const data = isRecord(payload) ? payload.data : undefined
  if (!isRecord(data)) return invalid()
  if (data.outcome === 'sent') return { channel: 'email', kind: 'sent' }
  if (data.outcome === 'sent_to_group') return { channel: 'whatsapp_group', kind: 'sent' }
  if (data.outcome === 'group_failed') {
    const fallback = data.fallback
    return isRecord(fallback) && fallback.outcome === 'sent'
      ? { channel: 'email', kind: 'sent' }
      : { kind: 'failed' }
  }
  if (data.outcome === 'skipped') return { kind: 'skipped', reason: skipReason(data.reason) }
  return invalid()
}

export function createContractorNoticeClient(
  dependencies: ClientDependencies,
): ContractorNoticeClient {
  const path = (occurrenceId: string) =>
    `/trip-occurrences/${encodeURIComponent(occurrenceId)}/contractor-notice`
  return {
    async readContractorNoticeState({ occurrenceId }) {
      return readContractorNoticeState(await requestJson(dependencies, path(occurrenceId)))
    },
    async sendContractorNotice({ occurrenceId }) {
      return readContractorNoticeOutcome(
        await requestJson(dependencies, path(occurrenceId), { method: 'POST' }),
      )
    },
  }
}
