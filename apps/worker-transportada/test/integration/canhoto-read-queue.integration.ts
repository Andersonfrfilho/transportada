/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A fila do robô de canhoto contra Postgres de verdade (spec 222 T6.3, CA20). O índice parcial só é
 * usado se a consulta repetir os literais do predicado, e isso só se prova com o plano.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import {
  buildPendingCanhotoProofsQuery,
  createDrizzleCanhotoReadQueue,
} from '../../src/canhoto-read/infrastructure/drizzle-canhoto-read-queue.repository.js'
import {
  CANHOTO_GRAPH_BUCKET,
  createCanhotoGraph,
  type CanhotoGraph,
  type SeededCanhotoProof,
} from '../fixtures/canhoto-graph.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const KEY_PREFIX = '35240912345678000199550010000'
const keyFor = (suffix: string): string => `${KEY_PREFIX}${suffix}`
const at = (minute: number): string => `2026-10-01T10:${String(minute).padStart(2, '0')}:00.000Z`

describeDatabase('fila de canhotos do robo (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const queue = createDrizzleCanhotoReadQueue(db)
  let graph: CanhotoGraph
  const seeded: SeededCanhotoProof[] = []

  async function seed(minute: number): Promise<SeededCanhotoProof> {
    const proof = await graph.seedProof({
      accessKey: keyFor(String(100000 + minute).padStart(15, '0')),
      createdAt: at(minute),
      noteNumber: String(100000 + minute),
      noteSeries: '1',
    })
    seeded.push(proof)
    return proof
  }

  async function listIds(limit = 100, excludeProofIds: readonly string[] = []): Promise<string[]> {
    const rows = await queue.listPending({ excludeProofIds, limit })
    return rows.filter((row) => row.companyId === graph.companyId).map((row) => row.proofId)
  }

  beforeAll(async () => {
    graph = await createCanhotoGraph(db)
  })

  afterAll(async () => {
    await graph.cleanup()
    await provider.close()
  })

  test('devolve o comprovante pendente com os ids dos joins, o objeto e o tamanho gravado', async () => {
    const proof = await seed(1)

    const rows = await queue.listPending({ excludeProofIds: [], limit: 100 })
    const row = rows.find((candidate) => candidate.proofId === proof.proofId)

    expect(row).toEqual({
      bucket: CANHOTO_GRAPH_BUCKET,
      companyId: graph.companyId,
      documentId: proof.documentId,
      mimeType: 'image/jpeg',
      objectKey: proof.objectKey,
      proofId: proof.proofId,
      sizeBytes: 100,
      tripId: graph.tripId,
    })
  })

  test('ordena por created_at e respeita o teto', async () => {
    const third = await seed(30)
    const second = await seed(20)

    const [first] = seeded

    expect((await listIds()).slice(0, 3)).toEqual([
      first?.proofId ?? '',
      second.proofId,
      third.proofId,
    ])
    expect(await queue.listPending({ excludeProofIds: [], limit: 2 })).toHaveLength(2)
  })

  test('excludeProofIds tira da vista os ja vistos no ciclo', async () => {
    const [first] = seeded
    const ids = await listIds(100, [first?.proofId ?? ''])

    expect(ids).not.toContain(first?.proofId)
    expect(ids).toHaveLength(seeded.length - 1)
  })

  test('nao entram na fila: lido, tentado, nao-canhoto, empresa desativada, viagem cancelada, nota liberada, objeto apagado', async () => {
    const read = await seed(40)
    const attempted = await seed(41)
    const signature = await seed(42)
    const cancelledTrip = await seed(43)
    const released = await seed(44)
    const deletedObject = await seed(45)
    const notPending = await seed(46)

    await db.execute(sql`
      update trip_delivery_proofs
      set canhoto_read_source = 'barcode', canhoto_read_number = '1'
      where id = ${read.proofId}`)
    await db.execute(sql`
      update trip_delivery_proofs set canhoto_read_attempted_at = now() where id = ${attempted.proofId}`)
    await db.execute(sql`
      update trip_delivery_proofs set kind = 'signature', canhoto_review = 'not_applicable'
      where id = ${signature.proofId}`)
    await db.execute(sql`
      update trip_delivery_proofs set canhoto_review = 'not_applicable' where id = ${notPending.proofId}`)
    await db.execute(sql`
      update trip_documents set released_at = now() where id = ${released.documentId}`)
    await db.execute(sql`
      update stored_objects set status = 'deleted', deleted_at = now()
      where id = ${deletedObject.objectId}`)

    const ids = await listIds()
    for (const excluded of [read, attempted, signature, released, deletedObject, notPending]) {
      expect(ids).not.toContain(excluded.proofId)
    }
    expect(ids).toContain(cancelledTrip.proofId)

    await db.execute(sql`update trips set status = 'cancelled' where id = ${graph.tripId}`)
    expect(await listIds()).toEqual([])
    await db.execute(sql`update trips set status = 'on_delivery_route' where id = ${graph.tripId}`)

    await db.execute(sql`update companies set status = 'disabled' where id = ${graph.companyId}`)
    expect(await listIds()).toEqual([])
    await db.execute(sql`update companies set status = 'active' where id = ${graph.companyId}`)
    expect(await listIds()).toContain(cancelledTrip.proofId)
  })

  test('listTripDocuments devolve as notas da viagem com chave, numero, serie e liberacao', async () => {
    const [first] = seeded
    const documents = await queue.listTripDocuments({
      companyId: graph.companyId,
      tripId: graph.tripId,
    })

    expect(documents).toHaveLength(seeded.length)
    expect(documents.find((document) => document.id === first?.documentId)).toEqual({
      accessKey: keyFor('000000000100001'),
      id: first?.documentId ?? '',
      nfeNumber: '100001',
      nfeSeries: '1',
      releasedAt: null,
    })
  })

  test('markAttempted carimba so a coluna do carimbo, uma vez, e so na fila', async () => {
    const proof = await seed(50)
    const attemptedAt = new Date('2026-10-02T12:00:00.000Z')

    expect(
      await queue.markAttempted({
        attemptedAt,
        companyId: graph.companyId,
        proofId: proof.proofId,
      }),
    ).toBe(true)
    const [row] = await db.execute(sql`
      select canhoto_read_attempted_at as attempted, canhoto_review as review,
             canhoto_read_source as source, canhoto_read_number as number
      from trip_delivery_proofs where id = ${proof.proofId}`)
    expect(new Date(String(row?.attempted)).toISOString()).toBe(attemptedAt.toISOString())
    expect(row).toMatchObject({ number: null, review: 'pending', source: null })

    expect(
      await queue.markAttempted({
        attemptedAt,
        companyId: graph.companyId,
        proofId: proof.proofId,
      }),
    ).toBe(false)
    expect(await listIds()).not.toContain(proof.proofId)
  })

  test('markAttempted nao toca em comprovante de outra empresa', async () => {
    const proof = await seed(51)

    expect(
      await queue.markAttempted({
        attemptedAt: new Date(),
        companyId: crypto.randomUUID(),
        proofId: proof.proofId,
      }),
    ).toBe(false)
    expect(await listIds()).toContain(proof.proofId)
  })

  test('o plano da consulta usa o indice parcial (CA20)', async () => {
    const plan = await db.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`)
      const rows = await transaction.execute(
        sql`explain ${buildPendingCanhotoProofsQuery({ excludeProofIds: [], limit: 40 })}`,
      )
      return rows.map((row) => String(row['QUERY PLAN'])).join('\n')
    })

    process.stdout.write(`EXPLAIN (enable_seqscan = off)\n${plan}\n`)
    expect(plan).toContain('Index Scan using trip_delivery_proofs_canhoto_pending_idx')
  })

  /**
   * O EXPLAIN com parâmetro vinculado ainda usa o índice (plano personalizado das primeiras
   * execuções) e vira varredura quando o plano genérico entra: o que prende a regra é a consulta
   * que sai do construtor — literal no texto, nada de `pending` entre os parâmetros.
   */
  test('os tres predicados da fila saem como literal no texto, nunca como parametro', () => {
    const query = new PgDialect().sqlToQuery(
      buildPendingCanhotoProofsQuery({ excludeProofIds: [], limit: 40 }),
    )
    const text = query.sql.replaceAll(/\s+/gu, ' ')

    expect(text).toContain(`p."canhoto_review" = 'pending'`)
    expect(text).toContain('p."canhoto_read_source" is null')
    expect(text).toContain('p."canhoto_read_attempted_at" is null')
    expect(query.params).toEqual([40])
  })
})
