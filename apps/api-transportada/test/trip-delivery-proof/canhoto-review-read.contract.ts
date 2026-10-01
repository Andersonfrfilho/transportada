/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF24 (T7.3): o `GET .../proof` publica o veredito da conferência do canhoto. Sem isto
 * a Fase 6 grava o veredito e ele some no F5 — a mesma má medida que a Fase 4 já corrigiu.
 */
import { describe, expect, test } from 'bun:test'

import {
  readDeliveryProofs,
  type DeliveryProofRecord,
} from '../../src/trips/application/read-delivery-proof.use-case.js'

const SOURCE_ROOT = new URL('../../src/', import.meta.url)

const BASE_RECORD: DeliveryProofRecord = {
  bucket: 'transportada',
  createdAt: '2026-09-25T12:00:00.000Z',
  id: '00000000-0000-4000-8000-0000000000a1',
  kind: 'photo',
  lateRegistration: false,
  mimeType: 'image/jpeg',
  objectKey: 'companies/1/proofs/a1.jpg',
  receiverDocumentMasked: '',
  receiverName: 'Maria',
  receivedBy: null,
  receivedByDetail: null,
}

const CANHOTO_KEYS = [
  'canhotoReadNumber',
  'canhotoReadSeries',
  'canhotoReadSource',
  'canhotoReview',
  'canhotoReviewAt',
  'canhotoReviewByName',
  'canhotoReviewNote',
  'canhotoReviewOrigin',
  'canhotoReviewReason',
]

async function publish(record: DeliveryProofRecord): Promise<Record<string, unknown>> {
  const [view] = await readDeliveryProofs({
    companyId: 'company',
    documentId: 'document',
    downloads: {
      createDownloadUrl: async () => ({ expiresAt: BASE_RECORD.createdAt, url: 'https://signed' }),
    },
    repository: { listDeliveryProofs: async () => [record] },
    tripId: 'trip',
  })
  return { ...view }
}

function canhotoFields(view: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(view).filter(([key]) => key.startsWith('canhoto')))
}

