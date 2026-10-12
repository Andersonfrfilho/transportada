/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AudioTranscriber,
  WhisperLocalTranscriberConfig,
} from '@adatechnology/audio-transcription-provider'
import { createWhisperLocalTranscriber } from '@adatechnology/audio-transcription-provider/whisper-local'

import type { AudioTranscriptionEnvironment } from '../shared/worker.types.js'
import { SPEECH_TO_TEXT_FAILURE_KIND } from './audio-transcription-engine.constant.js'
import { classifySpeechToTextError } from './speech-to-text-error.classifier.js'
import { SpeechToTextError } from './speech-to-text.error.js'
import type { SpeechToText, SpeechToTextParams, SpeechToTextResult } from './speech-to-text.port.js'

export type WhisperLocalSpeechToTextOptions = {
  readonly environment: AudioTranscriptionEnvironment
  readonly createTranscriber?: (config: WhisperLocalTranscriberConfig) => AudioTranscriber
}

const ABORTED_FAILURE = {
  code: 'engine_failed',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
} as const

/** O pacote não aceita `AbortSignal`: o aborto solta quem espera, e o filho termina no prazo do motor. */
function rejectWhenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    const rejectAborted = (): void => reject(new SpeechToTextError(ABORTED_FAILURE))
    if (signal.aborted) return rejectAborted()
    signal.addEventListener('abort', rejectAborted, { once: true })
  })
}

export function createWhisperLocalSpeechToText(
  options: WhisperLocalSpeechToTextOptions,
): SpeechToText {
  const { environment, createTranscriber = createWhisperLocalTranscriber } = options
  const transcriber = createTranscriber({
    binaryPath: environment.binaryPath,
    languageHint: environment.language,
    modelPath: environment.modelPath,
    threads: environment.threads,
    timeoutMs: environment.timeoutMilliseconds,
  })

  async function runTranscriber(params: SpeechToTextParams): Promise<SpeechToTextResult> {
    const result = await transcriber.transcribe({
      buffer: params.audio,
      languageHint: environment.language,
      mimeType: params.mimeType,
    })
    return {
      engine: result.engine,
      language: result.language ?? environment.language,
      text: result.text,
    }
  }

  async function transcribe(params: SpeechToTextParams): Promise<SpeechToTextResult> {
    if (params.audio.length === 0) {
      throw new SpeechToTextError({
        code: 'empty_audio',
        kind: SPEECH_TO_TEXT_FAILURE_KIND.DEFINITIVE,
      })
    }
    try {
      const pending = runTranscriber(params)
      if (params.signal === undefined) return await pending
      return await Promise.race([pending, rejectWhenAborted(params.signal)])
    } catch (error) {
      throw new SpeechToTextError(classifySpeechToTextError(error))
    }
  }

  return { transcribe }
}
