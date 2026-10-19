/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T703 (P8, RF14, D7): o selo de status da mensagem que sai.
 *
 * - Cada canal só mostra a confirmação que ele sabe dar. As escadas são cópia por valor das da
 *   política da API (`message-status.policy.ts`), com contrato de paridade; o e-mail não tem "lida"
 *   e o portal não tem "na fila".
 * - Os passos saem na ordem do canal, cada um com o horário que a API gravou; passo sem horário não
 *   aparece. Falha e devolução entram como o último passo e viram o motivo do destaque.
 * - "Reenviar por outro canal" escolhe **outro** canal da mesma parte, e só quando ele existe.
 */
import type {
  OccurrenceConversationChannel,
  OccurrenceConversationMessage,
  OccurrenceConversationMessageStatus,
} from './occurrenceConversation.types'

export const CONVERSATION_STATUS_LADDERS: Readonly<
  Record<OccurrenceConversationChannel, readonly OccurrenceConversationMessageStatus[]>
> = {
  app: ['queued', 'delivered', 'read'],
  email: ['queued', 'sent', 'delivered', 'read'],
  portal: ['delivered', 'read'],
  whatsapp: ['queued', 'sent', 'delivered', 'read'],
}

const FAILURES: readonly OccurrenceConversationMessageStatus[] = ['bounced', 'failed']

export type MessageStatusFailure = 'bounced' | 'failed'

export type MessageStatusView = Readonly<{
  failure: MessageStatusFailure | null
  steps: readonly Readonly<{ at: string; status: OccurrenceConversationMessageStatus }>[]
  value: OccurrenceConversationMessageStatus
}>

function isFailure(status: OccurrenceConversationMessageStatus): status is MessageStatusFailure {
  return FAILURES.includes(status)
}

export function describeMessageStatus(
  message: OccurrenceConversationMessage,
): MessageStatusView | null {
  if (message.direction !== 'outbound' || message.status === null) return null
  const ladder = CONVERSATION_STATUS_LADDERS[message.channel]
  const steps = ladder.flatMap((status) => {
    const at = message.statusTimes[status]
    return at === undefined ? [] : [{ at, status }]
  })

  if (isFailure(message.status)) {
    const at = message.statusTimes[message.status]
    return {
      failure: message.status,
      steps: at === undefined ? steps : [...steps, { at, status: message.status }],
      value: message.status,
    }
  }
  /** Status que o canal não dá (o "lida" de um e-mail) vira o último passo que ele deu. */
  const value = ladder.includes(message.status)
    ? message.status
    : (steps.at(-1)?.status ?? ladder[0] ?? message.status)
  return { failure: null, steps, value }
}

/**
 * O outro canal da mesma parte. A contratante: portal quando ela tem conta ligada; se a falha foi
 * no WhatsApp, o e-mail serve. O motorista: o app, que não falha.
 */
export function resendChannelFor(
  message: OccurrenceConversationMessage,
  context: Readonly<{ participant: 'contractor' | 'driver'; portalAvailable: boolean }>,
): OccurrenceConversationChannel | null {
  if (message.direction !== 'outbound' || message.status === null) return null
  if (!isFailure(message.status)) return null
  if (context.participant === 'driver') return message.channel === 'app' ? null : 'app'
  if (context.portalAvailable && message.channel !== 'portal') return 'portal'
  return message.channel === 'whatsapp' ? 'email' : null
}

/**
 * Spec 274: a releitura automática do e-mail para em "entregue". A "lida" vem do pixel de abertura e pode nunca chegar
 * (cliente que bloqueia imagem); esperar por ela relia a conversa para sempre.
 */
const POLLING_SETTLES_AT: Partial<Record<keyof typeof CONVERSATION_STATUS_LADDERS, string>> = {
  email: 'delivered',
}

/** Alguma mensagem que sai ainda pode avançar na escada do canal dela. */
export function hasPendingOutboundStatus(
  messages: readonly OccurrenceConversationMessage[],
): boolean {
  return messages.some((message) => {
    if (message.direction !== 'outbound' || message.status === null) return false
    if (isFailure(message.status)) return false
    const ladder: readonly string[] = CONVERSATION_STATUS_LADDERS[message.channel]
    const settled = POLLING_SETTLES_AT[message.channel]
    const last = settled === undefined ? ladder.length - 1 : ladder.indexOf(settled)
    return ladder.indexOf(message.status) < last
  })
}
