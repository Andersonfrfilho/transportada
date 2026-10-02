/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T6.6 (RF-B2, RF-B8, RF-B9, CA14): o laço da rotina — tetos, parada, falha contada sem
 * derrubar o resto e a regra de quando a tentativa é gravada.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CanhotoImageReadResult,
  CanhotoImageReaderPort,
} from '../../src/canhoto-read/application/canhoto-image-reader.service.js'
import { createCanhotoReadRoutine } from '../../src/canhoto-read/application/canhoto-read.routine.js'
import type {
  CanhotoReadQueuePort,
  ListPendingCanhotoProofsParams,
  ListTripDocumentsParams,
  MarkCanhotoReadAttemptedParams,
  PendingCanhotoProof,
} from '../../src/canhoto-read/application/canhoto-read-queue.port.js'
import { CanhotoReviewApiError } from '../../src/canhoto-read/application/canhoto-review-api.error.js'
import type {
  CanhotoReviewApiPort,
  ReportCanhotoReadingParams,
} from '../../src/canhoto-read/application/canhoto-review-api.port.js'
import {
  CANHOTO_READ_BATCH_SIZE,
  CANHOTO_READ_MAX_PROOFS_PER_CYCLE,
} from '../../src/canhoto-read/domain/canhoto-read.constant.js'
import type { CanhotoTripDocument } from '../../src/canhoto-read/domain/canhoto-barcode.policy.js'

const REQUESTED_KEY = '35240912345678000199550010000123451876543212'
const NOT_ON_TRIP_KEY = '35240912345678000199550010000999991111122222'
const NOW = new Date('2026-10-02T12:00:00.000Z')
const COMPANY_ID = 'company-1'
const TRIP_DOCUMENTS: readonly CanhotoTripDocument[] = [
  {
    accessKey: REQUESTED_KEY,
    id: 'doc-requested',
    nfeNumber: '12345',
    nfeSeries: '1',
    releasedAt: null,
  },
]

function buildProof(index: number): PendingCanhotoProof {
  return {
    bucket: 'bucket',
    companyId: COMPANY_ID,
    documentId: `document-${index}`,
    mimeType: 'image/jpeg',
    objectKey: `object-${index}`,
    proofId: `proof-${String(index).padStart(3, '0')}`,
    sizeBytes: 1000,
    tripId: 'trip-1',
  }
}

type Harness = {
  readonly captured: unknown[]
  readonly listCalls: ListPendingCanhotoProofsParams[]
  readonly marked: MarkCanhotoReadAttemptedParams[]
  readonly reads: string[]
  readonly reports: ReportCanhotoReadingParams[]
  readonly tripDocumentCalls: ListTripDocumentsParams[]
  run: (
    isStopRequested?: () => boolean,
  ) => ReturnType<ReturnType<typeof createCanhotoReadRoutine>['run']>
}

type HarnessOptions = {
  /** Resultado por `proofId`; sem entrada, a foto traz a chave da nota da viagem. */
  readonly reading?: (proof: PendingCanhotoProof) => CanhotoImageReadResult | Error
  readonly report?: (params: ReportCanhotoReadingParams) => Error | { review: string }
  readonly markAttempted?: () => boolean
}

