/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T4 (CA03, D7): a passada OCR do Nº/Série contra Postgres de verdade — a fila do OCR (com o índice parcial
 * da T2), o carimbo `canhoto_ocr_attempted_at` e o ciclo inteiro da rotina `trip.canhoto.read`, código de barras
 * primeiro.
 *
 * ⚠️ O que **não** é real aqui: o motor e o veredito. O motor é dublê (a leitura do Nº é a política da T1, provada nos
 * contratos CA02) e o `serverEmulator` reproduz em SQL o que a rota do robô da T2 grava para `readSource = 'ocr'`
 * (leitura gravada, `pending`, sem origem nem instante). A regra é provada nos testes da API (CA01).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import { CanhotoOcrError } from '../../src/canhoto-ocr/application/canhoto-ocr-reader.port.js'
import type {
  CanhotoNumberOcrReaderPort,
  CanhotoNumberOcrResult,
} from '../../src/canhoto-read/application/canhoto-number-ocr-reader.port.js'
import { createCanhotoImageReader } from '../../src/canhoto-read/application/canhoto-image-reader.service.js'
import { createCanhotoReadRoutine } from '../../src/canhoto-read/application/canhoto-read.routine.js'
import type {
  CanhotoReviewApiPort,
  ReportCanhotoReadingParams,
} from '../../src/canhoto-read/application/canhoto-review-api.port.js'
import {
  buildPendingCanhotoNumberOcrProofsQuery,
  createDrizzleCanhotoNumberOcrQueue,
  createDrizzleCanhotoReadQueue,
} from '../../src/canhoto-read/infrastructure/drizzle-canhoto-read-queue.repository.js'
import { buildAccessKey } from '../fixtures/canhoto-access-key.fixture.js'
import {
  createCanhotoGraph,
  type CanhotoGraph,
  type SeededCanhotoProof,
} from '../fixtures/canhoto-graph.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-11-22T12:00:00.000Z')
const at = (minute: number): string => `2026-11-01T10:${String(minute).padStart(2, '0')}:00.000Z`

type ProofRow = {
  readonly canhoto_ocr_attempted_at: string | null
  readonly canhoto_read_attempted_at: string | null
  readonly canhoto_read_document_id: string | null
  readonly canhoto_read_number: string | null
  readonly canhoto_read_series: string | null
  readonly canhoto_read_source: string | null
  readonly canhoto_review: string
  readonly canhoto_review_at: string | null
  readonly canhoto_review_origin: string | null
  readonly id: string
}

