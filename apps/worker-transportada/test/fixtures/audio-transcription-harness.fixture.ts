/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Dublês em memória da transcrição de áudio (spec 264 T3.3): fila com a semântica de posse da fila de
 * SQL (lease, `lease_token`, tentativa na reivindicação), transcritor que só termina quando o teste
 * solta, sonda de duração e leitor de objeto. O SQL de verdade é provado em `test/integration/`.
 */
import { createHash } from 'node:crypto'

import type { AttachmentObjectReaderPort } from '../../src/aggregate-attachment/application/extract-attachment-fields.port.js'
import type { AudioDurationProbe } from '../../src/conversation-audio-transcription/audio-duration-probe.port.js'
import type {
  AudioTranscriptionLineQueuePort,
  ClaimedAudioTranscription,
} from '../../src/conversation-audio-transcription/audio-transcription-queue.port.js'
import type {
  SpeechToText,
  SpeechToTextResult,
} from '../../src/conversation-audio-transcription/speech-to-text.port.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

export const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4])
export const AUDIO_SHA256 = createHash('sha256').update(AUDIO_BYTES).digest('hex')
export const SECRET_SPOKEN_TEXT = 'o motorista disse o cpf 123.456.789-09 em voz alta'

export type FakeRow = ClaimedAudioTranscription & {
  status: 'pending' | 'ready' | 'failed'
  nextAttemptAtMs: number
  leaseExpiresAtMs: number | undefined
  failureCode: string | undefined
  text: string | null | undefined
  audioDurationMs: number | null | undefined
  maxDurationMs: number | null | undefined
}

export function buildFakeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    attachmentId: 'attachment-1',
    attempts: 0,
    audioDurationMs: undefined,
    bucket: 'bucket',
    companyId: 'company-1',
    failureCode: undefined,
    id: 'transcription-1',
    isCompanyEnabled: true,
    leaseExpiresAtMs: undefined,
    leaseToken: '',
    maxDurationMs: undefined,
    mimeType: 'audio/webm',
    nextAttemptAtMs: 0,
    objectKey: 'object-1',
    objectStatus: 'final',
    sha256: AUDIO_SHA256,
    status: 'pending',
    text: undefined,
    ...overrides,
  }
}

export function createFakeClock(startMs = 1_000_000): {
  now: () => Date
  advance: (ms: number) => void
} {
  let currentMs = startMs
  return { advance: (ms) => void (currentMs += ms), now: () => new Date(currentMs) }
}

export function createFakeLineQueue(
  rows: FakeRow[],
  clock: { now: () => Date },
): AudioTranscriptionLineQueuePort & {
  readonly rows: FakeRow[]
} {
  const nowMs = (): number => clock.now().getTime()
  const owned = (row: FakeRow | undefined, token: string): row is FakeRow =>
    row !== undefined && row.leaseToken !== '' && row.leaseToken === token
  const find = (id: string): FakeRow | undefined => rows.find((row) => row.id === id)
  let tokenCounter = 0

  return {
    claimNext: async ({ leaseMilliseconds }) => {
      const row = rows.find(
        (candidate) =>
          candidate.status === 'pending' &&
          candidate.attempts < 3 &&
          candidate.nextAttemptAtMs <= nowMs() &&
          (candidate.leaseExpiresAtMs === undefined || candidate.leaseExpiresAtMs < nowMs()),
      )
      if (row === undefined) return undefined
      tokenCounter += 1
      Object.assign(row, {
        attempts: row.attempts + 1,
        leaseExpiresAtMs: nowMs() + leaseMilliseconds,
        leaseToken: `token-${tokenCounter}`,
      })
      return { ...row }
    },
    markFailed: async (params) => {
      const row = find(params.id)
      if (!owned(row, params.leaseToken)) return false
      Object.assign(row, {
        audioDurationMs: params.audioDurationMs,
        failureCode: params.code,
        leaseToken: '',
        maxDurationMs: params.maxDurationMs,
        status: 'failed',
        text: null,
      })
      return true
    },
    markReady: async (params) => {
      const row = find(params.id)
      if (!owned(row, params.leaseToken)) return false
      Object.assign(row, {
        audioDurationMs: params.audioDurationMs,
        leaseToken: '',
        status: 'ready',
        text: params.text,
      })
      return true
    },
    release: async (params) => {
      const row = find(params.id)
      if (!owned(row, params.leaseToken)) return false
      Object.assign(row, {
        attempts: Math.max(row.attempts - 1, 0),
        leaseExpiresAtMs: undefined,
        leaseToken: '',
      })
      return true
    },
    rows,
    scheduleRetry: async (params) => {
      const row = find(params.id)
      if (!owned(row, params.leaseToken)) return false
      Object.assign(row, {
        leaseExpiresAtMs: undefined,
        leaseToken: '',
        nextAttemptAtMs: nowMs() + params.delayMilliseconds,
      })
      return true
    },
  }
}

export type HeldTranscriber = SpeechToText & {
  readonly calls: number
  finish(result?: Partial<SpeechToTextResult>): void
  fail(error: unknown): void
  readonly signals: (AbortSignal | undefined)[]
}

/** Só termina quando o teste solta: é o que prova que o executor não segura o consumidor serial. */
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
      waiting
        .shift()
        ?.resolve({ engine: 'whisper-fake', language: 'pt', text: SECRET_SPOKEN_TEXT, ...result }),
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
): AttachmentObjectReaderPort {
  return { read: async ({ key }) => objects[key] }
}

export type LoggedLine = {
  readonly level: string
  readonly message: string
  readonly metadata: unknown
}

export function createLogCapture(): { logger: WorkerLogger; lines: LoggedLine[] } {
  const lines: LoggedLine[] = []
  const record = (level: string) => (message: string, metadata?: Record<string, unknown>) =>
    void lines.push({ level, message, metadata })
  return { lines, logger: { error: record('error'), info: record('info'), warn: record('warn') } }
}

export async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
