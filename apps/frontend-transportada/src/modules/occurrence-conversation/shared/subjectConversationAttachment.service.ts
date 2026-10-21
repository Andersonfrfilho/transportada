/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 264 T5.1 (contract §1): a duração e a transcrição do anexo da conversa por assunto. A leitura dos dois campos
 * mora em `audioAttachmentFields.service`, que o chat da ocorrência também usa.
 */
import { toAttachmentsWithAudioFields } from './audioAttachmentFields.service'
import type { SubjectConversationAttachment } from './subjectConversation.types'

export function toSubjectConversationAttachments(
  value: unknown,
): readonly SubjectConversationAttachment[] {
  return toAttachmentsWithAudioFields(value)
}
