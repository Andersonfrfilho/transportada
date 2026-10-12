/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SpeechToTextError, type SpeechToTextPort } from '../application/speech-to-text.port.js'

/** Subconjunto estrutural de `AudioTranscriber` do pacote: o gateway não importa o pacote nos testes. */
export type LocalAudioTranscriber = Readonly<{
  name: string
  transcribe: (input: {
    readonly buffer: Buffer
    readonly languageHint?: string
    readonly mimeType: string
  }) => Promise<{ readonly engine: string; readonly language?: string; readonly text: string }>
}>

const UNSUPPORTED_ERROR_NAME = 'TranscriptionUnsupportedError'
const TIMEOUT_CODES: ReadonlySet<string> = new Set(['ETIMEDOUT', 'ABORT_ERR'])

/**
 * RF14: o erro do motor vira **código** — a mensagem de origem pode citar caminho de arquivo e nunca
 * é copiada. `language` é a dica, não detecção (contract §5.6 passo 5).
 */
export function createWhisperLocalSpeechToTextGateway(dependencies: {
  readonly modelName: string
  readonly transcriber: LocalAudioTranscriber
}): SpeechToTextPort {
  return {
    async transcribe({ bytes, languageHint, mimeType, signal }) {
      if (signal.aborted) {
        throw new SpeechToTextError({ failureCode: 'engine_failed', isRetriable: true })
      }
      try {
        const result = await dependencies.transcriber.transcribe({
          buffer: Buffer.from(bytes),
          languageHint,
          mimeType,
        })
        return {
          engine: result.engine,
          language: languageHint,
          model: dependencies.modelName,
          text: result.text,
        }
      } catch (error) {
        throw classifyEngineError(error)
      }
    },
  }
}

function classifyEngineError(error: unknown): SpeechToTextError {
  if (error instanceof SpeechToTextError) return error
  const named = readNamedError(error)
  if (named.name === UNSUPPORTED_ERROR_NAME) {
    return new SpeechToTextError({ failureCode: 'unsupported_format', isRetriable: false })
  }
  if (named.isRetriable === undefined) {
    return new SpeechToTextError({ failureCode: 'engine_failed', isRetriable: true })
  }
  if (named.isRetriable && named.timedOut) {
    return new SpeechToTextError({ failureCode: 'engine_timeout', isRetriable: true })
  }
  return new SpeechToTextError({ failureCode: 'engine_failed', isRetriable: named.isRetriable })
}

function readNamedError(error: unknown): {
  readonly isRetriable: boolean | undefined
  readonly name: string
  readonly timedOut: boolean
} {
  if (typeof error !== 'object' || error === null) {
    return { isRetriable: undefined, name: '', timedOut: false }
  }
  const record = error as Record<string, unknown>
  const cause =
    typeof record.cause === 'object' && record.cause !== null
      ? (record.cause as Record<string, unknown>)
      : {}
  return {
    isRetriable: typeof record.isRetriable === 'boolean' ? record.isRetriable : undefined,
    name: typeof record.name === 'string' ? record.name : '',
    timedOut:
      (typeof cause.code === 'string' && TIMEOUT_CODES.has(cause.code)) ||
      cause.killed === true ||
      typeof cause.signal === 'string',
  }
}
