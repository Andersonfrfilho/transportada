/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T1 (D1–D5, RF1, RF2, RF5): o contrato da conversa do cliente — o terceiro participante da ocorrência, ao
 * lado da contratante e do motorista. Contrato completo para o painel em
 * `specs/283-a-conversa-do-cliente-abre-no-chat/contract.md`.
 *
 * - **Uma conversa por ocorrência e contato (D1).** O contato é o cliente da entrega (`tax_id` do destinatário da
 *   nota). Só a ocorrência de nota envia ao cliente, e a nota tem um destinatário só: o único que já existe
 *   (`company_id, occurrence_kind, occurrence_id, participant`) é, para `client`, por ocorrência e contato.
 * - **Nasce no primeiro envio (D3)** — a primeira entrega de alvo de cliente com destino (`client_boleto_emails`,
 *   `client_boleto_whatsapp`); sem envio, não existe.
 * - **Idempotente por ocorrência, contato e envio (RF2).** Uma mensagem por entrega (`client_delivery_id`); repetir
 *   o fechamento ou o reenvio da mesma entrega não grava outra. O reenvio é entrega nova, e entra na mesma conversa.
 * - **Os canais são etiquetas da conversa (D4/D8)**, nunca outra conversa: cada número e cada e-mail com estado.
 *
 * Nada aqui decide (spec 183 D4): é leitura do que o trilho de entrega da 248/279/281 já gravou.
 */
import type { OccurrenceConversationMessageStatus } from '../../database/occurrence-conversation.schema.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import type { ContractorReplyDeliveryStatus } from '../../shared/occurrence-contractor-reply.constant.js'
import { toWhatsAppPhoneKey } from '../../whatsapp-commands/domain/whatsapp-phone-key.policy.js'
import { maskClientWhatsAppNumber } from './contractor-reply-whatsapp-number.policy.js'

export const CLIENT_CONVERSATION_PARTICIPANT = 'client'

/** Os dois canais do cliente: o e-mail só leva o enviado e o estado (fora do escopo responder por ele). */
export const CLIENT_CONVERSATION_CHANNELS = ['email', 'whatsapp'] as const
export type ClientConversationChannel = (typeof CLIENT_CONVERSATION_CHANNELS)[number]

/** As entregas da 248 que abrem e alimentam a conversa do cliente, e o canal de cada uma. */
export const CLIENT_CONVERSATION_DELIVERY_TARGETS = {
  client_boleto_emails: 'email',
  client_boleto_whatsapp: 'whatsapp',
} as const satisfies Readonly<Record<string, ClientConversationChannel>>
export type ClientConversationDeliveryTarget = keyof typeof CLIENT_CONVERSATION_DELIVERY_TARGETS

/** D4: o estado de um canal na faixa "Canais abertos". `replied` só existe no WhatsApp (D5). */
export const CLIENT_CHANNEL_STATES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'replied',
  'failed',
] as const
export type ClientChannelState = (typeof CLIENT_CHANNEL_STATES)[number]

/** Quem mandou: o escritório, o motorista pelo app ou o Sistema (envio automático) — o mesmo do aviso da 279. */
export const CLIENT_DELIVERY_ACTOR_KINDS = ['driver', 'office', 'system'] as const
export type ClientDeliveryActorKind = (typeof CLIENT_DELIVERY_ACTOR_KINDS)[number]

/**
 * RF1/RF5: o estado com que a mensagem do cliente nasce e acompanha a entrega. `skipped` e `pending_window` não
 * saíram para ninguém e não viram mensagem (`null`). `delivered` e `read` só vêm do provedor, depois.
 */
export function clientMessageStatusFromDelivery(
  status: ContractorReplyDeliveryStatus,
): null | OccurrenceConversationMessageStatus {
  switch (status) {
    case 'queued':
    case 'sent':
    case 'failed':
      return status
    case 'pending_window':
    case 'skipped':
      return null
  }
}

/** RF7: o destino nunca sai em claro — o número como `+55 ••••1234`, o e-mail como `fu•••@dominio`. */
export function maskClientAddress(channel: ClientConversationChannel, address: string): string {
  return channel === 'whatsapp' ? maskClientWhatsAppNumber(address) : maskEmailAddress(address)
}

/**
 * A mesma pessoa é o mesmo e-mail sem caixa ou o mesmo número pela chave do WhatsApp (`55` + DDD + oito últimos
 * dígitos): o WhatsApp entrega o mesmo celular com e sem o nono dígito.
 */
export function clientAddressKey(channel: ClientConversationChannel, address: string): string {
  return channel === 'whatsapp'
    ? toWhatsAppPhoneKey(address.replace(/\D/gu, ''))
    : address.trim().toLowerCase()
}

export type ClientChannelMessage = {
  /** Enviada: o destino da entrega. Recebida: o número de quem respondeu. */
  readonly address: string
  readonly channel: ClientConversationChannel
  readonly createdAt: string
  readonly direction: 'inbound' | 'outbound'
  /** Só a enviada tem estado. */
  readonly status: null | OccurrenceConversationMessageStatus
  /** A entrega que a mensagem conta (envio do boleto); `null` na resposta do painel e na recebida. */
  readonly deliveryId?: null | string
  /** T5 (D6): enviada pelo painel na conversa do cliente, sem entrega — o número já foi confirmado. */
  readonly panelReply?: boolean
}

