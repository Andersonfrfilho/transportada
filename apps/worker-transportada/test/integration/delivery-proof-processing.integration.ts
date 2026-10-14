/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T006/T007/T008/T011 contra Postgres de verdade (com as migrations da API) e o dublê em
 * memória do storage: o repositório, o outbox e a fila do canhoto são os adaptadores reais; a imagem
 * passa pela thread real. O que **não** é real: o broker (a mensagem é entregue à mão) e a rota do
 * robô (um emulador registra o que o worker reportaria).
 */
import { createHash } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createDrizzleCanhotoReadQueue } from '../../src/canhoto-read/infrastructure/drizzle-canhoto-read-queue.repository.js'
import type { ReportCanhotoReadingParams } from '../../src/canhoto-read/application/canhoto-review-api.port.js'
import { DeliveryProofOutboxRelayService } from '../../src/delivery-proof-processing/application/delivery-proof-outbox-relay.service.js'
import {
  processDeliveryProof,
  type ProcessDeliveryProofDependencies,
} from '../../src/delivery-proof-processing/application/process-delivery-proof.use-case.js'
import { PROOF_REDUCED_MAX_BYTES } from '../../src/delivery-proof-processing/domain/delivery-proof-processing.constant.js'
import { DrizzleDeliveryProofOutboxRepository } from '../../src/delivery-proof-processing/infrastructure/drizzle-delivery-proof-outbox.repository.js'
import { createDrizzleDeliveryProofProcessingRepository } from '../../src/delivery-proof-processing/infrastructure/drizzle-delivery-proof-processing.repository.js'
import { deliveryProofOutbox } from '../../src/database/delivery-proof-processing.schema.js'
import { createStorageDeliveryProofObjectGateway } from '../../src/delivery-proof-processing/infrastructure/storage-delivery-proof-object.gateway.js'
import { createThreadedDeliveryProofImageProcessor } from '../../src/delivery-proof-processing/infrastructure/threaded-delivery-proof-image.processor.js'
import { DELIVERY_PROOF_PROCESSING_EVENT_TYPE } from '../../src/delivery-proof-processing/domain/delivery-proof-processing.constant.js'
import type { DeliveryProofProcessingEnvelopeV1 } from '../../src/messaging/delivery-proof-processing-envelope.schema.js'
import { createNfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { buildAccessKey } from '../fixtures/canhoto-access-key.fixture.js'
import {
  CANHOTO_GRAPH_BUCKET,
  createCanhotoGraph,
  type CanhotoGraph,
  type SeededCanhotoProof,
} from '../fixtures/canhoto-graph.fixture.js'
import {
  buildLargeCameraPhoto,
  CANHOTO_PHOTO_ACCESS_KEY,
} from '../fixtures/delivery-proof-photo.fixture.js'
import { createInMemoryObjectStorageProvider } from '../fixtures/in-memory-object-storage.fixture.js'
import { createRecordingLogger } from '../fixtures/delivery-proof-processing-doubles.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const SLOW_MILLISECONDS = 180_000
const NOTE_NUMBER = 7001
const AT = '2026-10-14T10:00:00.000Z'

type ProofRow = {
  readonly canhoto_read_attempted_at: string | null
  readonly object_id: string
  readonly original_object_id: string | null
  readonly processing_error: string | null
  readonly processing_state: string | null
  readonly thumbnail_object_id: string | null
}

type ObjectRow = {
  readonly deleted_at: string | null
  readonly mime_type: string
  readonly object_key: string
  readonly purpose: string
  readonly sha256: string
  readonly size_bytes: string
  readonly status: string
}

describeDatabase('tratamento do comprovante contra o banco (spec 265)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const storageProvider = createInMemoryObjectStorageProvider({
    maxObjectSizeBytes: 64 * 1024 * 1024,
  })
  const gateway = createNfeStorageGateway({ provider: storageProvider })
  const reports: ReportCanhotoReadingParams[] = []
  let graph: CanhotoGraph
  let originalPhoto: Uint8Array
  let sequence = 0

  function dependencies(): ProcessDeliveryProofDependencies {
    const { logger } = createRecordingLogger()
    return {
      barcode: {
        queue: createDrizzleCanhotoReadQueue(db),
        reviewApi: {
          report: async (params) => {
            reports.push(params)
            return { review: 'approved' }
          },
        },
      },
      image: createThreadedDeliveryProofImageProcessor(),
      logger,
      newObjectId: () => crypto.randomUUID(),
      now: () => new Date(AT),
      objects: createStorageDeliveryProofObjectGateway({ storage: gateway }),
      repository: createDrizzleDeliveryProofProcessingRepository(db),
    }
  }

  async function seed(
    input: {
      readonly bytes: Uint8Array
      /** A nota da parada é a que o código de barras da foto fabricada aponta. */
      readonly matchesBarcode?: boolean
      readonly state?: 'processing_failed' | 'ready' | 'received'
    } = { bytes: originalPhoto },
  ): Promise<SeededCanhotoProof> {
    sequence += 1
    const matches = input.matchesBarcode === true
    const proof = await graph.seedProof({
      accessKey: matches
        ? CANHOTO_PHOTO_ACCESS_KEY
        : buildAccessKey({ number: NOTE_NUMBER + sequence, series: 1 }),
      createdAt: AT,
      noteNumber: matches ? '12345' : String(NOTE_NUMBER + sequence),
      noteSeries: '1',
      original: true,
      processingState: input.state ?? 'received',
      sizeBytes: input.bytes.byteLength,
    })
    await db.execute(sql`
      update stored_objects set bucket = ${CANHOTO_GRAPH_BUCKET},
        sha256 = ${createHash('sha256').update(input.bytes).digest('hex')}
      where id = ${proof.objectId}::uuid
    `)
    await gateway.storeObject({
      body: input.bytes,
      bucket: CANHOTO_GRAPH_BUCKET,
      contentLength: input.bytes.byteLength,
      contentType: 'image/jpeg',
      key: proof.objectKey,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
    })
    return proof
  }

  function envelopeFor(
    proof: SeededCanhotoProof,
    objectKey?: string,
  ): DeliveryProofProcessingEnvelopeV1 {
    return {
      companyId: graph.companyId,
      correlationId: 'correlation-265',
      eventId: crypto.randomUUID(),
      occurredAt: AT,
      payload: {
        attachmentKey: 'attachment-1',
        objectKey: objectKey ?? proof.objectKey,
        proofId: proof.proofId,
        variant: 'original',
      },
      type: DELIVERY_PROOF_PROCESSING_EVENT_TYPE.REQUESTED,
      version: 1,
    }
  }

  async function proofRow(proofId: string): Promise<ProofRow> {
    const rows = (await db.execute(sql`
      select object_id, original_object_id, processing_state, processing_error,
        thumbnail_object_id, canhoto_read_attempted_at
      from trip_delivery_proofs where id = ${proofId}::uuid
    `)) as unknown as readonly ProofRow[]
    const [row] = rows
    if (row === undefined) throw new Error('proof not found')
    return row
  }

  async function objectRow(objectId: string): Promise<ObjectRow> {
    const rows = (await db.execute(sql`
      select status, deleted_at, mime_type, object_key, purpose, sha256, size_bytes
      from stored_objects where id = ${objectId}::uuid
    `)) as unknown as readonly ObjectRow[]
    const [row] = rows
    if (row === undefined) throw new Error('object not found')
    return row
  }

  async function objectCount(): Promise<number> {
    const rows = (await db.execute(sql`
      select count(*)::int as total from stored_objects where company_id = ${graph.companyId}::uuid
    `)) as unknown as readonly { total: number }[]
    return rows[0]?.total ?? 0
  }

  async function readObject(key: string): Promise<Uint8Array | undefined> {
    return createStorageDeliveryProofObjectGateway({ storage: gateway }).read({
      bucket: CANHOTO_GRAPH_BUCKET,
      key,
    })
  }

  beforeAll(async () => {
    graph = await createCanhotoGraph(db)
    originalPhoto = await buildLargeCameraPhoto()
  }, SLOW_MILLISECONDS)

  afterAll(async () => {
    await db.execute(
      sql`delete from delivery_proof_outbox where company_id = ${graph.companyId}::uuid`,
    )
    await graph.cleanup()
    await provider.close()
  })

  test(
    'original de 12 MP: vira versão ≤ 960 KiB com miniatura, a leitura é reportada e o original sai (ready)',
    async () => {
      const proof = await seed({ bytes: originalPhoto, matchesBarcode: true })
      expect(originalPhoto.byteLength).toBeGreaterThan(1024 * 1024)

      const result = await processDeliveryProof(envelopeFor(proof), dependencies())

      expect(result.outcome).toBe('ready')
      expect(result.barcode).toBe('reported')
      const row = await proofRow(proof.proofId)
      expect(row.processing_state).toBe('ready')
      expect(row.processing_error).toBeNull()
      expect(row.original_object_id).toBeNull()
      expect(row.object_id).not.toBe(proof.objectId)
      expect(row.thumbnail_object_id).not.toBeNull()

      const reduced = await objectRow(row.object_id)
      expect(reduced).toMatchObject({
        mime_type: 'image/jpeg',
        purpose: 'delivery_proof',
        status: 'final',
      })
      expect(Number(reduced.size_bytes)).toBeLessThanOrEqual(PROOF_REDUCED_MAX_BYTES)
      const reducedBytes = await readObject(reduced.object_key)
      expect(reducedBytes?.byteLength).toBe(Number(reduced.size_bytes))
      expect(
        createHash('sha256')
          .update(reducedBytes ?? new Uint8Array())
          .digest('hex'),
      ).toBe(reduced.sha256)

      const thumbnail = await objectRow(row.thumbnail_object_id ?? '')
      expect(thumbnail).toMatchObject({ purpose: 'trip_delivery_proof_thumbnail', status: 'final' })
      expect(Number(thumbnail.size_bytes)).toBeLessThanOrEqual(128 * 1024)

      // RF8: o original saiu do storage e a linha de objeto ficou `deleted`, com `deleted_at`.
      const original = await objectRow(proof.objectId)
      expect(original.status).toBe('deleted')
      expect(original.deleted_at).not.toBeNull()
      expect(await readObject(proof.objectKey)).toBeUndefined()

      // A leitura foi reportada pela rota do robô, com a nota da parada.
      expect(reports.at(-1)).toMatchObject({
        companyId: graph.companyId,
        documentId: proof.documentId,
        reading: {
          readDocumentId: proof.documentId,
          readNumber: '12345',
          readSeries: '1',
          readSource: 'barcode',
        },
        tripId: graph.tripId,
      })
    },
    SLOW_MILLISECONDS,
  )

  test(
    'reentrega de comprovante ready é no-op: nenhum objeto novo, nenhuma leitura nova',
    async () => {
      const proof = await seed()
      await processDeliveryProof(envelopeFor(proof), dependencies())
      const objects = await objectCount()
      const reported = reports.length

      const again = await processDeliveryProof(envelopeFor(proof), dependencies())

      expect(again.outcome).toBe('already_ready')
      expect(await objectCount()).toBe(objects)
      expect(reports.length).toBe(reported)
    },
    SLOW_MILLISECONDS,
  )

  test(
    'arquivo que não é imagem: processing_failed só com o código, o original e a referência ficam',
    async () => {
      const garbage = new Uint8Array(200_000).fill(7)
      const proof = await seed({ bytes: garbage })

      const result = await processDeliveryProof(envelopeFor(proof), dependencies())

      expect(result).toMatchObject({ errorCode: 'IMAGE_UNREADABLE', outcome: 'failed' })
      const row = await proofRow(proof.proofId)
      expect(row.processing_state).toBe('processing_failed')
      expect(row.processing_error).toBe('IMAGE_UNREADABLE')
      expect(row.original_object_id).toBe(proof.objectId)
      expect(row.object_id).toBe(proof.objectId)
      expect((await objectRow(proof.objectId)).status).toBe('final')
      expect((await readObject(proof.objectKey))?.byteLength).toBe(garbage.byteLength)
    },
    SLOW_MILLISECONDS,
  )

  test(
    'evento velho (recaptura) não toca em nada',
    async () => {
      const proof = await seed({ bytes: new Uint8Array(50_000).fill(1) })
      const objects = await objectCount()

      const result = await processDeliveryProof(
        envelopeFor(proof, `${proof.objectKey}-antigo`),
        dependencies(),
      )

      expect(result.outcome).toBe('stale')
      expect((await proofRow(proof.proofId)).processing_state).toBe('received')
      expect(await objectCount()).toBe(objects)
    },
    SLOW_MILLISECONDS,
  )

  test(
    'a troca que perde a corrida desfaz as linhas de objeto na mesma transação',
    async () => {
      const proof = await seed({ bytes: new Uint8Array(50_000).fill(1) })
      const repository = createDrizzleDeliveryProofProcessingRepository(db)
      const reduced = {
        bucket: CANHOTO_GRAPH_BUCKET,
        mimeType: 'image/jpeg',
        objectId: crypto.randomUUID(),
        objectKey: `proof/${crypto.randomUUID()}`,
        purpose: 'delivery_proof',
        sha256: '0'.repeat(64),
        sizeBytes: 10,
      }
      const objects = await objectCount()

      // `received` não é `processing`: a guarda do estado recusa a troca.
      const swapped = await repository.swapToReduced({
        companyId: graph.companyId,
        originalObjectId: proof.objectId,
        proofId: proof.proofId,
        reduced,
        thumbnail: null,
      })

      expect(swapped).toBe(false)
      expect(await objectCount()).toBe(objects)
      expect((await proofRow(proof.proofId)).object_id).toBe(proof.objectId)
    },
    SLOW_MILLISECONDS,
  )

  test(
    'T008: a fila da rotina espera received/processing, lê o objeto leve do ready e o original do processing_failed',
    async () => {
      const bytes = new Uint8Array(1_000).fill(2)
      const received = await seed({ bytes })
      const failed = await seed({ bytes, state: 'processing_failed' })
      const ready = await graph.seedProof({
        accessKey: buildAccessKey({ number: NOTE_NUMBER + 500, series: 1 }),
        createdAt: AT,
        noteNumber: String(NOTE_NUMBER + 500),
        noteSeries: '1',
        processingState: 'ready',
      })

      const listed = await createDrizzleCanhotoReadQueue(db).listPending({
        excludeProofIds: [],
        limit: 100,
      })
      const byProof = new Map(listed.map((entry) => [entry.proofId, entry]))

      expect(byProof.has(received.proofId)).toBe(false)
      expect(byProof.get(failed.proofId)?.objectKey).toBe(failed.objectKey)
      expect(byProof.get(ready.proofId)?.objectKey).toBe(ready.objectKey)
    },
    SLOW_MILLISECONDS,
  )

  test(
    'o outbox da API é reivindicado, publicado como envelope válido e marcado',
    async () => {
      const proof = await seed({ bytes: new Uint8Array(1_000).fill(3) })
      const eventId = crypto.randomUUID()
      await db.insert(deliveryProofOutbox).values({
        companyId: graph.companyId,
        correlationId: 'correlation-265',
        eventId,
        eventType: 'delivery-proof.processing.requested',
        payload: {
          attachmentKey: 'attachment-1',
          companyId: graph.companyId,
          objectKey: proof.objectKey,
          proofId: proof.proofId,
          variant: 'original',
        },
        proofId: proof.proofId,
      })
      const published: DeliveryProofProcessingEnvelopeV1[] = []
      const relay = new DeliveryProofOutboxRelayService({
        clock: { now: () => new Date() },
        publisher: {
          async publish({ envelope }) {
            published.push(envelope)
          },
        },
        repository: new DrizzleDeliveryProofOutboxRepository(db),
        retryPolicy: {
          classify(error: unknown): never {
            throw error
          },
        },
      })

      const first = await relay.relayDueEntries({
        claimOwner: 'relay-a',
        leaseMs: 30_000,
        limit: 25,
      })
      const second = await relay.relayDueEntries({
        claimOwner: 'relay-a',
        leaseMs: 30_000,
        limit: 25,
      })

      expect(first.publishedCount).toBeGreaterThanOrEqual(1)
      const mine = published.filter((envelope) => envelope.eventId === eventId)
      expect(mine).toHaveLength(1)
      expect(mine[0]?.payload).toEqual({
        attachmentKey: 'attachment-1',
        objectKey: proof.objectKey,
        proofId: proof.proofId,
        variant: 'original',
      })
      expect(second.publishedCount).toBe(0)
      const rows = (await db.execute(sql`
        select published_at from delivery_proof_outbox where event_id = ${eventId}::uuid
      `)) as unknown as readonly { published_at: string | null }[]
      expect(rows[0]?.published_at).not.toBeNull()
    },
    SLOW_MILLISECONDS,
  )
})
