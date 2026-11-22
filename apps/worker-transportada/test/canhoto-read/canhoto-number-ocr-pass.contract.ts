/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T4 (RF2, RF8, D2, D5, D6, D7): a segunda passada da rotina `trip.canhoto.read` — OCR do Nº/Série impresso.
 * Quando roda, o que reporta, quando carimba a tentativa, o orçamento por ciclo e os contadores. O motor é dublê: a
 * leitura do Nº é a política `extractCanhotoIdentity` (CA02, T1) e o veredito é da API (CA01, T2).
 */
import { describe, expect, test } from 'bun:test'

import { CanhotoOcrError } from '../../src/canhoto-ocr/application/canhoto-ocr-reader.port.js'
import type {
  CanhotoNumberOcrQueuePort,
  ListPendingCanhotoNumberOcrProofsParams,
  MarkCanhotoNumberOcrAttemptedParams,
  PendingCanhotoNumberOcrProof,
} from '../../src/canhoto-read/application/canhoto-number-ocr-queue.port.js'
import type {
  CanhotoNumberOcrReaderPort,
  CanhotoNumberOcrResult,
} from '../../src/canhoto-read/application/canhoto-number-ocr-reader.port.js'
import { createCanhotoReadRoutine } from '../../src/canhoto-read/application/canhoto-read.routine.js'
import type { CanhotoReadQueuePort } from '../../src/canhoto-read/application/canhoto-read-queue.port.js'
import { CanhotoReviewApiError } from '../../src/canhoto-read/application/canhoto-review-api.error.js'
import type { ReportCanhotoReadingParams } from '../../src/canhoto-read/application/canhoto-review-api.port.js'
import {
  CANHOTO_NUMBER_OCR_MAX_PROOFS_PER_CYCLE,
  CANHOTO_NUMBER_OCR_MAX_READS_PER_CYCLE,
  CANHOTO_NUMBER_OCR_QUEUE_KEY,
} from '../../src/canhoto-read/domain/canhoto-read.constant.js'
import { CANHOTO_OCR_MAX_IMAGE_BYTES } from '../../src/canhoto-ocr/domain/canhoto-ocr.constant.js'

const NOW = new Date('2026-11-22T12:00:00.000Z')
const READ_NUMBER = '172195'

function buildProof(
  index: number,
  documentNumber: string | null = READ_NUMBER,
): PendingCanhotoNumberOcrProof {
  return {
    bucket: 'bucket',
    companyId: 'company-1',
    documentId: `document-${index}`,
    documentNumber,
    mimeType: 'image/jpeg',
    objectKey: `object-${index}`,
    proofId: `proof-${String(index).padStart(3, '0')}`,
    sizeBytes: 1000,
    tripId: 'trip-1',
  }
}

const proofs = (count: number): PendingCanhotoNumberOcrProof[] =>
  Array.from({ length: count }, (_, index) => buildProof(index))

type Options = {
  /** Sem entrada: lê o Nº 172195, série 1. */
  readonly reading?: (proof: PendingCanhotoNumberOcrProof) => CanhotoNumberOcrResult | Error
  readonly report?: (params: ReportCanhotoReadingParams) => Error | { review: string }
  readonly objectMissing?: (proof: PendingCanhotoNumberOcrProof) => boolean
  readonly enabled?: boolean
  readonly stopAfterReads?: number
}

