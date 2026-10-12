/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.2): o que a transcrição gravada vira para o participante. Puro: nulo nunca vira
 * `null`, a chave some; `disabled` é derivado da configuração da empresa, nunca gravado; o texto só sai em
 * `ready`.
 */
import {
  CONVERSATION_AUDIO_TRANSCRIPTION_STATUS,
  type ConversationAudioTranscriptionStatus,
} from '../../shared/conversation-audio-transcription.constant.js'
import {
  PARTICIPANT_AUDIO_CONTENT_TYPE_PREFIX,
  PARTICIPANT_AUDIO_DURATION_MAX_MS,
  PARTICIPANT_TRANSCRIPTION_FAILURE_REASON,
  PARTICIPANT_TRANSCRIPTION_LANGUAGE_PATTERN,
  PARTICIPANT_TRANSCRIPTION_STATUS,
} from './participant-transcription.constant.js'

/** A linha gravada, só com o que a leitura da conversa precisa. */
export type AudioTranscriptionRow = {
  readonly audioDurationMs: number | null
  readonly engine: string | null
  readonly failureCode: string | null
  readonly generatedAt: Date | null
  readonly language: string | null
  readonly maxDurationMs: number | null
  readonly status: ConversationAudioTranscriptionStatus
  readonly text: string | null
}

export type ParticipantTranscription =
  | { readonly status: typeof PARTICIPANT_TRANSCRIPTION_STATUS.DISABLED }
  | { readonly status: typeof PARTICIPANT_TRANSCRIPTION_STATUS.PENDING }
  | {
      readonly maxDurationMs?: number
      readonly reason?: typeof PARTICIPANT_TRANSCRIPTION_FAILURE_REASON.TOO_LONG
      readonly status: typeof PARTICIPANT_TRANSCRIPTION_STATUS.FAILED
    }
  | {
      readonly engine?: string
      readonly generatedAt: string
      readonly language?: string
      readonly status: typeof PARTICIPANT_TRANSCRIPTION_STATUS.READY
      readonly text: string
    }

export function isAudioContentType(contentType: string): boolean {
  return contentType.toLowerCase().startsWith(PARTICIPANT_AUDIO_CONTENT_TYPE_PREFIX)
}

function toReadyTranscription(row: AudioTranscriptionRow): ParticipantTranscription | undefined {
  if (row.generatedAt === null) return undefined
  return {
    ...(row.engine === null ? {} : { engine: row.engine }),
    generatedAt: row.generatedAt.toISOString(),
    ...(row.language !== null && PARTICIPANT_TRANSCRIPTION_LANGUAGE_PATTERN.test(row.language)
      ? { language: row.language }
      : {}),
    status: PARTICIPANT_TRANSCRIPTION_STATUS.READY,
    text: row.text ?? '',
  }
}

function toFailedTranscription(row: AudioTranscriptionRow): ParticipantTranscription {
  const isTooLong = row.failureCode === PARTICIPANT_TRANSCRIPTION_FAILURE_REASON.TOO_LONG
  if (!isTooLong || row.maxDurationMs === null || row.maxDurationMs <= 0) {
    return { status: PARTICIPANT_TRANSCRIPTION_STATUS.FAILED }
  }
  return {
    maxDurationMs: row.maxDurationMs,
    reason: PARTICIPANT_TRANSCRIPTION_FAILURE_REASON.TOO_LONG,
    status: PARTICIPANT_TRANSCRIPTION_STATUS.FAILED,
  }
}

export function toParticipantTranscription(
  row: AudioTranscriptionRow | undefined,
  enabled: boolean,
): ParticipantTranscription | undefined {
  if (!enabled) return { status: PARTICIPANT_TRANSCRIPTION_STATUS.DISABLED }
  if (row === undefined) return undefined
  switch (row.status) {
    case CONVERSATION_AUDIO_TRANSCRIPTION_STATUS.PENDING:
      return { status: PARTICIPANT_TRANSCRIPTION_STATUS.PENDING }
    case CONVERSATION_AUDIO_TRANSCRIPTION_STATUS.READY:
      return toReadyTranscription(row)
    case CONVERSATION_AUDIO_TRANSCRIPTION_STATUS.FAILED:
      return toFailedTranscription(row)
    case CONVERSATION_AUDIO_TRANSCRIPTION_STATUS.PURGED:
      return undefined
  }
}

/** A duração do anexo vence a medida pela rotina; só inteiro positivo até o teto do contrato. */
export function toParticipantDurationMs(
  attachmentDurationMs: number | null | undefined,
  transcriptionDurationMs: number | null | undefined,
): number | undefined {
  const durationMs = attachmentDurationMs ?? transcriptionDurationMs
  if (durationMs === null || durationMs === undefined) return undefined
  if (!Number.isInteger(durationMs) || durationMs <= 0) return undefined
  if (durationMs > PARTICIPANT_AUDIO_DURATION_MAX_MS) return undefined
  return durationMs
}
