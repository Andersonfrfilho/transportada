/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T1.2/T1.4: a leitura dos comprovantes **da viagem**, ao lado da leitura de uma nota.
 * O que ela promete: a mesma serialização do `GET .../documents/:documentId/proof` mais o
 * `documentId`, e a consulta escopada por empresa e viagem — nunca por payload.
 */
import { describe, expect, test } from 'bun:test'

import {
  readDeliveryProofs,
  readDeliveryProofsByTrip,
  type TripDeliveryProofRecord,
} from '../../src/trips/application/read-delivery-proof.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000011'
const FIRST_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'
const SECOND_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d2'

const BASE_RECORD = {
  bucket: 'transportada',
  createdAt: '2026-09-25T12:00:00.000Z',
  kind: 'photo' as const,
  lateRegistration: false,
  mimeType: 'image/jpeg',
  receiverDocumentMasked: '***.938.570-**',
  receiverName: 'Maria',
  receivedBy: null,
  receivedByDetail: null,
}

const FIRST: TripDeliveryProofRecord = {
  ...BASE_RECORD,
  canhotoReadNumber: '12345',
  canhotoReadSource: 'barcode',
  canhotoReview: 'pending',
  documentId: FIRST_DOCUMENT_ID,
  id: '00000000-0000-4000-8000-0000000000a1',
  objectKey: 'companies/1/proofs/a1.jpg',
  thumbnail: {
    bucket: 'transportada',
    mimeType: 'image/jpeg',
    objectKey: 'companies/1/proofs/a1-thumb.jpg',
  },
}

const SECOND: TripDeliveryProofRecord = {
  ...BASE_RECORD,
  documentId: SECOND_DOCUMENT_ID,
  id: '00000000-0000-4000-8000-0000000000a2',
  objectKey: 'companies/1/proofs/a2.jpg',
  thumbnail: null,
}

function repository(records: readonly TripDeliveryProofRecord[]) {
  const calls: object[] = []
  return {
    calls,
    port: {
      async findByTrip(input: object) {
        calls.push(input)
        return records
      },
    },
  }
}

const signedRequests: string[] = []
const downloads = {
  async createDownloadUrl(input: { readonly objectKey: string }) {
    signedRequests.push(input.objectKey)
    return {
      expiresAt: '2026-09-25T12:05:00.000Z',
      url: `https://bucket.example/${input.objectKey}?assinatura=abc`,
    }
  },
}

async function readSingle(record: TripDeliveryProofRecord, documentId: string) {
  const [view] = await readDeliveryProofs({
    companyId: COMPANY_ID,
    documentId,
    downloads,
    repository: { listDeliveryProofs: async () => [record] },
    tripId: TRIP_ID,
  })
  if (view === undefined) throw new Error('a leitura de uma nota não devolveu o comprovante')
  return view
}

describe('readDeliveryProofsByTrip (spec 222 T1.4)', () => {
  test('a consulta é escopada pela empresa e pela viagem recebidas, e leva o filtro de notas', async () => {
    const { calls, port } = repository([])

    await readDeliveryProofsByTrip({
      companyId: COMPANY_ID,
      documentIds: [FIRST_DOCUMENT_ID],
      downloads,
      repository: port,
      tripId: TRIP_ID,
    })

    expect(calls).toEqual([
      { companyId: COMPANY_ID, documentIds: [FIRST_DOCUMENT_ID], tripId: TRIP_ID },
    ])
  })

  test('sem filtro a consulta não leva documentIds', async () => {
    const { calls, port } = repository([])

    await readDeliveryProofsByTrip({
      companyId: COMPANY_ID,
      downloads,
      repository: port,
      tripId: TRIP_ID,
    })

    expect(calls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
  })

  test('cada item carrega o documentId da nota a que o comprovante pertence, na ordem da consulta', async () => {
    const { port } = repository([FIRST, SECOND])

    const views = await readDeliveryProofsByTrip({
      companyId: COMPANY_ID,
      downloads,
      repository: port,
      tripId: TRIP_ID,
    })

    expect(views.map((view) => [view.documentId, view.id])).toEqual([
      [FIRST_DOCUMENT_ID, FIRST.id],
      [SECOND_DOCUMENT_ID, SECOND.id],
    ])
  })

  test('a serialização é a da leitura de uma nota, mais o documentId', async () => {
    const { port } = repository([FIRST, SECOND])
    const singleFirst = await readSingle(FIRST, FIRST_DOCUMENT_ID)
    const singleSecond = await readSingle(SECOND, SECOND_DOCUMENT_ID)

    const views = await readDeliveryProofsByTrip({
      companyId: COMPANY_ID,
      downloads,
      repository: port,
      tripId: TRIP_ID,
    })

    expect(views).toEqual([
      { ...singleFirst, documentId: FIRST_DOCUMENT_ID },
      { ...singleSecond, documentId: SECOND_DOCUMENT_ID },
    ])
  })

  test('assina o original e a miniatura (HMAC local, ADR da T1.1) e só a miniatura que existe', async () => {
    signedRequests.length = 0
    const { port } = repository([FIRST, SECOND])

    const [first, second] = await readDeliveryProofsByTrip({
      companyId: COMPANY_ID,
      downloads,
      repository: port,
      tripId: TRIP_ID,
    })

    expect(first?.downloadUrl).toContain('a1.jpg?assinatura=')
    expect(first?.thumbnailUrl).toContain('a1-thumb.jpg?assinatura=')
    expect(second?.downloadUrl).toContain('a2.jpg?assinatura=')
    expect(second).not.toHaveProperty('thumbnailUrl')
    expect([...signedRequests].sort()).toEqual([
      'companies/1/proofs/a1-thumb.jpg',
      'companies/1/proofs/a1.jpg',
      'companies/1/proofs/a2.jpg',
    ])
  })

  test('nenhum link permanente no corpo: sem bucket, sem chave de objeto', async () => {
    const { port } = repository([FIRST])

    const views = await readDeliveryProofsByTrip({
      companyId: COMPANY_ID,
      downloads,
      repository: port,
      tripId: TRIP_ID,
    })

    const body = JSON.stringify(views)
    expect(body).not.toContain('"bucket"')
    expect(body).not.toContain('"objectKey"')
    expect(body).not.toContain('transportada"')
  })

  test('viagem sem comprovante é lista vazia, nunca erro', async () => {
    const { port } = repository([])

    const views = await readDeliveryProofsByTrip({
      companyId: COMPANY_ID,
      downloads,
      repository: port,
      tripId: TRIP_ID,
    })

    expect(views).toEqual([])
  })
})