function buildHarness(pending: readonly PendingCanhotoNumberOcrProof[], options: Options = {}) {
  const handled = new Set<string>()
  const events: string[] = []
  const listCalls: ListPendingCanhotoNumberOcrProofsParams[] = []
  const marked: MarkCanhotoNumberOcrAttemptedParams[] = []
  const engineReads: { proofId: string; queueKey: string }[] = []
  const downloads: string[] = []
  const reports: ReportCanhotoReadingParams[] = []
  const captured: unknown[] = []
  const logLines: unknown[] = []

  const barcodeQueue: CanhotoReadQueuePort = {
    listPending: async () => {
      events.push('barcode.listPending')
      return []
    },
    listTripDocuments: async () => [],
    markAttempted: async () => true,
  }
  const ocrQueue: CanhotoNumberOcrQueuePort = {
    listPending: async (params) => {
      events.push('ocr.listPending')
      listCalls.push({ ...params, excludeProofIds: [...params.excludeProofIds] })
      return pending
        .filter((proof) => !handled.has(proof.proofId))
        .filter((proof) => !params.excludeProofIds.includes(proof.proofId))
        .slice(0, params.limit)
    },
    markAttempted: async (params) => {
      marked.push(params)
      handled.add(params.proofId)
      return true
    },
  }
  const byObjectKey = new Map(pending.map((proof) => [proof.objectKey, proof]))
  const reader: CanhotoNumberOcrReaderPort = {
    readIdentity: async ({ bytes, queueKey }) => {
      const proof = byObjectKey.get(new TextDecoder().decode(bytes))
      if (proof === undefined) throw new Error('unknown photo')
      engineReads.push({ proofId: proof.proofId, queueKey })
      const outcome = options.reading?.(proof) ?? {
        identity: { number: READ_NUMBER, series: '1' },
        kind: 'read',
      }
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  }
  const log = (...args: unknown[]) => {
    logLines.push(args)
  }

  const routine = createCanhotoReadRoutine({
    errorTracker: { captureException: (error) => captured.push(error) },
    imageReader: { read: async () => ({ kind: 'read', text: null }) },
    logger: { error: log, info: log, warn: log },
    now: () => NOW,
    ...(options.enabled === false
      ? {}
      : {
          numberOcr: {
            objectReader: {
              read: async ({ key }) => {
                downloads.push(key)
                const proof = byObjectKey.get(key)
                if (proof !== undefined && options.objectMissing?.(proof) === true) return undefined
                return new TextEncoder().encode(key)
              },
            },
            queue: ocrQueue,
            reader,
          },
        }),
    queue: barcodeQueue,
    reviewApi: {
      report: async (params) => {
        reports.push(params)
        const outcome = options.report?.(params) ?? { review: 'pending' }
        if (outcome instanceof Error) throw outcome
        for (const proof of pending)
          if (proof.documentId === params.documentId) handled.add(proof.proofId)
        return outcome
      },
    },
  })

  return {
    captured,
    downloads,
    engineReads,
    events,
    listCalls,
    logLines,
    marked,
    reports,
    run: () =>
      routine.run({
        correlationId: 'correlation-1',
        executionId: 'execution-1',
        isStopRequested: () =>
          options.stopAfterReads !== undefined && engineReads.length >= options.stopAfterReads,
        job: 'trip.canhoto.read',
        origin: 'schedule',
      }),
  }
}

describe('canhoto number OCR pass (spec 344 T4)', () => {
  describe('the flag', () => {
    test('off: the routine is the one from before — no OCR queue, no engine, no OCR counters', async () => {
      const harness = buildHarness(proofs(3), { enabled: false })

      const result = await harness.run()

      expect(harness.events).toEqual(['barcode.listPending'])
      expect(harness.engineReads).toHaveLength(0)
      expect(Object.keys(result.counters).filter((key) => key.startsWith('ocr'))).toEqual([])
      expect(result.outcome).toBe('succeeded')
    })

    test('on: the OCR pass runs after the barcode pass, never before', async () => {
      const harness = buildHarness(proofs(1))

      await harness.run()

      expect(harness.events).toEqual(['barcode.listPending', 'ocr.listPending'])
    })
  })

  describe('what is reported', () => {
    test('a number read is reported as ocr: number and series, never a document id', async () => {
      const harness = buildHarness([buildProof(0, '931988')])

      const result = await harness.run()

      expect(harness.reports).toEqual([
        {
          companyId: 'company-1',
          documentId: 'document-0',
          reading: {
            readDocumentId: null,
            readNumber: READ_NUMBER,
            readSeries: '1',
            readSource: 'ocr',
          },
          tripId: 'trip-1',
        },
      ])
      expect(harness.marked).toEqual([])
      expect(result.counters).toMatchObject({ ocrMismatch: 1, ocrRead: 1 })
    })

    test('the number of the note itself is reported too, and is not counted as mismatch', async () => {
      const harness = buildHarness([buildProof(0, '000172195')])

      const result = await harness.run()

      expect(harness.reports).toHaveLength(1)
      expect(result.counters).toMatchObject({ ocrMismatch: 0, ocrRead: 1 })
    })

    test('a series not read goes as null', async () => {
      const harness = buildHarness(proofs(1), {
        reading: () => ({ identity: { number: '172195', series: null }, kind: 'read' }),
      })

      await harness.run()

      expect(harness.reports[0]?.reading.readSeries).toBeNull()
    })

    test('the routine takes one place of the shared engine, under its own key', async () => {
      const harness = buildHarness(proofs(2))

      await harness.run()

      expect(harness.engineReads.map((read) => read.queueKey)).toEqual([
        CANHOTO_NUMBER_OCR_QUEUE_KEY,
        CANHOTO_NUMBER_OCR_QUEUE_KEY,
      ])
    })
  })

  describe('when the attempt is stamped (D7)', () => {
    test('no anchored number: stamped, nothing reported, the proof leaves the queue', async () => {
      const harness = buildHarness(proofs(1), {
        reading: () => ({ identity: null, kind: 'read' }),
      })

      const result = await harness.run()

      expect(harness.reports).toEqual([])
      expect(harness.marked).toEqual([
        { attemptedAt: NOW, companyId: 'company-1', proofId: 'proof-000' },
      ])
      expect(result.counters).toMatchObject({ ocrNoAnchor: 1, ocrRead: 0 })
    })

    test('a photo that does not open is the photo’s fault: stamped as unreadable', async () => {
      const harness = buildHarness(proofs(1), { reading: () => ({ kind: 'unreadable' }) })

      const result = await harness.run()

      expect(harness.marked.map((mark) => mark.proofId)).toEqual(['proof-000'])
      expect(result.counters).toMatchObject({ ocrUnreadable: 1 })
    })

    for (const reason of ['busy', 'timeout', 'engine_failed'] as const) {
      test(`engine ${reason}: not stamped, and the pass stops for this cycle`, async () => {
        const harness = buildHarness(proofs(3), {
          reading: () => new CanhotoOcrError(reason),
        })

        const result = await harness.run()

        expect(harness.engineReads).toHaveLength(1)
        expect(harness.marked).toEqual([])
        expect(harness.reports).toEqual([])
        const counter = {
          busy: 'ocrBusy',
          engine_failed: 'ocrEngineFailed',
          timeout: 'ocrTimeout',
        }[reason]
        expect(result.counters[counter]).toBe(1)
        expect(result.outcome).toBe('succeeded')
      })
    }

    test('too large, unsupported or missing object: not stamped, no download or engine spent', async () => {
      const harness = buildHarness(
        [
          { ...buildProof(0), sizeBytes: CANHOTO_OCR_MAX_IMAGE_BYTES + 1 },
          { ...buildProof(1), mimeType: 'application/pdf' },
          buildProof(2),
          buildProof(3),
        ],
        { objectMissing: (proof) => proof.proofId === 'proof-002' },
      )

      const result = await harness.run()

      expect(harness.downloads).toEqual(['object-2', 'object-3'])
      expect(harness.engineReads.map((read) => read.proofId)).toEqual(['proof-003'])
      expect(harness.marked).toEqual([])
      expect(result.counters).toMatchObject({
        ocrObjectUnavailable: 1,
        ocrRead: 1,
        ocrTooLarge: 1,
        ocrUnsupportedMedia: 1,
      })
    })

    test('API unreachable: the reading is not stamped and the pass stops', async () => {
      const harness = buildHarness(proofs(3), {
        report: () => new CanhotoReviewApiError('api_unreachable', 503),
      })

      const result = await harness.run()

      expect(harness.reports).toHaveLength(1)
      expect(harness.marked).toEqual([])
      expect(harness.captured).toEqual([])
      expect(result.counters).toMatchObject({ ocrApiUnreachable: 1, ocrRead: 0 })
    })

    test('a report rejected goes to Sentry, is not stamped, and the next proof is still read', async () => {
      const harness = buildHarness(proofs(2), {
        report: (params) =>
          params.documentId === 'document-0'
            ? new CanhotoReviewApiError('report_rejected', 400)
            : { review: 'pending' },
      })

      const result = await harness.run()

      expect(harness.reports).toHaveLength(2)
      expect(harness.marked).toEqual([])
      expect(harness.captured).toHaveLength(1)
      expect(result.counters).toMatchObject({ ocrRead: 1, ocrReportRejected: 1 })
    })
  })

  describe('budget per cycle (D6)', () => {
    test('at most five engine reads per cycle; the rest waits for the next beat', async () => {
      const harness = buildHarness(proofs(12), {
        reading: () => ({ identity: null, kind: 'read' }),
      })

      const result = await harness.run()

      expect(harness.engineReads).toHaveLength(CANHOTO_NUMBER_OCR_MAX_READS_PER_CYCLE)
      expect(result.counters['ocrNoAnchor']).toBe(CANHOTO_NUMBER_OCR_MAX_READS_PER_CYCLE)
    })

    test('cheap refusals do not spend the reads, but the proofs seen are capped too', async () => {
      const harness = buildHarness(
        Array.from({ length: 40 }, (_, index) => ({
          ...buildProof(index),
          sizeBytes: CANHOTO_OCR_MAX_IMAGE_BYTES + 1,
        })),
      )

      const result = await harness.run()

      expect(result.counters['ocrProofsSeen']).toBe(CANHOTO_NUMBER_OCR_MAX_PROOFS_PER_CYCLE)
      for (const call of harness.listCalls) {
        expect(call.excludeProofIds.length + call.limit).toBeLessThanOrEqual(
          CANHOTO_NUMBER_OCR_MAX_PROOFS_PER_CYCLE,
        )
      }
    })

    test('a stop request is read at the proof boundary', async () => {
      const harness = buildHarness(proofs(5), { stopAfterReads: 2 })

      await harness.run()

      expect(harness.engineReads).toHaveLength(2)
    })
  })

  test('RF8: the cycle log carries counters and opaque ids only — never the number read', async () => {
    const harness = buildHarness([buildProof(0, '931988'), buildProof(1)], {
      report: (params) =>
        params.documentId === 'document-1'
          ? new CanhotoReviewApiError('report_rejected', 400)
          : { review: 'pending' },
    })

    await harness.run()

    const serialized = JSON.stringify(harness.logLines)
    expect(serialized).not.toContain(READ_NUMBER)
    expect(serialized).toContain('canhoto_read_cycle_finished')
    expect(serialized).toContain('canhoto_number_ocr_proof_failed')
    expect(serialized).toContain('"ocrMismatch":1')
  })
})
