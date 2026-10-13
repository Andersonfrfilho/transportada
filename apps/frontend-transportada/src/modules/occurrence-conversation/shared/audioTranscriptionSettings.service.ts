/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  OCCURRENCE_CONVERSATION_ERROR,
  OccurrenceConversationRequestError,
  requestJson,
  type ClientDependencies,
} from './occurrenceConversationClient.service'
import { isRecord, isString } from './occurrenceConversationGuards.validation'

const AUDIO_TRANSCRIPTION_PATH = '/company-settings/audio-transcription'
const MILLISECONDS_PER_MINUTE = 60_000
const MILLISECONDS_PER_SECOND = 1000
const SETTINGS_KEYS = ['enabled', 'maxDurationMs', 'updatedAt'] as const

export type AudioTranscriptionSettings = Readonly<{
  enabled: boolean
  maxDurationMs: number
  updatedAt: null | string
}>

export type AudioTranscriptionSettingsClient = Readonly<{
  get: () => Promise<AudioTranscriptionSettings>
  save: (enabled: boolean) => Promise<AudioTranscriptionSettings>
}>

function toSettings(payload: unknown): AudioTranscriptionSettings {
  const data = isRecord(payload) ? payload.data : undefined
  const { enabled, maxDurationMs, updatedAt } = isRecord(data) ? data : {}
  const isValid =
    isRecord(data) &&
    Object.keys(data).length === SETTINGS_KEYS.length &&
    typeof enabled === 'boolean' &&
    typeof maxDurationMs === 'number' &&
    Number.isInteger(maxDurationMs) &&
    maxDurationMs > 0 &&
    (updatedAt === null || isString(updatedAt))
  if (!isValid) {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
  }
  return { enabled, maxDurationMs, updatedAt }
}

/** Spec 264 RF17: a configuração por empresa (`settings.manage`); o corpo do `PUT` é só `{ enabled }`. */
export function createAudioTranscriptionSettingsClient(
  dependencies: ClientDependencies,
): AudioTranscriptionSettingsClient {
  return {
    async get() {
      return toSettings(await requestJson(dependencies, AUDIO_TRANSCRIPTION_PATH))
    },
    async save(enabled) {
      return toSettings(
        await requestJson(dependencies, AUDIO_TRANSCRIPTION_PATH, {
          body: { enabled },
          method: 'PUT',
        }),
      )
    },
  }
}

export type AudioTranscriptionLimit = Readonly<{ unit: 'minutes' | 'seconds'; value: number }>

/** RF15: o número da frase é o `maxDurationMs` da API, nunca fixo no JSX. */
export function resolveAudioTranscriptionLimit(maxDurationMs: number): AudioTranscriptionLimit {
  return maxDurationMs % MILLISECONDS_PER_MINUTE === 0
    ? { unit: 'minutes', value: maxDurationMs / MILLISECONDS_PER_MINUTE }
    : { unit: 'seconds', value: Math.round(maxDurationMs / MILLISECONDS_PER_SECOND) }
}
