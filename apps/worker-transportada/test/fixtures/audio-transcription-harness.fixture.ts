/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Fila e relógio em memória da transcrição de áudio (spec 264 T3.3), com a semântica de posse da fila de
 * SQL: lease, `lease_token`, tentativa na reivindicação, `markReady` recusado se a empresa desligou. O SQL
 * de verdade é provado em `test/integration/`.
 */
import type {
  AudioTranscriptionLineQueuePort,
  ClaimedAudioTranscription,
} from '../../src/conversation-audio-transcription/audio-transcription-queue.port.js'
import { AUDIO_SHA256 } from './audio-transcription-doubles.fixture.js'

export type FakeRow = ClaimedAudioTranscription & {
  status: 'pending' | 'ready' | 'failed'
  nextAttemptAtMs: number
  leaseExpiresAtMs: number | undefined
  failureCode: string | undefined
  text: string | null | undefined
  audioDurationMs: number | null | undefined
  maxDurationMs: number | null | undefined
  /** A empresa desligou DEPOIS da reivindicação: a coluna do claim já foi lida como ligada. */
  isCompanyDisabledNow: boolean
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
    isCompanyDisabledNow: false,
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

export type FakeLineQueue = AudioTranscriptionLineQueuePort & { readonly rows: FakeRow[] }

export function createFakeLineQueue(rows: FakeRow[], clock: { now: () => Date }): FakeLineQueue {
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
      if (!owned(row, params.leaseToken) || row.isCompanyDisabledNow) return false
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
        attempts: params.shouldGiveBackAttempt ? Math.max(row.attempts - 1, 0) : row.attempts,
        audioDurationMs: params.audioDurationMs ?? row.audioDurationMs,
        leaseExpiresAtMs: undefined,
        leaseToken: '',
        nextAttemptAtMs: nowMs() + params.delayMilliseconds,
      })
      return true
    },
  }
}