describeDatabase('passada OCR do canhoto (integration, spec 344 CA03)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const ocrQueue = createDrizzleCanhotoNumberOcrQueue(db)
  let graph: CanhotoGraph
  /** O que o "motor" lê de cada foto, pela chave do objeto. */
  const readingByObjectKey = new Map<string, () => CanhotoNumberOcrResult>()
  const reports: ReportCanhotoReadingParams[] = []

  let otherNote: SeededCanhotoProof
  let noAnchor: SeededCanhotoProof
  let infraFailure: SeededCanhotoProof

  const reader: CanhotoNumberOcrReaderPort = {
    readIdentity: async ({ bytes }) => {
      const read = readingByObjectKey.get(new TextDecoder().decode(bytes))
      if (read === undefined) throw new Error('unknown photo')
      return read()
    },
  }

  const serverEmulator: CanhotoReviewApiPort = {
    report: async (params) => {
      reports.push(params)
      const { reading } = params
      await db.execute(sql`
        update trip_delivery_proofs p
        set "canhoto_read_document_id" = ${reading.readDocumentId}::uuid,
            "canhoto_read_number" = ${reading.readNumber},
            "canhoto_read_series" = ${reading.readSeries},
            "canhoto_read_source" = ${reading.readSource}
        from trip_stop_events e
        where e."id" = p."stop_event_id" and e."trip_document_id" = ${params.documentId}::uuid
          and p."company_id" = ${params.companyId}::uuid and p."canhoto_review" = 'pending'
      `)
      return { review: 'pending' }
    },
  }

  function buildRoutine(): ReturnType<typeof createCanhotoReadRoutine> {
    const objectReader = {
      read: async ({ key }: { readonly key: string }) => new TextEncoder().encode(key),
    }
    return createCanhotoReadRoutine({
      errorTracker: { captureException: () => undefined },
      // Nenhuma foto tem código de barras: a passada do código de barras só carimba a tentativa dela.
      imageReader: createCanhotoImageReader({
        decoder: { decode: async () => null },
        objectReader,
      }),
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      now: () => NOW,
      numberOcr: { objectReader, queue: ocrQueue, reader },
      queue: createDrizzleCanhotoReadQueue(db),
      reviewApi: serverEmulator,
    })
  }

  async function runCycle(): Promise<Readonly<Record<string, number>>> {
    const result = await buildRoutine().run({
      correlationId: 'correlation-344',
      executionId: 'execution-344',
      isStopRequested: () => false,
      job: 'trip.canhoto.read',
      origin: 'schedule',
    })
    expect(result.outcome).toBe('succeeded')
    return result.counters
  }

  async function rowOf(proof: SeededCanhotoProof): Promise<ProofRow> {
    const rows = (await db.execute(sql`
      select "id", "canhoto_review", "canhoto_review_origin", "canhoto_review_at",
             "canhoto_read_number", "canhoto_read_series", "canhoto_read_source",
             "canhoto_read_document_id", "canhoto_read_attempted_at", "canhoto_ocr_attempted_at"
      from trip_delivery_proofs where "id" = ${proof.proofId}::uuid
    `)) as unknown as ProofRow[]
    const [row] = rows
    if (row === undefined) throw new Error('proof not found')
    return row
  }

  async function ocrQueueIds(): Promise<string[]> {
    const rows = await ocrQueue.listPending({ excludeProofIds: [], limit: 100 })
    return rows.filter((row) => row.companyId === graph.companyId).map((row) => row.proofId)
  }

  async function seed(minute: number, noteNumber: number): Promise<SeededCanhotoProof> {
    return graph.seedProof({
      accessKey: buildAccessKey({ number: noteNumber, series: 1 }),
      createdAt: at(minute),
      noteNumber: String(noteNumber),
      noteSeries: '1',
    })
  }

  beforeAll(async () => {
    graph = await createCanhotoGraph(db)
    // O caso real: a foto anexada à NF 931988 é o canhoto da NF 172195 série 1.
    otherNote = await seed(1, 931988)
    noAnchor = await seed(2, 932066)
    infraFailure = await seed(3, 932085)
    readingByObjectKey.set(otherNote.objectKey, () => ({
      identity: { number: '172195', series: '1' },
      kind: 'read',
    }))
    readingByObjectKey.set(noAnchor.objectKey, () => ({ identity: null, kind: 'read' }))
    readingByObjectKey.set(infraFailure.objectKey, () => {
      throw new CanhotoOcrError('timeout')
    })
  })

  afterAll(async () => {
    await graph.cleanup()
    await provider.close()
  })

  test('a proof the barcode pass has not tried yet is not in the OCR queue', async () => {
    expect(await ocrQueueIds()).toEqual([])
  })

  test('CA03: one cycle — barcode first, then OCR: other note read, no anchor stamped, infra failure untouched', async () => {
    const counters = await runCycle()

    expect(counters).toMatchObject({
      attemptedWithoutCode: 3,
      ocrMismatch: 1,
      ocrNoAnchor: 1,
      ocrProofsSeen: 3,
      ocrRead: 1,
      ocrTimeout: 1,
    })

    const read = await rowOf(otherNote)
    expect(read).toMatchObject({
      canhoto_ocr_attempted_at: null,
      canhoto_read_document_id: null,
      canhoto_read_number: '172195',
      canhoto_read_series: '1',
      canhoto_read_source: 'ocr',
      canhoto_review: 'pending',
      canhoto_review_at: null,
      canhoto_review_origin: null,
    })

    const stamped = await rowOf(noAnchor)
    expect(new Date(String(stamped.canhoto_ocr_attempted_at)).toISOString()).toBe(NOW.toISOString())
    expect(stamped).toMatchObject({
      canhoto_read_number: null,
      canhoto_read_source: null,
      canhoto_review: 'pending',
    })

    const untouched = await rowOf(infraFailure)
    expect(untouched).toMatchObject({
      canhoto_ocr_attempted_at: null,
      canhoto_read_number: null,
      canhoto_read_source: null,
      canhoto_review: 'pending',
    })

    expect(reports.map((report) => report.reading)).toEqual([
      { readDocumentId: null, readNumber: '172195', readSeries: '1', readSource: 'ocr' },
    ])
  })

  test('only the infrastructure failure is still in the OCR queue', async () => {
    expect(await ocrQueueIds()).toEqual([infraFailure.proofId])
  })

  test('the next cycle reads only that one; the others are not read again', async () => {
    readingByObjectKey.set(infraFailure.objectKey, () => ({ identity: null, kind: 'read' }))
    const reportsBefore = reports.length

    const counters = await runCycle()

    expect(counters).toMatchObject({ ocrNoAnchor: 1, ocrProofsSeen: 1, ocrRead: 0, proofsSeen: 0 })
    expect(reports).toHaveLength(reportsBefore)
    expect((await rowOf(infraFailure)).canhoto_ocr_attempted_at).not.toBeNull()
    expect(await ocrQueueIds()).toEqual([])
  })

  test('markAttempted touches only the OCR column, once, and never another company', async () => {
    const proof = await seed(10, 932100)
    await db.execute(sql`
      update trip_delivery_proofs set canhoto_read_attempted_at = now() where id = ${proof.proofId}`)

    expect(
      await ocrQueue.markAttempted({
        attemptedAt: NOW,
        companyId: crypto.randomUUID(),
        proofId: proof.proofId,
      }),
    ).toBe(false)
    expect(
      await ocrQueue.markAttempted({
        attemptedAt: NOW,
        companyId: graph.companyId,
        proofId: proof.proofId,
      }),
    ).toBe(true)
    expect(
      await ocrQueue.markAttempted({
        attemptedAt: NOW,
        companyId: graph.companyId,
        proofId: proof.proofId,
      }),
    ).toBe(false)
    expect(await rowOf(proof)).toMatchObject({
      canhoto_read_source: null,
      canhoto_review: 'pending',
    })
  })

  test('the OCR queue brings the note number of the proof, and keeps the cuts of the barcode queue', async () => {
    const queued = await seed(20, 932200)
    const released = await seed(21, 932201)
    const decided = await seed(22, 932202)
    await db.execute(sql`
      update trip_delivery_proofs set canhoto_read_attempted_at = now()
      where id in (${queued.proofId}, ${released.proofId}, ${decided.proofId})`)
    await db.execute(
      sql`update trip_documents set released_at = now() where id = ${released.documentId}`,
    )
    await db.execute(sql`
      update trip_delivery_proofs set canhoto_review = 'approved', canhoto_review_origin = 'manual',
        canhoto_review_at = now(), canhoto_review_by_user_id = actor_user_id
      where id = ${decided.proofId}`)

    const rows = await ocrQueue.listPending({ excludeProofIds: [], limit: 100 })
    const mine = rows.filter((row) => row.companyId === graph.companyId)
    expect(mine.map((row) => row.proofId)).toEqual([queued.proofId])
    expect(mine[0]).toMatchObject({ documentId: queued.documentId, documentNumber: '932200' })

    await db.execute(sql`update trips set status = 'cancelled' where id = ${graph.tripId}`)
    expect(await ocrQueueIds()).toEqual([])
    await db.execute(sql`update trips set status = 'on_delivery_route' where id = ${graph.tripId}`)
  })

  test('the plan uses the partial index of the OCR queue', async () => {
    const plan = await db.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`)
      const rows = await transaction.execute(
        sql`explain ${buildPendingCanhotoNumberOcrProofsQuery({ excludeProofIds: [], limit: 20 })}`,
      )
      return rows.map((row) => String(row['QUERY PLAN'])).join('\n')
    })

    process.stdout.write(`EXPLAIN (enable_seqscan = off)\n${plan}\n`)
    expect(plan).toContain('trip_delivery_proofs_canhoto_ocr_pending_idx')
  })

  test('the three predicates of the OCR queue go as literals, never as parameters', () => {
    const query = new PgDialect().sqlToQuery(
      buildPendingCanhotoNumberOcrProofsQuery({ excludeProofIds: [], limit: 20 }),
    )
    const text = query.sql.replaceAll(/\s+/gu, ' ')

    expect(text).toContain(`p."canhoto_review" = 'pending'`)
    expect(text).toContain('p."canhoto_read_source" is null')
    expect(text).toContain('p."canhoto_ocr_attempted_at" is null')
    expect(query.params).toEqual([20])
  })
})
