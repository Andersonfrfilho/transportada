/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 287: a conversa do cliente é uma por canal. O WhatsApp é a conversa `client`; o e-mail é a `client_email`.
 * Os e-mails mais antigos (o boleto enviado antes da separação) moram na conversa do WhatsApp e entram no canal de
 * e-mail pela mensagem. A separação por canal só aparece quando o cliente tem mais de um canal disponível.
 */
import type {
  OccurrenceConversation,
  OccurrenceConversationMessage,
} from './occurrenceConversation.types'

export type ClientChannelId = 'email' | 'whatsapp'

export function findClientEmailConversation(
  conversations: readonly OccurrenceConversation[] | undefined,
): OccurrenceConversation | undefined {
  return conversations?.find((conversation) => conversation.participant === 'client_email')
}

/** Os canais do cliente com conversa própria; vazio quando há um só (o chat segue sem abas). */
export function resolveClientChannelTabs(input: {
  client: OccurrenceConversation | undefined
  email: OccurrenceConversation | undefined
}): readonly ClientChannelId[] {
  const channels = input.client?.client?.channels ?? []
  const hasWhatsApp = channels.some((channel) => channel.kind === 'whatsapp')
  const hasEmail = input.email !== undefined || channels.some((channel) => channel.kind === 'email')
  return hasWhatsApp && hasEmail ? ['whatsapp', 'email'] : []
}

export function selectClientChannelMessages(input: {
  channel: ClientChannelId
  client: OccurrenceConversation | undefined
  email: OccurrenceConversation | undefined
}): readonly OccurrenceConversationMessage[] {
  const own = input.client?.messages ?? []
  if (input.channel === 'whatsapp') return own.filter((message) => message.channel !== 'email')
  return [
    ...own.filter((message) => message.channel === 'email'),
    ...(input.email?.messages ?? []),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}
