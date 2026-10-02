/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T6.9 (CA10, CA11): um ciclo da rotina sobre doze canhotos pendentes, contra Postgres de
 * verdade — fila, casamento com as notas da viagem e tentativa gravada são os adaptadores reais.
 *
 * ⚠️ O que **não** é real aqui: o veredito. `resolveAutomaticCanhotoReview` mora na API e nenhuma
 * app importa código de outra; o `serverEmulator` abaixo reproduz a regra dela em SQL (casou o
 * documento **e** o número ⇒ `approved`/`automatic`; senão `pending` com a leitura gravada) só para
 * que a rotina tenha um servidor a quem reportar. A regra em si é provada nos testes da API.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { CanhotoBarcodeDecoderPort } from '../../src/canhoto-read/application/canhoto-barcode-decoder.port.js'
import { createCanhotoImageReader } from '../../src/canhoto-read/application/canhoto-image-reader.service.js'
import { createCanhotoReadRoutine } from '../../src/canhoto-read/application/canhoto-read.routine.js'
import type {
  CanhotoReviewApiPort,
  ReportCanhotoReadingParams,
} from '../../src/canhoto-read/application/canhoto-review-api.port.js'
import { createDrizzleCanhotoReadQueue } from '../../src/canhoto-read/infrastructure/drizzle-canhoto-read-queue.repository.js'
import { buildAccessKey } from '../fixtures/canhoto-access-key.fixture.js'
import {
  createCanhotoGraph,
  type CanhotoGraph,
  type SeededCanhotoProof,
} from '../fixtures/canhoto-graph.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-10-02T12:00:00.000Z')
const PROOF_COUNT = 12
const MATCHING_COUNT = 8
const WRONG_NOTE_COUNT = 2
const FIRST_NOTE_NUMBER = 200100
const NOT_ON_TRIP_FIRST_NUMBER = 999100
const at = (minute: number): string => `2026-10-01T10:${String(minute).padStart(2, '0')}:00.000Z`
const noteNumberOf = (index: number): number => FIRST_NOTE_NUMBER + index

type ProofRow = {
  readonly canhoto_read_attempted_at: string | null
  readonly canhoto_read_number: string | null
  readonly canhoto_read_series: string | null
  readonly canhoto_read_source: string | null
  readonly canhoto_review: string
  readonly canhoto_review_origin: string | null
  readonly id: string
}

