/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Fila em memória que obedece à mesma regra de posse da tabela real: toda escrita por linha exige o
 * `lease_token`, a reivindicação filtra `attempts < 3` e sobe `attempts` ao reivindicar.
 */
import type {
  AudioTranscriptionQueuePort,
  ClaimedTranscription,
} from '../../src/conversation-audio-transcription/application/audio-transcription-queue.port.js'
import {
  TRANSCRIPTION_MAX_ATTEMPTS,
  type TranscriptionFailureCode,
} from '../../src/conversation-audio-transcription/domain/conversation-audio-transcription.constant.js'

export type FakeTranscriptionRow = {
  attachmentId: string
  attempts: number
  bucket: string
  companyId: string
  contentType: string
  conversationId: string
  declaredDurationMs: number | null
  durationMs: number | null
  failureCode: TranscriptionFailureCode | null
  id: string
  leaseExpiresAt: Date | null
  leaseToken: string | null
  maxDurationMs: number | null
  nextAttemptAt: Date
  objectDeleted: boolean
  objectKey: string
  sha256: string
  status: 'failed' | 'pending' | 'purged' | 'ready'
  text: string | null
  updatedAtVersion: number
}

export function buildFakeRow(overrides: Partial<FakeTranscriptionRow> = {}): FakeTranscriptionRow {
  const id = overrides.id ?? crypto.randomUUID()
  return {
    attachmentId: `attachment-${id}`,
    attempts: 0,
    bucket: 'bucket',
    companyId: 'company-1',
    contentType: 'audio/ogg',
    conversationId: 'conversation-1',
    declaredDurationMs: null,
    durationMs: null,
    failureCode: null,
    id,
    leaseExpiresAt: null,
    leaseToken: null,
    maxDurationMs: null,
    nextAttemptAt: new Date('2026-10-12T11:00:00.000Z'),
    objectDeleted: false,
    objectKey: `object-${id}`,
    sha256: 'a'.repeat(64),
    status: 'pending',
    text: null,
    updatedAtVersion: 0,
    ...overrides,
  }
}

export type FakeQueue = AudioTranscriptionQueuePort & {
  readonly calls: string[]
  readonly rows: FakeTranscriptionRow[]
  enabled: Map<string, boolean>
}

export function createFakeQueue(params: {
  readonly now: () => Date
  readonly rows: FakeTranscriptionRow[]
}): FakeQueue {
  const { now, rows } = params
  const calls: string[] = []
  const enabled = new Map<string, boolean>()

  function owned(id: string, leaseToken: string): FakeTranscriptionRow | undefined {
    const row = rows.find((candidate) => candidate.id === id)
    return row !== undefined && row.leaseToken === leaseToken ? row : undefined
  }

  function touch(row: FakeTranscriptionRow): void {
    row.updatedAtVersion += 1
  }

  return {
    calls,
    enabled,
    rows,
    async materializeMarker() {
      calls.push('materializeMarker')
    },
    async sweepExhausted() {
      calls.push('sweepExhausted')
      let swept = 0
      for (const row of rows) {
        const leaseExpired = row.leaseExpiresAt === null || row.leaseExpiresAt < now()
        if (
          row.status === 'pending' &&
          row.attempts >= TRANSCRIPTION_MAX_ATTEMPTS &&
          leaseExpired
        ) {
          row.status = 'failed'
          row.failureCode = 'attempts_exhausted'
          row.leaseToken = null
          touch(row)
          swept += 1
        }
      }
      return swept
    },
    async discoverPending() {
      calls.push('discoverPending')
      return { created: 0 }
    },
    async countClaimable() {
      return rows.filter(
        (row) =>
          row.status === 'pending' &&
          row.attempts < TRANSCRIPTION_MAX_ATTEMPTS &&
          row.nextAttemptAt <= now(),
      ).length
    },
    async claimNext({ leaseMs }) {
      calls.push('claimNext')
      const candidate = rows
        .filter(
          (row) =>
            row.status === 'pending' &&
            row.attempts < TRANSCRIPTION_MAX_ATTEMPTS &&
            row.nextAttemptAt <= now() &&
            (row.leaseExpiresAt === null || row.leaseExpiresAt < now()),
        )
        .sort((left, right) => left.nextAttemptAt.getTime() - right.nextAttemptAt.getTime())[0]
      if (candidate === undefined) return undefined
      candidate.leaseToken = crypto.randomUUID()
      candidate.leaseExpiresAt = new Date(now().getTime() + leaseMs)
      candidate.attempts += 1
      return toClaimed(candidate)
    },
    async isCompanyEnabled(companyId) {
      return enabled.get(companyId) ?? true
    },
    async writeReady(input) {
      const row = owned(input.id, input.leaseToken)
      if (row === undefined) return false
      row.status = 'ready'
      row.text = input.text
      row.durationMs = input.durationMs
      row.leaseToken = null
      row.leaseExpiresAt = null
      touch(row)
      return true
    },
    async writeFailed(input) {
      const row = owned(input.id, input.leaseToken)
      if (row === undefined) return false
      row.status = 'failed'
      row.failureCode = input.failureCode
      row.durationMs = input.durationMs ?? row.durationMs
      row.maxDurationMs = input.maxDurationMs ?? null
      row.leaseToken = null
      row.leaseExpiresAt = null
      touch(row)
      return true
    },
    async scheduleRetry(input) {
      const row = owned(input.id, input.leaseToken)
      if (row === undefined) return false
      row.nextAttemptAt = new Date(now().getTime() + input.backoffMinutes * 60_000)
      row.leaseToken = null
      row.leaseExpiresAt = null
      return true
    },
    async writePurged(input) {
      const row = owned(input.id, input.leaseToken)
      if (row === undefined) return false
      row.status = 'purged'
      row.text = null
      row.leaseToken = null
      row.leaseExpiresAt = null
      touch(row)
      return true
    },
    async release(input) {
      const row = owned(input.id, input.leaseToken)
      if (row === undefined) return false
      row.attempts -= 1
      row.leaseToken = null
      row.leaseExpiresAt = null
      return true
    },
    async purgeDeletedObjects() {
      calls.push('purgeDeletedObjects')
      let purged = 0
      for (const row of rows) {
        if (row.status === 'ready' && row.objectDeleted) {
          row.status = 'purged'
          row.text = null
          touch(row)
          purged += 1
        }
      }
      return purged
    },
  }
}

function toClaimed(row: FakeTranscriptionRow): ClaimedTranscription {
  return {
    attachmentId: row.attachmentId,
    attempts: row.attempts,
    bucket: row.bucket,
    companyId: row.companyId,
    contentType: row.contentType,
    conversationId: row.conversationId,
    declaredDurationMs: row.declaredDurationMs,
    id: row.id,
    leaseToken: row.leaseToken ?? '',
    objectDeleted: row.objectDeleted,
    objectKey: row.objectKey,
    sha256: row.sha256,
  }
}
