/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  toAudioTranscriptionSettings,
  type AudioTranscriptionSettings,
} from './audioTranscription.service'
import type { ClientDependencies } from './occurrenceConversationClient.service'

export const AUDIO_TRANSCRIPTION_SETTINGS_PATH = '/company-settings/audio-transcription'

export const AUDIO_TRANSCRIPTION_FAILURE = {
  FAILED: 'failed',
  FORBIDDEN: 'forbidden',
  INVALID: 'invalid',
  UNAUTHENTICATED: 'unauthenticated',
} as const

export type AudioTranscriptionFailure =
  (typeof AUDIO_TRANSCRIPTION_FAILURE)[keyof typeof AUDIO_TRANSCRIPTION_FAILURE]

export class AudioTranscriptionRequestError extends Error {
  public readonly failure: AudioTranscriptionFailure

  public constructor(failure: AudioTranscriptionFailure) {
    super(`AUDIO_TRANSCRIPTION_${failure.toUpperCase()}`)
    this.failure = failure
  }
}

export type AudioTranscriptionClient = Readonly<{
  get: () => Promise<AudioTranscriptionSettings>
  save: (enabled: boolean) => Promise<AudioTranscriptionSettings>
}>

function failureOfStatus(status: number): AudioTranscriptionFailure {
  if (status === 400) return AUDIO_TRANSCRIPTION_FAILURE.INVALID
  if (status === 401) return AUDIO_TRANSCRIPTION_FAILURE.UNAUTHENTICATED
  if (status === 403) return AUDIO_TRANSCRIPTION_FAILURE.FORBIDDEN
  return AUDIO_TRANSCRIPTION_FAILURE.FAILED
}

async function requestSettings(
  dependencies: ClientDependencies,
  init: Readonly<{ body?: Readonly<{ enabled: boolean }>; method: 'GET' | 'PUT' }>,
): Promise<AudioTranscriptionSettings> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${AUDIO_TRANSCRIPTION_SETTINGS_PATH}`, {
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: init.method,
      }),
    )
  } catch {
    throw new AudioTranscriptionRequestError(AUDIO_TRANSCRIPTION_FAILURE.FAILED)
  }
  if (!response.ok) throw new AudioTranscriptionRequestError(failureOfStatus(response.status))
  const settings = toAudioTranscriptionSettings(await response.json().catch(() => undefined))
  if (settings === null)
    throw new AudioTranscriptionRequestError(AUDIO_TRANSCRIPTION_FAILURE.FAILED)
  return settings
}

/** Spec 264 RF17: a configuração por empresa (`settings.manage`). O corpo do `PUT` é só `{ enabled }`. */
export function createAudioTranscriptionClient(
  dependencies: ClientDependencies,
): AudioTranscriptionClient {
  return {
    get: () => requestSettings(dependencies, { method: 'GET' }),
    save: (enabled) => requestSettings(dependencies, { body: { enabled }, method: 'PUT' }),
  }
}
