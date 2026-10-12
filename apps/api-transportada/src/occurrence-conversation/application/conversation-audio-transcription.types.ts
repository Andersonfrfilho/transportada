/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.2): o anexo da conversa por assunto. Só o de áudio carrega `durationMs` e
 * `transcription`; o anexo das rotas antigas e do portal segue sem eles.
 */
import type { ParticipantTranscription } from '../domain/participant-transcription.policy.js'
import type { ConversationAttachmentView } from './conversation-attachment.port.js'

export type SubjectConversationAttachmentView = ConversationAttachmentView & {
  readonly durationMs?: number
  readonly transcription?: ParticipantTranscription
}
