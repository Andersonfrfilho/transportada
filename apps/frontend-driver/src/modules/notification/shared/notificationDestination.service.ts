/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverConversationSubject } from '@/modules/shared/driverRoute.service'

export const CONVERSATION_MESSAGE_TEMPLATE_KEY = 'trip.conversation-message'

export type NotificationDestination =
  | Readonly<{ kind: 'conversation'; subject: DriverConversationSubject }>
  | Readonly<{ kind: 'conversations' }>
  | Readonly<{ kind: 'stay' }>

type NotificationDestinationInput = Readonly<{
  payload: Readonly<Record<string, unknown>>
  templateKey: string
}>

/** O sino só navega: o aviso de conversa abre o assunto quando o payload o traz, senão a lista. */
export function resolveNotificationDestination(
  input: NotificationDestinationInput,
): NotificationDestination {
  if (input.templateKey !== CONVERSATION_MESSAGE_TEMPLATE_KEY) return { kind: 'stay' }
  const { subjectId, subjectType } = input.payload
  if (typeof subjectType === 'string' && typeof subjectId === 'string') {
    return { kind: 'conversation', subject: { subjectId, subjectType } }
  }
  return { kind: 'conversations' }
}