describe('a leitura do comprovante publica a conferência do canhoto (spec 220 RF24)', () => {
  test('veredito humano aprovado leva o nome de quem conferiu e quando', async () => {
    const view = await publish({
      ...BASE_RECORD,
      canhotoReadNumber: '000009000',
      canhotoReadSeries: '001',
      canhotoReadSource: 'ocr',
      canhotoReview: 'approved',
      canhotoReviewAt: '2026-09-26T10:00:00.000Z',
      canhotoReviewByName: 'Ana Souza',
      canhotoReviewNote: null,
      canhotoReviewOrigin: 'manual',
      canhotoReviewReason: null,
    })

    expect(canhotoFields(view)).toEqual({
      canhotoReadNumber: '000009000',
      canhotoReadSeries: '001',
      canhotoReadSource: 'ocr',
      canhotoReview: 'approved',
      canhotoReviewAt: '2026-09-26T10:00:00.000Z',
      canhotoReviewByName: 'Ana Souza',
      canhotoReviewOrigin: 'manual',
    })
  })

  test('veredito automático aprovado não tem nome: a chave some, não vira null', async () => {
    const view = await publish({
      ...BASE_RECORD,
      canhotoReadNumber: '000009000',
      canhotoReadSeries: '001',
      canhotoReadSource: 'barcode',
      canhotoReview: 'approved',
      canhotoReviewAt: '2026-09-26T10:00:00.000Z',
      canhotoReviewByName: null,
      canhotoReviewOrigin: 'automatic',
    })

    expect(canhotoFields(view)).toEqual({
      canhotoReadNumber: '000009000',
      canhotoReadSeries: '001',
      canhotoReadSource: 'barcode',
      canhotoReview: 'approved',
      canhotoReviewAt: '2026-09-26T10:00:00.000Z',
      canhotoReviewOrigin: 'automatic',
    })
    expect('canhotoReviewByName' in view).toBe(false)
  })

  test('pendente com leitura publica a leitura e nada de veredito', async () => {
    const view = await publish({
      ...BASE_RECORD,
      canhotoReadNumber: '000009000',
      canhotoReadSeries: null,
      canhotoReadSource: 'ocr',
      canhotoReview: 'pending',
      canhotoReviewAt: null,
      canhotoReviewByName: null,
      canhotoReviewOrigin: null,
    })

    expect(canhotoFields(view)).toEqual({
      canhotoReadNumber: '000009000',
      canhotoReadSource: 'ocr',
      canhotoReview: 'pending',
    })
  })

  test('pendente sem leitura publica só o estado', async () => {
    const view = await publish({
      ...BASE_RECORD,
      canhotoReadNumber: null,
      canhotoReadSeries: null,
      canhotoReadSource: null,
      canhotoReview: 'pending',
    })

    expect(canhotoFields(view)).toEqual({ canhotoReview: 'pending' })
  })

  test('recusado leva motivo e nota, com o nome de quem recusou', async () => {
    const view = await publish({
      ...BASE_RECORD,
      canhotoReview: 'rejected',
      canhotoReviewAt: '2026-09-26T11:00:00.000Z',
      canhotoReviewByName: 'Ana Souza',
      canhotoReviewNote: 'Carimbo de outra loja',
      canhotoReviewOrigin: 'manual',
      canhotoReviewReason: 'other',
    })

    expect(canhotoFields(view)).toEqual({
      canhotoReview: 'rejected',
      canhotoReviewAt: '2026-09-26T11:00:00.000Z',
      canhotoReviewByName: 'Ana Souza',
      canhotoReviewNote: 'Carimbo de outra loja',
      canhotoReviewOrigin: 'manual',
      canhotoReviewReason: 'other',
    })
  })

  test('not_applicable (assinatura e foto da mercadoria) não publica nada', async () => {
    for (const kind of ['signature', 'cargo'] as const) {
      const view = await publish({
        ...BASE_RECORD,
        canhotoReadNumber: null,
        canhotoReadSeries: null,
        canhotoReadSource: null,
        canhotoReview: 'not_applicable',
        canhotoReviewAt: null,
        canhotoReviewByName: null,
        canhotoReviewNote: null,
        canhotoReviewOrigin: null,
        canhotoReviewReason: null,
        kind,
      })

      expect(canhotoFields(view)).toEqual({})
    }
  })

  test('comprovante antigo, sem nenhum dos campos, sai sem nenhuma chave de conferência', async () => {
    const view = await publish(BASE_RECORD)

    expect(Object.keys(view).filter((key) => CANHOTO_KEYS.includes(key))).toEqual([])
  })

  test('nunca publica quem conferiu por id nem o documento de onde a leitura veio', async () => {
    const view = await publish({
      ...BASE_RECORD,
      canhotoReadDocumentId: '00000000-0000-4000-8000-0000000000d1',
      canhotoReadSource: 'barcode',
      canhotoReview: 'approved',
      canhotoReviewByName: 'Ana Souza',
      canhotoReviewByUserId: '00000000-0000-4000-8000-0000000000e1',
      canhotoReviewOrigin: 'manual',
    } as DeliveryProofRecord)

    expect(JSON.stringify(view)).not.toContain('00000000-0000-4000-8000-0000000000d1')
    expect(JSON.stringify(view)).not.toContain('00000000-0000-4000-8000-0000000000e1')
    expect('canhotoReviewByUserId' in view).toBe(false)
    expect('canhotoReadDocumentId' in view).toBe(false)
  })
})

describe('a consulta resolve o nome de quem conferiu sem consulta nova (spec 220 T7.4)', () => {
  test('a leitura entra na mesma query, com o nome vindo de junção escopada pela empresa', async () => {
    const source = await Bun.file(
      new URL('trips/infrastructure/delivery-proof-read.support.ts', SOURCE_ROOT),
    ).text()
    const start = source.indexOf('export async function listDeliveryProofs')
    const end = source.indexOf('function measureProofDistance')
    const query = source.slice(start, end)

    expect(query).toContain('canhotoReview: tripDeliveryProofs.canhotoReview')
    expect(query).toContain('canhotoReviewByName: canhotoReviewerProfile.name')
    expect(query).toContain('eq(canhotoReviewerMembership.companyId, tripDeliveryProofs.companyId)')
    expect(query).toContain(
      'eq(canhotoReviewerMembership.userId, tripDeliveryProofs.canhotoReviewByUserId)',
    )
    expect(query.match(/\.select\(/gu)).toHaveLength(1)
    expect(query).not.toContain('canhotoReviewByUserId:')
    expect(query).not.toContain('canhotoReadDocumentId:')
  })
})
