/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Dublês do motor, da sonda, do leitor de objeto e do log da transcrição de áudio (spec 264 T3.3):
 * o transcritor só termina quando o teste solta, que é o que prova que o executor não segura o
 * consumidor serial do job-run.
 */
import { createHash } from 'node:crypto'

import type { AudioDurationProbe } from '../../src/conversation-audio-transcription/audio-duration-probe.port.js'
import type { AudioObjectReader } from '../../src/conversation-audio-transcription/audio-object-reader.port.js'
import type {
  SpeechToText,
  SpeechToTextResult,
} from '../../src/conversation-audio-transcription/speech-to-text.port.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

export const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4])
export const AUDIO_SHA256 = createHash('sha256').update(AUDIO_BYTES).digest('hex')
export const SECRET_SPOKEN_TEXT = 'o motorista disse o cpf 123.456.789-09 em voz alta'

export type HeldTranscriber = SpeechToText & {
  readonly calls: number
  finish(result?: Partial<SpeechToTextResult>): void
  fail(error: unknown): void
  readonly signals: (AbortSignal | undefined)[]
}

export function createHeldTranscriber(): HeldTranscriber {
  const waiting: {
    resolve: (result: SpeechToTextResult) => void
    reject: (error: unknown) => void
  }[] = []
  const signals: (AbortSignal | undefined)[] = []
  const transcriber = {
    calls: 0,
    fail: (error: unknown) => waiting.shift()?.reject(error),
    finish: (result: Partial<SpeechToTextResult> = {}) =>
      waiting.shift()?.resolve({
        engine: 'whisper-fake',
        language: 'pt',
        text: SECRET_SPOKEN_TEXT,
        ...result,
      }),
    signals,
    transcribe: (params: { signal?: AbortSignal }) => {
      transcriber.calls += 1
      signals.push(params.signal)
      return new Promise<SpeechToTextResult>((resolve, reject) => {
        waiting.push({ reject, resolve })
        params.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    },
  }
  return transcriber as HeldTranscriber
}

export function createInstantTranscriber(
  text = SECRET_SPOKEN_TEXT,
): SpeechToText & { calls: number } {
  const transcriber = {
    calls: 0,
    transcribe: async () => {
      transcriber.calls += 1
      return { engine: 'whisper-fake', language: 'pt', text }
    },
  }
  return transcriber
}

export function createFixedProbe(durationMs: number | Error): AudioDurationProbe {
  return {
    measure: async () => {
      if (durationMs instanceof Error) throw durationMs
      return durationMs
    },
  }
}

export function createMapReader(
  objects: Record<string, Uint8Array | undefined>,
): AudioObjectReader {
  return { read: async ({ key }) => objects[key] }
}

/** Leitor cujo transporte quebra: o storage respondeu erro (não "não existe"). */
export function createThrowingReader(error: unknown): AudioObjectReader {
  return { read: async () => Promise.reject(error) }
}

export type LoggedLine = {
  readonly level: string
  readonly message: string
  readonly metadata: unknown
}

export function createLogCapture(): { logger: WorkerLogger; lines: LoggedLine[] } {
  const lines: LoggedLine[] = []
  const record =
    (level: string) =>
    (message: string, metadata?: Record<string, unknown>): void =>
      void lines.push({ level, message, metadata })
  return { lines, logger: { error: record('error'), info: record('info'), warn: record('warn') } }
}

export async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