export type ClientChannelView = {
  readonly addressMasked: string
  readonly channel: ClientConversationChannel
  /** A última atividade do canal (envio ou resposta), ISO. */
  readonly lastActivityAt: string
  readonly state: ClientChannelState
  /** T5 (D6): "Responder por". Só no WhatsApp com entrega; o `id` é a primeira entrega ao número, nunca o número. */
  readonly replyTarget: null | { readonly confirmed: boolean; readonly id: string }
}

function toChannelState(status: OccurrenceConversationMessageStatus | null): ClientChannelState {
  if (status === null) return 'queued'
  return status === 'bounced' ? 'failed' : status
}

/**
 * D4: a faixa "Canais abertos". Entra cada destino que teve atividade na conversa **e continua no cadastro do
 * cliente** (contato removido: a conversa fica, o canal some da faixa). O estado é o da última enviada ao destino;
 * resposta depois dela é `replied`. Ordem: a primeira atividade primeiro, para a faixa não trocar de lugar.
 */
export function resolveClientChannels(input: {
  readonly contacts: readonly {
    readonly address: string
    readonly channel: ClientConversationChannel
  }[]
  readonly messages: readonly ClientChannelMessage[]
}): readonly ClientChannelView[] {
  const current = new Set(
    input.contacts.map(
      (contact) => `${contact.channel}:${clientAddressKey(contact.channel, contact.address)}`,
    ),
  )
  const byAddress = new Map<
    string,
    {
      address: string
      channel: ClientConversationChannel
      confirmed: boolean
      first: string
      firstDeliveryId: null | string
      last: string
      lastOutbound: ClientChannelMessage | null
      lastInboundAt: null | string
    }
  >()
  const ordered = [...input.messages].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )
  for (const message of ordered) {
    const key = `${message.channel}:${clientAddressKey(message.channel, message.address)}`
    if (!current.has(key)) continue
    const entry = byAddress.get(key) ?? {
      address: message.address,
      channel: message.channel,
      confirmed: false,
      first: message.createdAt,
      firstDeliveryId: null,
      last: message.createdAt,
      lastInboundAt: null,
      lastOutbound: null,
    }
    entry.last = message.createdAt
    if (message.direction === 'outbound') entry.lastOutbound = message
    else entry.lastInboundAt = message.createdAt
    entry.firstDeliveryId ??= message.deliveryId ?? null
    if (message.panelReply === true) entry.confirmed = true
    byAddress.set(key, entry)
  }
  return (
    [...byAddress.values()]
      // Dois envios na mesma transacao tem o mesmo instante: o endereco desempata, para a faixa nao trocar de ordem.
      .sort(
        (left, right) =>
          left.first.localeCompare(right.first) || left.address.localeCompare(right.address),
      )
      .map((entry) => {
        const repliedAfterSend =
          entry.lastInboundAt !== null &&
          (entry.lastOutbound === null || entry.lastInboundAt >= entry.lastOutbound.createdAt)
        return {
          addressMasked: maskClientAddress(entry.channel, entry.address),
          channel: entry.channel,
          lastActivityAt: entry.last,
          replyTarget:
            entry.channel === 'whatsapp' && entry.firstDeliveryId !== null
              ? { confirmed: entry.confirmed, id: entry.firstDeliveryId }
              : null,
          state: repliedAfterSend ? 'replied' : toChannelState(entry.lastOutbound?.status ?? null),
        }
      })
  )
}

/**
 * T5 (D6): o número de "Responder por" a partir do `replyTargetId` da faixa. Só um canal de WhatsApp que ainda está
 * na faixa (contato no cadastro) responde; outro id, de outra conversa ou de contato removido, é `null` (a rota
 * responde 404 sem dizer qual).
 */
export function resolveClientReplyTarget(input: {
  readonly contacts: readonly {
    readonly address: string
    readonly channel: ClientConversationChannel
  }[]
  readonly messages: readonly ClientChannelMessage[]
  readonly replyTargetId: string
}): null | { readonly address: string; readonly confirmed: boolean } {
  const source = input.messages.find(
    (message) =>
      message.channel === 'whatsapp' &&
      message.direction === 'outbound' &&
      message.deliveryId === input.replyTargetId,
  )
  if (source === undefined) return null
  const key = clientAddressKey('whatsapp', source.address)
  const channel = resolveClientChannels(input).find(
    (entry) =>
      entry.channel === 'whatsapp' &&
      entry.replyTarget !== null &&
      entry.replyTarget.id === input.replyTargetId,
  )
  if (channel?.replyTarget === undefined || channel.replyTarget === null) return null
  const latest = [...input.messages]
    .filter(
      (message) =>
        message.channel === 'whatsapp' &&
        message.direction === 'outbound' &&
        clientAddressKey('whatsapp', message.address) === key,
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1)
  return { address: latest?.address ?? source.address, confirmed: channel.replyTarget.confirmed }
}
