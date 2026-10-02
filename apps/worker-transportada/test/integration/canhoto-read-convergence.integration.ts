/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T6.10 (CA17): foto sem código de barras é lida **uma vez**. A tentativa fica gravada e,
 * no ciclo seguinte, o objeto nem é baixado — sem isso a fila reler a mesma foto a cada cinco
 * minutos para sempre. Aqui o decodificador e o leitor de imagem são os reais (worker_thread,
 * zxing, JPEG de câmera); só o armazenamento e o servidor são dublês.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createCanhotoImageReader } from '../../src/canhoto-read/application/canhoto-image-reader.service.js'
import { createCanhotoReadRoutine } from '../../src/canhoto-read/application/canhoto-read.routine.js'
import type { ReportCanhotoReadingParams } from '../../src/canhoto-read/application/canhoto-review-api.port.js'
import { createThreadedCanhotoBarcodeDecoder } from '../../src/canhoto-read/infrastructure/threaded-canhoto-barcode.decoder.js'
import { createDrizzleCanhotoReadQueue } from '../../src/canhoto-read/infrastructure/drizzle-canhoto-read-queue.repository.js'
import {
  buildCanhotoPhoto,
  CANHOTO_PHOTO_ACCESS_KEY,
  REALISTIC_CAMERA_PHOTO,
} from '../fixtures/canhoto-photo.fixture.js'
import {
  createCanhotoGraph,
  type CanhotoGraph,
  type SeededCanhotoProof,
} from '../fixtures/canhoto-graph.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-10-02T12:00:00.000Z')
const PHOTO_NOTE_NUMBER = '12345'

type ProofRow = {
  readonly canhoto_read_attempted_at: Date | string | null
  readonly canhoto_read_number: string | null
  readonly canhoto_read_source: string | null
  readonly canhoto_review: string
  readonly id: string
}

describeDatabase('convergência da rotina de canhoto (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  let graph: CanhotoGraph
  let withoutBarcode: SeededCanhotoProof
  let withBarcode: SeededCanhotoProof
  const photoByObjectKey = new Map<string, Uint8Array>()
  const downloadedObjectKeys: string[] = []
  const reports: ReportCanhotoReadingParams[] = []

  function buildRoutine(): ReturnType<typeof createCanhotoReadRoutine> {
    return createCanhotoReadRoutine({
      errorTracker: { captureException: () => undefined },
      imageReader: createCanhotoImageReader({
        decoder: createThreadedCanhotoBarcodeDecoder(),
        objectReader: {
          read: async ({ key }) => {
            downloadedObjectKeys.push(key)
            return photoByObjectKey.get(key)
          },
        },
      }),
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      now: () => NOW,
      queue: createDrizzleCanhotoReadQueue(db),
      reviewApi: {
        report: async (params) => {
          reports.push(params)
          await db.execute(sql`
            update trip_delivery_proofs
            set "canhoto_read_document_id" = ${params.reading.readDocumentId}::uuid,
                "canhoto_read_number" = ${params.reading.readNumber},
                "canhoto_read_series" = ${params.reading.readSeries},
                "canhoto_read_source" = ${params.reading.readSource}
            where "id" = ${withBarcode.proofId}::uuid
          `)
          return { review: 'pending' }
        },
      },
    })
  }

  async function runCycle(): Promise<Readonly<Record<string, number>>> {
    const result = await buildRoutine().run({
      correlationId: 'correlation-convergence',
      executionId: 'execution-convergence',
      isStopRequested: () => false,
      job: 'trip.canhoto.read',
      origin: 'schedule',
    })
    return result.counters
  }

  async function readProof(proofId: string): Promise<ProofRow> {
    const rows = (await db.execute(sql`
      select "id", "canhoto_review", "canhoto_read_number", "canhoto_read_source",
             "canhoto_read_attempted_at"
      from trip_delivery_proofs where "id" = ${proofId}::uuid
    `)) as unknown as ProofRow[]
    const row = rows[0]
    if (row === undefined) throw new Error('proof row missing')
    return row
  }

  const downloadsOf = (proof: SeededCanhotoProof): number =>
    downloadedObjectKeys.filter((key) => key === proof.objectKey).length

  beforeAll(async () => {
    graph = await createCanhotoGraph(db)
    withoutBarcode = await graph.seedProof({
      accessKey: '35240912345678000199550010000999991876543210',
      createdAt: '2026-10-01T10:00:00.000Z',
      noteNumber: '99999',
      noteSeries: '1',
    })
    withBarcode = await graph.seedProof({
      accessKey: CANHOTO_PHOTO_ACCESS_KEY,
      createdAt: '2026-10-01T10:01:00.000Z',
      noteNumber: PHOTO_NOTE_NUMBER,
      noteSeries: '1',
    })
    photoByObjectKey.set(
      withoutBarcode.objectKey,
      await buildCanhotoPhoto({ ...REALISTIC_CAMERA_PHOTO, hasBarcode: false }),
    )
    photoByObjectKey.set(withBarcode.objectKey, await buildCanhotoPhoto(REALISTIC_CAMERA_PHOTO))
  })

  afterAll(async () => {
    await graph.cleanup()
    await provider.close()
  })

  test('the first cycle reads the photo without a code once and stamps the attempt', async () => {
    const counters = await runCycle()

    expect(downloadsOf(withoutBarcode)).toBe(1)
    expect(counters).toMatchObject({ attemptedWithoutCode: 1, proofsSeen: 2, reported: 1 })

    const row = await readProof(withoutBarcode.proofId)
    expect(row.canhoto_read_attempted_at).not.toBeNull()
    expect(row.canhoto_review).toBe('pending')
    expect(row.canhoto_read_source).toBeNull()
    expect(row.canhoto_read_number).toBeNull()
  })

  test('the photo with a real barcode is decoded and reported with the number it carries', async () => {
    expect(reports).toHaveLength(1)
    expect(reports[0]?.documentId).toBe(withBarcode.documentId)
    expect(reports[0]?.reading).toEqual({
      readDocumentId: withBarcode.documentId,
      readNumber: PHOTO_NOTE_NUMBER,
      readSeries: '1',
      readSource: 'barcode',
    })
  })

  test('the second cycle does not download the photo without a code again', async () => {
    const counters = await runCycle()

    expect(counters['proofsSeen']).toBe(0)
    expect(downloadsOf(withoutBarcode)).toBe(1)
    expect(downloadsOf(withBarcode)).toBe(1)
    expect(reports).toHaveLength(1)
  })
})
