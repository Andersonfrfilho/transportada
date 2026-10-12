/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.2): a linha de transcrição vira o campo `transcription` do anexo de áudio.
 * Puro. Nulo nunca vira `null` no JSON (chave omitida); o que o leitor não pode ver sai ausente.
 */
import {
  PARTICIPANT_AUDIO_DURATION_MAX_MS,
  PARTICIPANT_TRANSCRIPTION_ENGINE_MAX_LENGTH,
  PARTICIPANT_TRANSCRIPTION_FAILURE_REASON,
  PARTICIPANT_TRANSCRIPTION_LANGUAGE_PATTERN,
  PARTICIPANT_TRANSCRIPTION_STATUS,
  PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16,
} from './participant-transcription.constant.js'
import type {
  ParticipantTranscription,
  ResolveAudioDurationParams,
  ToParticipantTranscriptionParams,
  TranscriptionRowInput,
} from './participant-transcription.types.js'

const NUL_CHARACTER = '\u0000'
const HIGH_SURROGATE_FIRST = 0xd800
const HIGH_SURROGATE_LAST = 0xdbff

function sanitizeText(text: string): string {
  const withoutNul = text.replaceAll(NUL_CHARACTER, '')
  if (withoutNul.length <= PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16) return withoutNul
  const cut = withoutNul.slice(0, PARTICIPANT_TRANSCRIPTION_TEXT_MAX_UTF16)
  const lastUnit = cut.charCodeAt(cut.length - 1)
  const splitsSurrogatePair = lastUnit >= HIGH_SURROGATE_FIRST && lastUnit <= HIGH_SURROGATE_LAST
  return splitsSurrogatePair ? cut.slice(0, -1) : cut
}

function toReadyTranscription(row: TranscriptionRowInput): ParticipantTranscription | undefined {
  if (row.text === null || row.generatedAt === null) return undefined
  if (Number.isNaN(row.generatedAt.getTime())) return undefined
  const engine = pickEngine(row.engine)
  const language = pickLanguage(row.language)
  return {
    ...(engine === undefined ? {} : { engine }),
    generatedAt: row.generatedAt.toISOString(),
    ...(language === undefined ? {} : { language }),
    status: PARTICIPANT_TRANSCRIPTION_STATUS.READY,
    text: sanitizeText(row.text),
  }
}

function pickLanguage(language: null | string): string | undefined {
  if (language === null) return undefined
  return PARTICIPANT_TRANSCRIPTION_LANGUAGE_PATTERN.test(language) ? language : undefined
}

function pickEngine(engine: null | string): string | undefined {
  if (engine === null || engine.length === 0) return undefined
  return engine.length <= PARTICIPANT_TRANSCRIPTION_ENGINE_MAX_LENGTH ? engine : undefined
}

function toFailedTranscription(row: TranscriptionRowInput): ParticipantTranscription | undefined {
  if (row.failureCode !== PARTICIPANT_TRANSCRIPTION_FAILURE_REASON.TOO_LONG) return undefined
  if (!isPositiveInteger(row.maxDurationMs)) return undefined
  return {
    maxDurationMs: row.maxDurationMs,
    reason: PARTICIPANT_TRANSCRIPTION_FAILURE_REASON.TOO_LONG,
    status: PARTICIPANT_TRANSCRIPTION_STATUS.FAILED,
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export function toParticipantTranscription(
  params: ToParticipantTranscriptionParams,
): ParticipantTranscription | undefined {
  if (!params.isEnabled) return { status: PARTICIPANT_TRANSCRIPTION_STATUS.DISABLED }
  const { row } = params
  if (row === undefined) return undefined
  if (row.status === PARTICIPANT_TRANSCRIPTION_STATUS.PENDING) {
    return { status: PARTICIPANT_TRANSCRIPTION_STATUS.PENDING }
  }
  if (row.status === PARTICIPANT_TRANSCRIPTION_STATUS.READY) return toReadyTranscription(row)
  if (row.status === PARTICIPANT_TRANSCRIPTION_STATUS.FAILED) return toFailedTranscription(row)
  return undefined
}

/** O anexo vence; a medida do worker é o reserva. Só inteiro positivo dentro do teto do contrato. */
export function resolveAudioDurationMs(params: ResolveAudioDurationParams): number | undefined {
  for (const candidate of [params.attachmentDurationMs, params.transcriptionDurationMs]) {
    if (isPositiveInteger(candidate) && candidate <= PARTICIPANT_AUDIO_DURATION_MAX_MS) {
      return candidate
    }
  }
  return undefined
}