function buildHarness(
  pending: readonly PendingCanhotoProof[],
  options: HarnessOptions = {},
): Harness {
  const handled = new Set<string>()
  const listCalls: ListPendingCanhotoProofsParams[] = []
  const marked: MarkCanhotoReadAttemptedParams[] = []
  const reads: string[] = []
  const reports: ReportCanhotoReadingParams[] = []
  const captured: unknown[] = []
  const tripDocumentCalls: ListTripDocumentsParams[] = []

  const queue: CanhotoReadQueuePort = {
    listPending: async (params) => {
      listCalls.push({ ...params, excludeProofIds: [...params.excludeProofIds] })
      return pending
        .filter((proof) => !handled.has(proof.proofId))
        .filter((proof) => !params.excludeProofIds.includes(proof.proofId))
        .slice(0, params.limit)
    },
    listTripDocuments: async (params) => {
      tripDocumentCalls.push(params)
      return TRIP_DOCUMENTS
    },
    markAttempted: async (params) => {
      marked.push(params)
      handled.add(params.proofId)
      return options.markAttempted?.() ?? true
    },
  }
  const imageReader: CanhotoImageReaderPort = {
    read: async (proof) => {
      reads.push(proof.proofId)
      const outcome = options.reading?.(proof) ?? { kind: 'read', text: REQUESTED_KEY }
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  }
  const reviewApi: CanhotoReviewApiPort = {
    report: async (params) => {
      reports.push(params)
      const outcome = options.report?.(params) ?? { review: 'approved' }
      if (outcome instanceof Error) throw outcome
      for (const proof of pending)
        if (proof.documentId === params.documentId) handled.add(proof.proofId)
      return outcome
    },
  }
  const routine = createCanhotoReadRoutine({
    errorTracker: { captureException: (error) => captured.push(error) },
    imageReader,
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    now: () => NOW,
    queue,
    reviewApi,
  })

  return {
    captured,
    listCalls,
    marked,
    reads,
    reports,
    tripDocumentCalls,
    run: (isStopRequested = () => false) =>
      routine.run({
        correlationId: 'correlation-1',
        executionId: 'execution-1',
        isStopRequested,
        job: 'trip.canhoto.read',
        origin: 'schedule',
      }),
  }
}

function proofs(count: number): PendingCanhotoProof[] {
  return Array.from({ length: count }, (_, index) => buildProof(index))
}

describe('canhoto read routine loop (spec 222 T6.6)', () => {
  describe('limits', () => {
    test('asks the queue in batches no larger than the batch size', async () => {
      const harness = buildHarness(proofs(25))

      const result = await harness.run()

      expect(harness.listCalls.map((call) => call.limit)).toEqual([
        CANHOTO_READ_BATCH_SIZE,
        CANHOTO_READ_BATCH_SIZE,
        CANHOTO_READ_BATCH_SIZE,
      ])
      expect(result.counters['reported']).toBe(25)
    })

    test('stops at the per-cycle cap and leaves the rest of the queue for the next beat', async () => {
      const harness = buildHarness(proofs(100), {
        reading: () => ({ kind: 'failed', outcome: 'object_unavailable' }),
      })

      const result = await harness.run()

      expect(harness.reads).toHaveLength(CANHOTO_READ_MAX_PROOFS_PER_CYCLE)
      expect(result.counters['objectUnavailable']).toBe(CANHOTO_READ_MAX_PROOFS_PER_CYCLE)
      expect(harness.listCalls.map((call) => call.excludeProofIds.length)).toEqual([0, 10, 20, 30])
    })

    test('never asks for more than what is left of the cycle cap', async () => {
      const harness = buildHarness(proofs(100), {
        reading: () => ({ kind: 'failed', outcome: 'too_large' }),
      })

      await harness.run()

      for (const call of harness.listCalls) {
        expect(call.limit).toBeLessThanOrEqual(CANHOTO_READ_BATCH_SIZE)
        expect(call.excludeProofIds.length + call.limit).toBeLessThanOrEqual(
          CANHOTO_READ_MAX_PROOFS_PER_CYCLE,
        )
      }
    })

    test('a proof that failed for infrastructure is not offered again inside the same cycle', async () => {
      const harness = buildHarness(proofs(3), {
        reading: () => ({ kind: 'failed', outcome: 'decode_timeout' }),
      })

      await harness.run()

      expect(harness.reads).toEqual(['proof-000', 'proof-001', 'proof-002'])
    })
  })

  describe('stop request', () => {
    test('does not even query the queue when the stop is already requested', async () => {
      const harness = buildHarness(proofs(5))

      const result = await harness.run(() => true)

      expect(harness.listCalls).toHaveLength(0)
      expect(result.outcome).toBe('succeeded')
    })

    test('is read before each proof: what already finished stays, the rest waits', async () => {
      const harness = buildHarness(proofs(8))
      let checks = 0

      await harness.run(() => {
        checks += 1
        return checks > 4
      })

      expect(harness.reads).toHaveLength(3)
    })
  })

  describe('one proof failing does not drop the rest (CA14)', () => {
    test('missing object is counted and the others of the batch are read', async () => {
      const harness = buildHarness(proofs(3), {
        reading: (proof) =>
          proof.proofId === 'proof-001'
            ? { kind: 'failed', outcome: 'object_unavailable' }
            : { kind: 'read', text: REQUESTED_KEY },
      })

      const result = await harness.run()

      expect(result.outcome).toBe('succeeded')
      expect(result.counters['objectUnavailable']).toBe(1)
      expect(result.counters['reported']).toBe(2)
      expect(harness.reports.map((report) => report.documentId)).toEqual([
        'document-0',
        'document-2',
      ])
    })

    test('an unexpected throw on one proof is counted, sent to Sentry, and the cycle goes on', async () => {
      const failure = new Error('decoder blew up')
      const harness = buildHarness(proofs(3), {
        reading: (proof) =>
          proof.proofId === 'proof-000' ? failure : { kind: 'read', text: REQUESTED_KEY },
      })

      const result = await harness.run()

      expect(result.outcome).toBe('succeeded')
      expect(result.counters['unexpectedErrors']).toBe(1)
      expect(result.counters['reported']).toBe(2)
      expect(harness.captured).toEqual([failure])
      expect(harness.marked).toHaveLength(0)
    })
  })

  describe('what is reported', () => {
    test('only the four reading fields, never a verdict, addressed to the proof document', async () => {
      const harness = buildHarness(proofs(1))

      await harness.run()

      expect(harness.reports).toEqual([
        {
          companyId: COMPANY_ID,
          documentId: 'document-0',
          reading: {
            readDocumentId: 'doc-requested',
            readNumber: '12345',
            readSeries: '1',
            readSource: 'barcode',
          },
          tripId: 'trip-1',
        },
      ])
      expect(Object.keys(harness.reports[0]?.reading ?? {}).sort()).toEqual([
        'readDocumentId',
        'readNumber',
        'readSeries',
        'readSource',
      ])
    })

    test('a valid key from a note that is not on the trip still reports the number read', async () => {
      const harness = buildHarness(proofs(1), {
        reading: () => ({ kind: 'read', text: NOT_ON_TRIP_KEY }),
      })

      await harness.run()

      expect(harness.reports[0]?.reading).toEqual({
        readDocumentId: null,
        readNumber: '99999',
        readSeries: '1',
        readSource: 'barcode',
      })
    })

    test('counts the review the server decided, without deciding it', async () => {
      const harness = buildHarness(proofs(4), {
        report: (params) => ({
          review: params.documentId === 'document-3' ? 'pending' : 'approved',
        }),
      })

      const result = await harness.run()

      expect(result.counters['approved']).toBe(3)
      expect(result.counters['pending']).toBe(1)
    })
  })

  describe('attempt stamp (RF-B9)', () => {
    test('a read that ended without a usable code stamps the attempt and calls no API', async () => {
      const harness = buildHarness(proofs(2), {
        reading: (proof) =>
          proof.proofId === 'proof-000'
            ? { kind: 'read', text: null }
            : { kind: 'read', text: 'not-a-key' },
      })

      const result = await harness.run()

      expect(harness.reports).toHaveLength(0)
      expect(harness.marked).toEqual([
        { attemptedAt: NOW, companyId: COMPANY_ID, proofId: 'proof-000' },
        { attemptedAt: NOW, companyId: COMPANY_ID, proofId: 'proof-001' },
      ])
      expect(result.counters['attemptedWithoutCode']).toBe(2)
    })

    test('a stamp the queue refuses (someone else got there first) is counted, not an error', async () => {
      const harness = buildHarness(proofs(1), {
        markAttempted: () => false,
        reading: () => ({ kind: 'read', text: null }),
      })

      const result = await harness.run()

      expect(result.counters['alreadyHandled']).toBe(1)
      expect(result.counters['attemptedWithoutCode']).toBe(0)
    })

    for (const outcome of [
      'object_unavailable',
      'unsupported_media',
      'too_large',
      'decode_timeout',
    ] as const) {
      test(`infrastructure failure ${outcome} does not stamp and does not call the API`, async () => {
        const harness = buildHarness(proofs(1), { reading: () => ({ kind: 'failed', outcome }) })

        await harness.run()

        expect(harness.marked).toHaveLength(0)
        expect(harness.reports).toHaveLength(0)
        expect(harness.captured).toHaveLength(0)
      })
    }

    test('a successful report never stamps: the server already took the proof out of the queue', async () => {
      const harness = buildHarness(proofs(2))

      await harness.run()

      expect(harness.marked).toHaveLength(0)
    })
  })

  describe('API failures (RF-B8)', () => {
    test('api_unreachable is counted, does not stamp and is not an incident for Sentry', async () => {
      const harness = buildHarness(proofs(2), {
        report: () => new CanhotoReviewApiError('api_unreachable'),
      })

      const result = await harness.run()

      expect(result.counters['apiUnreachable']).toBe(2)
      expect(harness.marked).toHaveLength(0)
      expect(harness.captured).toHaveLength(0)
    })

    for (const [outcome, status, counter] of [
      ['report_rejected', 400, 'reportRejected'],
      ['report_rejected', 404, 'reportRejected'],
      ['report_rejected', 409, 'reportRejected'],
      ['api_unauthorized', 401, 'apiUnauthorized'],
      ['api_unauthorized', 403, 'apiUnauthorized'],
    ] as const) {
      test(`${outcome} (${status}) is counted, does not stamp and goes to Sentry`, async () => {
        const error = new CanhotoReviewApiError(outcome, status)
        const harness = buildHarness(proofs(3), {
          report: (params) => (params.documentId === 'document-1' ? error : { review: 'approved' }),
        })

        const result = await harness.run()

        expect(result.outcome).toBe('succeeded')
        expect(result.counters[counter]).toBe(1)
        expect(result.counters['reported']).toBe(2)
        expect(harness.captured).toEqual([error])
        expect(harness.marked).toHaveLength(0)
      })
    }
  })

  describe('as notas da viagem (T7.3, N+1)', () => {
    test('comprovantes da mesma viagem no mesmo lote consultam as notas uma vez', async () => {
      const harness = buildHarness(proofs(5))

      const result = await harness.run()

      expect(result.counters['reported']).toBe(5)
      expect(harness.tripDocumentCalls).toEqual([{ companyId: COMPANY_ID, tripId: 'trip-1' }])
    })

    test('cada viagem do lote tem a consulta dela', async () => {
      const [first, second] = proofs(2)
      const harness = buildHarness([first!, { ...second!, tripId: 'trip-2' }])

      await harness.run()

      expect(harness.tripDocumentCalls.map((call) => call.tripId)).toEqual(['trip-1', 'trip-2'])
    })

    test('o cache nao cruza lotes: nota criada entre dois lotes ainda e vista', async () => {
      const harness = buildHarness(proofs(CANHOTO_READ_BATCH_SIZE + 1))

      await harness.run()

      expect(harness.listCalls).toHaveLength(2)
      expect(harness.tripDocumentCalls).toHaveLength(2)
    })
  })
})