describeDatabase('ciclo da rotina de canhoto (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  let graph: CanhotoGraph
  const seeded: SeededCanhotoProof[] = []
  const photoTextByObjectKey = new Map<string, string>()
  const downloadedObjectKeys: string[] = []
  const reports: ReportCanhotoReadingParams[] = []

  /** A foto é o próprio texto que a máquina "leria": o decodificador real é prova da T6.4. */
  const decoder: CanhotoBarcodeDecoderPort = {
    decode: async ({ bytes }) => new TextDecoder().decode(bytes),
  }

  const serverEmulator: CanhotoReviewApiPort = {
    report: async (params) => {
      reports.push(params)
      const rows = (await db.execute(sql`
        select p."id" as proof_id, n."number" as note_number
        from trip_delivery_proofs p
        join trip_stop_events e on e."id" = p."stop_event_id"
        join trip_documents d on d."id" = e."trip_document_id"
        join nfe_documents n on n."id" = d."nfe_document_id"
        where d."id" = ${params.documentId}::uuid and p."company_id" = ${params.companyId}::uuid
          and p."kind" = 'photo' and p."canhoto_review" = 'pending'
          and p."canhoto_read_source" is null
      `)) as unknown as readonly { note_number: string; proof_id: string }[]
      const target = rows[0]
      if (target === undefined) return { review: 'unchanged' }

      const reading = params.reading
      const isApproved =
        reading.readSource === 'barcode' &&
        reading.readDocumentId === params.documentId &&
        reading.readNumber === target.note_number
      await db.execute(sql`
        update trip_delivery_proofs
        set "canhoto_read_document_id" = ${reading.readDocumentId}::uuid,
            "canhoto_read_number" = ${reading.readNumber},
            "canhoto_read_series" = ${reading.readSeries},
            "canhoto_read_source" = ${reading.readSource},
            "canhoto_review" = ${isApproved ? 'approved' : 'pending'},
            "canhoto_review_at" = ${isApproved ? NOW.toISOString() : null}::timestamptz,
            "canhoto_review_origin" = ${isApproved ? 'automatic' : null}
        where "id" = ${target.proof_id}::uuid
      `)
      return { review: isApproved ? 'approved' : 'pending' }
    },
  }

  function buildRoutine(): ReturnType<typeof createCanhotoReadRoutine> {
    return createCanhotoReadRoutine({
      errorTracker: { captureException: () => undefined },
      imageReader: createCanhotoImageReader({
        decoder,
        objectReader: {
          read: async ({ key }) => {
            downloadedObjectKeys.push(key)
            const text = photoTextByObjectKey.get(key)
            return text === undefined ? undefined : new TextEncoder().encode(text)
          },
        },
      }),
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      now: () => NOW,
      queue: createDrizzleCanhotoReadQueue(db),
      reviewApi: serverEmulator,
    })
  }

  async function runCycle(): Promise<Readonly<Record<string, number>>> {
    const result = await buildRoutine().run({
      correlationId: 'correlation-integration',
      executionId: 'execution-integration',
      isStopRequested: () => false,
      job: 'trip.canhoto.read',
      origin: 'schedule',
    })
    return result.counters
  }

  async function readProofRows(): Promise<ProofRow[]> {
    const rows = (await db.execute(sql`
      select "id", "canhoto_review", "canhoto_review_origin", "canhoto_read_number",
             "canhoto_read_series", "canhoto_read_source", "canhoto_read_attempted_at"
      from trip_delivery_proofs where "company_id" = ${graph.companyId}::uuid order by "created_at"
    `)) as unknown as ProofRow[]
    return rows
  }

  beforeAll(async () => {
    graph = await createCanhotoGraph(db)
    for (let index = 0; index < PROOF_COUNT; index += 1) {
      const proof = await graph.seedProof({
        accessKey: buildAccessKey({ number: noteNumberOf(index), series: 1 }),
        createdAt: at(index),
        noteNumber: String(noteNumberOf(index)),
        noteSeries: '1',
      })
      seeded.push(proof)
      photoTextByObjectKey.set(proof.objectKey, photoTextFor(index))
    }
  })

  afterAll(async () => {
    await graph.cleanup()
    await provider.close()
  })

  /** 0..7 trazem a chave da própria nota; 8..9, a de outra nota da viagem; 10..11, de nota fora dela. */
  function photoTextFor(index: number): string {
    if (index < MATCHING_COUNT) return buildAccessKey({ number: noteNumberOf(index), series: 1 })
    if (index < MATCHING_COUNT + WRONG_NOTE_COUNT) {
      return buildAccessKey({ number: noteNumberOf(0), series: 1 })
    }
    return buildAccessKey({ number: NOT_ON_TRIP_FIRST_NUMBER + index, series: 1 })
  }

  test('the cycle approves what matches, leaves the rest pending with the number read, rejects none', async () => {
    const counters = await runCycle()

    const rows = await readProofRows()
    expect(rows).toHaveLength(PROOF_COUNT)
    expect(rows.filter((row) => row.canhoto_review === 'rejected')).toHaveLength(0)

    const approved = rows.filter((row) => row.canhoto_review === 'approved')
    expect(approved).toHaveLength(MATCHING_COUNT)
    for (const row of approved) expect(row.canhoto_review_origin).toBe('automatic')

    const pending = rows.filter((row) => row.canhoto_review === 'pending')
    expect(pending).toHaveLength(PROOF_COUNT - MATCHING_COUNT)
    for (const row of pending) {
      expect(row.canhoto_read_number).not.toBeNull()
      expect(row.canhoto_read_source).toBe('barcode')
      expect(row.canhoto_review_origin).toBeNull()
    }
    expect(pending.map((row) => row.canhoto_read_number)).toEqual([
      String(noteNumberOf(0)),
      String(noteNumberOf(0)),
      String(NOT_ON_TRIP_FIRST_NUMBER + 10),
      String(NOT_ON_TRIP_FIRST_NUMBER + 11),
    ])
    expect(counters).toMatchObject({
      approved: MATCHING_COUNT,
      attemptedWithoutCode: 0,
      pending: PROOF_COUNT - MATCHING_COUNT,
      proofsSeen: PROOF_COUNT,
      reported: PROOF_COUNT,
    })
  })

  test('the worker reported the reading only, once per proof, addressed to its own document', async () => {
    expect(reports).toHaveLength(PROOF_COUNT)
    expect(reports.map((report) => report.documentId).sort()).toEqual(
      seeded.map((proof) => proof.documentId).sort(),
    )
    for (const report of reports) {
      expect(Object.keys(report.reading).sort()).toEqual([
        'readDocumentId',
        'readNumber',
        'readSeries',
        'readSource',
      ])
    }
  })

  test('a second cycle touches none of the twelve: no download, no report, no write', async () => {
    const before = await readProofRows()
    const downloadsBefore = downloadedObjectKeys.length
    const reportsBefore = reports.length

    const counters = await runCycle()

    expect(counters['proofsSeen']).toBe(0)
    expect(downloadedObjectKeys).toHaveLength(downloadsBefore)
    expect(reports).toHaveLength(reportsBefore)
    expect(await readProofRows()).toEqual(before)
  })
})
