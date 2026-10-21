/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 264 T5.1 (contract §1): a duração e a transcrição do anexo de áudio, lidas cruas de cada item e validadas uma a
 * uma. Valor que o painel não conhece faz o CAMPO sumir, nunca o anexo, a mensagem ou a lista. Serve às duas leituras
 * do painel — a conversa por assunto e o chat da ocorrência (desde 21/10/2026, quando a API passou a mandar os campos
 * na rota da ocorrência) — sem uma importar a outra.
 */
import {
  PARTICIPANT_AUDIO_DURATION_MAX_MS,
  participantTranscriptionSchema,
  type ParticipantTranscription,
} from '@adatechnology/conversation-contracts'

import { toConversationAttachments } from './conversationAttachment.service'
import { isRecord } from './occurrenceConversationGuards.validation'
import type { OccurrenceConversationAttachment } from './occurrenceConversation.types'

function readDurationMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return value > 0 && value <= PARTICIPANT_AUDIO_DURATION_MAX_MS ? value : undefined
}

function readTranscription(value: unknown): ParticipantTranscription | undefined {
  const parsed = participantTranscriptionSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** Os anexos pela guarda compartilhada, cada um com a duração e a transcrição quando vierem válidas. */
export function toAttachmentsWithAudioFields(
  value: unknown,
): readonly OccurrenceConversationAttachment[] {
  const rawById = new Map<string, Record<string, unknown>>()
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isRecord(item) && typeof item.id === 'string') rawById.set(item.id, item)
    }
  }
  return toConversationAttachments(value).map((attachment) => {
    const raw = rawById.get(attachment.id)
    const durationMs = readDurationMs(raw?.durationMs)
    const transcription = readTranscription(raw?.transcription)
    return {
      ...attachment,
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(transcription === undefined ? {} : { transcription }),
    }
  })
}
