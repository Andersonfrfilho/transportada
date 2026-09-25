/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { PortalConversationMessage } from '@/modules/shared/portal.types'

/** O limite do texto, igual ao da API (`OCCURRENCE_MAIL_LIMITS.body`). */
const MESSAGE_LIMIT = 8000

export type ConversationDraft =
  | Readonly<{ body: string; ok: true }>
  | Readonly<{ message: string; ok: false }>

/** O rascunho sai aparado; em branco ou longo demais, a frase do que falta — sem ir à API. */
export function validateConversationDraft(text: string): ConversationDraft {
  const body = text.trim()
  if (body === '') return { message: 'Escreva a mensagem.', ok: false }
  if (body.length > MESSAGE_LIMIT) {
    return { message: 'A mensagem passa de 8.000 caracteres.', ok: false }
  }
  return { body, ok: true }
}

/**
 * Uma chave por mensagem escrita: o reenvio do mesmo clique (rede ruim) não duplica a mensagem, e a
 * próxima mensagem ganha chave nova. Cabe no formato da API (`[A-Za-z0-9._:-]{16,256}`).
 */
export function createConversationIdempotencyKey(): string {
  return `portal-message:${crypto.randomUUID()}`
}

export type ConversationDay = Readonly<{
  day: string
  messages: readonly PortalConversationMessage[]
}>

const dayFormatter = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short' })

function localDay(iso: string): string {
  const moment = new Date(iso)
  return Number.isNaN(moment.getTime()) ? iso : dayFormatter.format(moment)
}

/** O fio por dia, na ordem em que chegou — o divisor de data do pacote vai entre os dias. */
export function groupConversationByDay(
  messages: readonly PortalConversationMessage[],
  dayKey: (iso: string) => string = localDay,
): readonly ConversationDay[] {
  const groups: { day: string; messages: PortalConversationMessage[] }[] = []
  for (const message of messages) {
    const day = dayKey(message.createdAt)
    const last = groups.at(-1)
    if (last?.day === day) last.messages.push(message)
    else groups.push({ day, messages: [message] })
  }
  return groups
}

export type PortalMessageView = Readonly<{
  align: 'left' | 'right'
  author: string
  channel: string
  tone: 'carrier' | 'contractor'
}>

const CHANNEL_LABEL: Readonly<Record<PortalConversationMessage['channel'], string>> = {
  email: 'por e-mail',
  portal: 'pelo portal',
  whatsapp: 'pelo WhatsApp',
}

/**
 * D9: a contratante lê, então o lado dela é a direita; a cor segue o participante (transportadora
 * sempre cobre, contratante sempre azul). A transportadora aparece como empresa, nunca pelo nome de
 * quem escreveu — e a mensagem de um colega por e-mail ou WhatsApp é "Sua equipe".
 */
export function describePortalMessage(message: PortalConversationMessage): PortalMessageView {
  const channel = CHANNEL_LABEL[message.channel]
  if (message.side === 'carrier') {
    return { align: 'left', author: 'Transportadora', channel, tone: 'carrier' }
  }
  return {
    align: 'right',
    author: message.mine ? 'Você' : 'Sua equipe',
    channel,
    tone: 'contractor',
  }
}

export function conversationToggleLabel(unreadCount: number): string {
  const base = 'Conversa com a transportadora'
  if (unreadCount <= 0) return base
  return `${base} (${unreadCount} ${unreadCount === 1 ? 'nova' : 'novas'})`
}
