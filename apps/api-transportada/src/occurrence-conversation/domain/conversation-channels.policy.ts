/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 D9: os canais que já trocaram mensagem na conversa, em ordem estável. O que o app não
 * conhece (canal novo no banco) fica fora em vez de quebrar a lista.
 */
import {
  SUBJECT_CHANNEL_ORDER,
  type SubjectChannel,
} from './driver-subject-conversation.constant.js'

export function orderConversationChannels(raw: readonly string[]): readonly SubjectChannel[] {
  const present = new Set(raw)
  return SUBJECT_CHANNEL_ORDER.filter((channel) => present.has(channel))
}
