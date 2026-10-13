/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  PARTICIPANT_AUDIO_DURATION_MAX_MS,
  participantTranscriptionSchema,
} from '@adatechnology/conversation-contracts'

import { toConversationAttachments } from './conversationAttachment.service'
import { isRecord } from './occurrenceConversationGuards.validation'
import type { OccurrenceConversationAttachment } from './occurrenceConversation.types'

/** Inteiro positivo até o teto do contrato; qualquer outra coisa é só a duração que não veio. */
function readDurationMs(value: unknown): number | undefined {
  const isValid =
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= PARTICIPANT_AUDIO_DURATION_MAX_MS
  return isValid ? value : undefined
}

/** Por anexo: um estado novo da API perde só a transcrição daquele anexo, nunca a página. */
function readTranscription(value: unknown): OccurrenceConversationAttachment['transcription'] {
  if (value === undefined || value === null) return undefined
  const parsed = participantTranscriptionSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/**
 * Anexos das rotas por assunto (spec 264 RF12): a leitura tolerante de sempre mais `durationMs` e
 * `transcription` do áudio. A tela antiga da ocorrência segue em `toConversationAttachments`, sem os campos.
 */
export function toSubjectConversationAttachments(
  value: unknown,
): readonly OccurrenceConversationAttachment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const [attachment] = toConversationAttachments([item])
    if (attachment === undefined || !attachment.contentType.startsWith('audio/')) {
      return attachment === undefined ? [] : [attachment]
    }
    const raw = isRecord(item) ? item : {}
    const durationMs = readDurationMs(raw.durationMs)
    const transcription = readTranscription(raw.transcription)
    return [
      {
        ...attachment,
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(transcription === undefined ? {} : { transcription }),
      },
    ]
  })
}
