/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OccurrenceConversationChannel } from './occurrenceConversation.types'

export const CONVERSATION_PARTICIPANTS = ['contractor', 'driver', 'operator'] as const
export type ConversationParticipant = (typeof CONVERSATION_PARTICIPANTS)[number]

/** Ícone do catálogo (`@/components/ui/icon`) e tom de cor de cada quem fala: nunca repetem entre si. */
export const PARTICIPANT_APPEARANCE = {
  contractor: { icon: 'organization', tone: 'contractor' },
  driver: { icon: 'truck', tone: 'driver' },
  operator: { icon: 'workspace-operations', tone: 'operator' },
} as const satisfies Record<ConversationParticipant, { icon: string; tone: string }>

/** Ícone de cada canal; o nome do canal sempre vai ao lado (ícone + palavra). */
export const CHANNEL_ICONS = {
  app: 'workspace-driver-trip',
  email: 'message',
  portal: 'link',
  whatsapp: 'workspace-notification',
} as const satisfies Record<OccurrenceConversationChannel, string>
