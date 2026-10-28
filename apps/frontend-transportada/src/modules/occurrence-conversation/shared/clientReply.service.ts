/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OccurrenceClientChannel } from './occurrenceConversation.types'

/** Spec 283 T5: o teto do texto da resposta ao cliente (o mesmo da API: 1 a 4000, sem espaço só). */
export const CLIENT_REPLY_BODY_MAX_LENGTH = 4000

export function validateClientReplyDraft(
  draft: string,
): Readonly<{ body: string }> | Readonly<{ error: 'required' | 'tooLong' }> {
  const body = draft.trim()
  if (body === '') return { error: 'required' }
  if (body.length > CLIENT_REPLY_BODY_MAX_LENGTH) return { error: 'tooLong' }
  return { body }
}

/** Uma chave por mensagem escrita: reenviar a mesma (rede caiu, ou depois de confirmar o número) não duplica. */
export function createClientReplyIdempotencyKey(randomId: () => string): string {
  return `client-reply:${randomId()}`
}

export type ClientReplyTarget = Readonly<{
  channel: OccurrenceClientChannel
  confirmed: boolean
  id: string
}>

/** "Responder por": só os números de WhatsApp da faixa; o que respondeu por último vem primeiro. */
export function listClientReplyTargets(
  channels: readonly OccurrenceClientChannel[],
): readonly ClientReplyTarget[] {
  const targets = channels.flatMap((channel) =>
    channel.replyTarget === null
      ? []
      : [{ channel, confirmed: channel.replyTarget.confirmed, id: channel.replyTarget.id }],
  )
  const replied = targets.filter((target) => target.channel.status === 'replied')
  return [...replied, ...targets.filter((target) => target.channel.status !== 'replied')]
}

export type ClientReplyFailure =
  | 'confirmation'
  | 'generic'
  | 'notFound'
  | 'unavailable'
  | 'whatsappOff'

/** Os códigos da rota (contrato 283, T5): cada um vira um aviso que diz o que fazer. */
export function resolveClientReplyFailure(error: unknown): ClientReplyFailure {
  const code = error instanceof Error ? error.message : ''
  if (code === 'OCCURRENCE_CLIENT_REPLY_CONFIRMATION_REQUIRED') return 'confirmation'
  if (
    code === 'OCCURRENCE_CLIENT_WHATSAPP_OFF' ||
    code === 'WHATSAPP_EVOLUTION_NOT_CONFIGURED' ||
    code === 'WHATSAPP_EVOLUTION_DISABLED'
  ) {
    return 'whatsappOff'
  }
  if (code === 'WHATSAPP_EVOLUTION_UNAVAILABLE') return 'unavailable'
  if (code === 'NOT_FOUND' || code === 'OCCURRENCE_CLIENT_CONVERSATION_NOT_FOUND') return 'notFound'
  return 'generic'
}
