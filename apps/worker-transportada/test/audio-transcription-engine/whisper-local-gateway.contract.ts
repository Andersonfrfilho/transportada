/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  TranscriptionError,
  type AudioTranscriber,
  type TranscriptionInput,
  type WhisperLocalTranscriberConfig,
} from '@adatechnology/audio-transcription-provider'
import { describe, expect, test } from 'bun:test'

import { SpeechToTextError } from '../../src/conversation-audio-transcription/speech-to-text.error.js'
import { createWhisperLocalSpeechToText } from '../../src/conversation-audio-transcription/whisper-local-speech-to-text.gateway.js'
import type { AudioTranscriptionEnvironment } from '../../src/shared/worker.types.js'

const PII_SENTINEL = 'texto-do-cliente-com-pii-123'

const ENVIRONMENT: AudioTranscriptionEnvironment = {
  batchSize: 2,
  binaryPath: '/usr/local/bin/whisper-cli',
  language: 'pt',
  maxDurationMilliseconds: 600_000,
  modelPath: '/models/ggml-small-q5_1.bin',
  recoveryWindowHours: 72,
  threads: 7,
  timeoutMilliseconds: 300_000,
}

type Recorder = {
  readonly configs: WhisperLocalTranscriberConfig[]
  readonly inputs: TranscriptionInput[]
}

function createFakeFactory(
  recorder: Recorder,
  behavior: (input: TranscriptionInput) => Promise<{ text: string; language?: string }>,
) {
  return (config: WhisperLocalTranscriberConfig): AudioTranscriber => {
    recorder.configs.push(config)
    return {
      name: 'whisper-local',
      transcribe: async (input) => {
        recorder.inputs.push(input)
        return { engine: 'whisper-local', ...(await behavior(input)) }
      },
    }
  }
}

function newRecorder(): Recorder {
  return { configs: [], inputs: [] }
}

describe('whisper-local speech-to-text gateway (spec 264 T3.2)', () => {
  test('hands the environment config to the package transcriber', () => {
    const recorder = newRecorder()
    createWhisperLocalSpeechToText({
      createTranscriber: createFakeFactory(recorder, async () => ({ text: '' })),
      environment: ENVIRONMENT,
    })
    expect(recorder.configs).toEqual([
      {
        binaryPath: '/usr/local/bin/whisper-cli',
        languageHint: 'pt',
        modelPath: '/models/ggml-small-q5_1.bin',
        threads: 7,
        timeoutMs: 300_000,
      },
    ])
  })

  test('transcribes with the language hint and returns text, engine and language', async () => {
    const recorder = newRecorder()
    const speechToText = createWhisperLocalSpeechToText({
      createTranscriber: createFakeFactory(recorder, async () => ({ language: 'pt', text: 'olá' })),
      environment: ENVIRONMENT,
    })
    const audio = Buffer.from([1, 2, 3])
    const result = await speechToText.transcribe({ audio, mimeType: 'audio/ogg' })
    expect(result).toEqual({ engine: 'whisper-local', language: 'pt', text: 'olá' })
    expect(recorder.inputs).toEqual([{ buffer: audio, languageHint: 'pt', mimeType: 'audio/ogg' }])
  })

  test('silence is a legitimate empty text, not a failure', async () => {
    const speechToText = createWhisperLocalSpeechToText({
      createTranscriber: createFakeFactory(newRecorder(), async () => ({ text: '' })),
      environment: ENVIRONMENT,
    })
    const result = await speechToText.transcribe({ audio: Buffer.from([1]), mimeType: 'audio/ogg' })
    expect(result.text).toBe('')
    expect(result.language).toBe('pt')
  })

  test('empty audio is definitive and never reaches the engine', async () => {
    const recorder = newRecorder()
    const speechToText = createWhisperLocalSpeechToText({
      createTranscriber: createFakeFactory(recorder, async () => ({ text: 'x' })),
      environment: ENVIRONMENT,
    })
    const failure = await speechToText
      .transcribe({ audio: Buffer.alloc(0), mimeType: 'audio/ogg' })
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(SpeechToTextError)
    expect(failure).toMatchObject({ code: 'empty_audio', kind: 'definitive' })
    expect(recorder.inputs).toHaveLength(0)
  })

  test('engine errors become typed domain errors without the engine message', async () => {
    const speechToText = createWhisperLocalSpeechToText({
      createTranscriber: createFakeFactory(newRecorder(), async () => {
        throw new TranscriptionError(PII_SENTINEL, 'whisper-local', true, { killed: true })
      }),
      environment: ENVIRONMENT,
    })
    const failure = (await speechToText
      .transcribe({ audio: Buffer.from([1]), mimeType: 'audio/ogg' })
      .catch((error: unknown) => error)) as SpeechToTextError
    expect(failure).toBeInstanceOf(SpeechToTextError)
    expect({ code: failure.code, kind: failure.kind }).toEqual({
      code: 'engine_timeout',
      kind: 'retriable',
    })
    expect(failure.message).not.toContain(PII_SENTINEL)
    expect(failure.cause).toBeUndefined()
  })

  test('an aborted signal releases the caller with a retriable failure', async () => {
    const speechToText = createWhisperLocalSpeechToText({
      createTranscriber: createFakeFactory(newRecorder(), () => new Promise(() => undefined)),
      environment: ENVIRONMENT,
    })
    const controller = new AbortController()
    const pending = speechToText
      .transcribe({ audio: Buffer.from([1]), mimeType: 'audio/ogg', signal: controller.signal })
      .catch((error: unknown) => error)
    controller.abort()
    expect(await pending).toMatchObject({ code: 'engine_failed', kind: 'retriable' })
  })
})
