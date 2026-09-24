/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF14 (D7): o status da mensagem enviada, por canal. Cada canal mostra a confirmação que
 * consegue dar — e só ela: o e-mail não tem "lida", o app não passa por "enviada", o portal nasce
 * disponível. O estado só avança (um `delivered` atrasado não desfaz um `read`), cada transição
 * guarda o horário, e o evento repetido do provedor não muda nada — é o que torna o webhook de status
 * idempotente além do `unique` do id do provedor.
 */
import type {
  OccurrenceConversationChannel,
  OccurrenceConversationMessageStatus,
} from '../../database/occurrence-conversation.schema.js'

export type MessageStatusState = {
  readonly status: OccurrenceConversationMessageStatus
  readonly statusTimes: Readonly<Record<string, string>>
}

export type MessageStatusResult =
  | (MessageStatusState & { readonly changed: true })
  | (MessageStatusState & {
      readonly changed: false
      /** `unsupported`: o canal não dá essa confirmação; `stale`: chegou tarde; `duplicate`: repetido. */
      readonly reason: 'duplicate' | 'stale' | 'unsupported'
    })

type ChannelRule = {
  /** Os estados de sucesso, em ordem. */
  readonly ladder: readonly OccurrenceConversationMessageStatus[]
  /** Os estados de falha — só alcançáveis antes de o canal confirmar a entrega. */
  readonly failures: readonly OccurrenceConversationMessageStatus[]
  /** Até que degrau da escada a falha ainda vale. */
  readonly failableUntil: OccurrenceConversationMessageStatus | null
}

const CHANNEL_RULES: Readonly<Record<OccurrenceConversationChannel, ChannelRule>> = {
  app: { failableUntil: null, failures: [], ladder: ['queued', 'delivered', 'read'] },
  email: {
    failableUntil: 'sent',
    failures: ['bounced', 'failed'],
    ladder: ['queued', 'sent', 'delivered'],
  },
  portal: { failableUntil: null, failures: [], ladder: ['delivered', 'read'] },
  whatsapp: {
    failableUntil: 'sent',
    failures: ['failed'],
    ladder: ['queued', 'sent', 'delivered', 'read'],
  },
}

/** Onde a mensagem enviada nasce: na fila, menos no portal, onde gravada já é disponível. */
export function initialOutboundStatus(
  channel: OccurrenceConversationChannel,
): OccurrenceConversationMessageStatus {
  const [first] = CHANNEL_RULES[channel].ladder
  if (first === undefined) throw new Error('OCCURRENCE_CONVERSATION_CHANNEL_WITHOUT_STATUS')
  return first
}

function unchanged(
  current: MessageStatusState,
  reason: 'duplicate' | 'stale' | 'unsupported',
): MessageStatusResult {
  return { changed: false, reason, status: current.status, statusTimes: current.statusTimes }
}

export function applyMessageStatus(input: {
  readonly at: string
  readonly channel: OccurrenceConversationChannel
  readonly current: MessageStatusState
  readonly incoming: OccurrenceConversationMessageStatus
}): MessageStatusResult {
  const rule = CHANNEL_RULES[input.channel]
  const { current, incoming } = input
  const incomingRank = rule.ladder.indexOf(incoming)
  const isFailure = rule.failures.includes(incoming)
  if (incomingRank < 0 && !isFailure) return unchanged(current, 'unsupported')
  if (incoming === current.status) return unchanged(current, 'duplicate')
  if (rule.failures.includes(current.status)) return unchanged(current, 'stale')

  const currentRank = rule.ladder.indexOf(current.status)
  const withTime = { ...current.statusTimes, [incoming]: input.at }

  if (isFailure) {
    const limit = rule.failableUntil === null ? -1 : rule.ladder.indexOf(rule.failableUntil)
    if (currentRank > limit) return unchanged(current, 'stale')
    return { changed: true, status: incoming, statusTimes: withTime }
  }
  if (incomingRank > currentRank) {
    return { changed: true, status: incoming, statusTimes: withTime }
  }
  /** Chegou atrasado: o status fica, mas o horário que faltava entra — o selo mostra os horários. */
  if (current.statusTimes[incoming] === undefined) {
    return { changed: true, status: current.status, statusTimes: withTime }
  }
  return unchanged(current, 'stale')
}
