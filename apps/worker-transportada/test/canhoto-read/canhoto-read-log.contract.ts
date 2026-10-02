/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T6.8 (CA15): o ciclo emite id e contagem — nunca o texto lido, a chave de acesso, o
 * número da nota, o nome de quem quer que seja nem bytes. Um log que escreve a PII não protegeu nada.
 */
import { describe, expect, test } from 'bun:test'

import { createCanhotoReadRoutine } from '../../src/canhoto-read/application/canhoto-read.routine.js'
import type { PendingCanhotoProof } from '../../src/canhoto-read/application/canhoto-read-queue.port.js'
import { CanhotoReviewApiError } from '../../src/canhoto-read/application/canhoto-review-api.error.js'

const ACCESS_KEY = '35240912345678000199550010000123451876543212'
const PERSONAL_DATA = 'Joao da Silva CPF 123.456.789-09 rua das Flores 10'
const BYTES_MARKER = 'JFIF-BYTES-MARKER'

type LogLine = { readonly level: string; readonly message: string; readonly metadata: unknown }

function buildProof(index: number): PendingCanhotoProof {
  return {
    bucket: 'bucket',
    companyId: 'company-1',
    documentId: `document-${index}`,
    mimeType: 'image/jpeg',
    objectKey: `object-${index}`,
    proofId: `proof-${index}`,
    sizeBytes: 1000,
    tripId: 'trip-1',
  }
}

async function runCycleCollectingLogs(): Promise<{
  readonly counters: Readonly<Record<string, number>>
  readonly lines: LogLine[]
}> {
  const lines: LogLine[] = []
  const pending = Array.from({ length: 6 }, (_, index) => buildProof(index))
  const handled = new Set<string>()
  const routine = createCanhotoReadRoutine({
    errorTracker: { captureException: () => undefined },
    imageReader: {
      read: async (proof) => {
        switch (proof.proofId) {
          case 'proof-0':
            return { kind: 'failed', outcome: 'object_unavailable' }
          case 'proof-1':
            throw new Error(`${PERSONAL_DATA} ${BYTES_MARKER}`)
          case 'proof-2':
            return { kind: 'read', text: null }
          default:
            return { kind: 'read', text: ACCESS_KEY }
        }
      },
    },
    logger: {
      error: (message, metadata) => lines.push({ level: 'error', message, metadata }),
      info: (message, metadata) => lines.push({ level: 'info', message, metadata }),
      warn: (message, metadata) => lines.push({ level: 'warn', message, metadata }),
    },
    now: () => new Date('2026-10-02T12:00:00.000Z'),
    queue: {
      listPending: async (params) =>
        pending
          .filter((proof) => !handled.has(proof.proofId))
          .filter((proof) => !params.excludeProofIds.includes(proof.proofId))
          .slice(0, params.limit),
      listTripDocuments: async () => [
        {
          accessKey: ACCESS_KEY,
          id: 'doc-requested',
          nfeNumber: '12345',
          nfeSeries: '1',
          releasedAt: null,
        },
      ],
      markAttempted: async ({ proofId }) => {
        handled.add(proofId)
        return true
      },
    },
    reviewApi: {
      report: async ({ documentId }) => {
        for (const proof of pending) if (proof.documentId === documentId) handled.add(proof.proofId)
        if (documentId === 'document-4') throw new CanhotoReviewApiError('report_rejected', 400)
        if (documentId === 'document-5') throw new CanhotoReviewApiError('api_unreachable')
        return { review: 'approved' }
      },
    },
  })

  const result = await routine.run({
    correlationId: 'correlation-1',
    executionId: 'execution-1',
    isStopRequested: () => false,
    job: 'trip.canhoto.read',
    origin: 'schedule',
  })
  return { counters: result.counters, lines }
}

describe('canhoto read cycle logs (spec 222 T6.8, CA15)', () => {
  test('a cycle with every kind of failure logs ids and counts only', async () => {
    const { lines } = await runCycleCollectingLogs()
    const everything = JSON.stringify(lines)

    expect(lines.length).toBeGreaterThan(0)
    for (const forbidden of [
      ACCESS_KEY,
      '12345',
      'Joao',
      'CPF',
      '123.456',
      'Flores',
      BYTES_MARKER,
    ]) {
      expect(everything).not.toContain(forbidden)
    }
  })

  test('every metadata value is an opaque id, a code, a boolean or a count', async () => {
    const { lines } = await runCycleCollectingLogs()
    const allowedKeys = new Set([
      'apiUnauthorized',
      'apiUnreachable',
      'alreadyHandled',
      'approved',
      'attemptedWithoutCode',
      'correlationId',
      'decodeTimeout',
      'exhausted',
      'executionId',
      'objectUnavailable',
      'outcome',
      'pending',
      'proofId',
      'proofsSeen',
      'reportRejected',
      'reported',
      'tooLarge',
      'unexpectedErrors',
      'unsupportedMedia',
    ])

    for (const line of lines) {
      const metadata = line.metadata as Record<string, unknown>
      for (const [key, value] of Object.entries(metadata)) {
        expect(allowedKeys.has(key)).toBe(true)
        expect(['boolean', 'number', 'string']).toContain(typeof value)
      }
    }
  })

  test('the cycle summary carries the counts and says nothing about who or what was read', async () => {
    const { counters, lines } = await runCycleCollectingLogs()
    const summary = lines.find((line) => line.message === 'canhoto_read_cycle_finished')

    expect(summary?.level).toBe('info')
    expect(summary?.metadata).toMatchObject({
      attemptedWithoutCode: 1,
      correlationId: 'correlation-1',
      executionId: 'execution-1',
      objectUnavailable: 1,
      proofsSeen: 6,
      reportRejected: 1,
      unexpectedErrors: 1,
    })
    expect(counters['reported']).toBe(1)
  })

  test('a failed proof is logged by its opaque id and its outcome, not by the error message', async () => {
    const { lines } = await runCycleCollectingLogs()
    const failures = lines.filter((line) => line.message === 'canhoto_read_proof_failed')

    expect(failures.map((line) => line.metadata)).toEqual([
      { outcome: 'object_unavailable', proofId: 'proof-0' },
      { outcome: 'unexpected_error', proofId: 'proof-1' },
      { outcome: 'report_rejected', proofId: 'proof-4' },
      { outcome: 'api_unreachable', proofId: 'proof-5' },
    ])
  })
})
