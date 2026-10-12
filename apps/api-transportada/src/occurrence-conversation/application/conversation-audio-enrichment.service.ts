/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.2, §6): o enriquecimento do anexo de áudio com `durationMs` e `transcription`,
 * separado e depois de `signConversationAttachments` — a base compartilhada com as rotas antigas não muda.
 * Consultas constantes por página: nenhuma sem áudio; a da configuração e, só com a empresa ligada, a das linhas.
 */
import {
  isAudioContentType,
  toParticipantDurationMs,
  toParticipantTranscription,
} from '../domain/participant-transcription.policy.js'
import type { ConversationAttachmentView } from './conversation-attachment.port.js'
import type {
  AudioAttachmentTranscriptionFacts,
  AudioTranscriptionReaderPort,
} from './conversation-audio-transcription.port.js'
import type { SubjectConversationAttachmentView } from './conversation-audio-transcription.types.js'

function enrichAttachment(
  attachment: ConversationAttachmentView,
  facts: ReadonlyMap<string, AudioAttachmentTranscriptionFacts>,
  enabled: boolean,
): SubjectConversationAttachmentView {
  if (!isAudioContentType(attachment.contentType)) return attachment
  const found = facts.get(attachment.id)
  const durationMs = toParticipantDurationMs(
    found?.attachmentDurationMs,
    found?.transcription?.audioDurationMs,
  )
  const transcription = toParticipantTranscription(found?.transcription, enabled)
  return {
    ...attachment,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(transcription === undefined ? {} : { transcription }),
  }
}

export async function enrichAudioAttachments(input: {
  readonly attachmentsByMessage: ReadonlyMap<string, readonly ConversationAttachmentView[]>
  readonly companyId: string
  readonly reader: AudioTranscriptionReaderPort
}): Promise<ReadonlyMap<string, readonly SubjectConversationAttachmentView[]>> {
  const audioIds = [...input.attachmentsByMessage.values()]
    .flat()
    .filter((attachment) => isAudioContentType(attachment.contentType))
    .map((attachment) => attachment.id)
  if (audioIds.length === 0) return input.attachmentsByMessage

  const enabled = await input.reader.readEnabled({ companyId: input.companyId })
  const facts = enabled
    ? await input.reader.findTranscriptionsByAttachmentIds({
        attachmentIds: audioIds,
        companyId: input.companyId,
      })
    : new Map<string, AudioAttachmentTranscriptionFacts>()

  return new Map(
    [...input.attachmentsByMessage].map(([messageId, attachments]) => [
      messageId,
      attachments.map((attachment) => enrichAttachment(attachment, facts, enabled)),
    ]),
  )
}
