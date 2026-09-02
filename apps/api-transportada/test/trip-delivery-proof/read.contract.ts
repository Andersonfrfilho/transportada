/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readDeliveryProofs } from '../../src/trips/application/read-delivery-proof.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000011'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000017'

const PROOF = {
  bucket: 'transportada',
  createdAt: '2026-09-02T12:00:00.000Z',
  id: '00000000-0000-4000-8000-0000000000a1',
  kind: 'signature' as const,
  mimeType: 'image/png',
  objectKey: 'companies/1/proofs/a1.png',
  receiverName: 'Portaria',
}

function repository(proofs: readonly (typeof PROOF)[] = [PROOF]) {
  const calls: object[] = []
  return {
    calls,
    port: {
      async listDeliveryProofs(input: object) {
        calls.push(input)
        return proofs
      },
    },
  }
}

const downloads = {
  async createDownloadUrl(input: { readonly objectKey: string }) {
    return {
      expiresAt: '2026-09-02T12:05:00.000Z',
      url: `https://bucket.example/${input.objectKey}?assinatura=abc`,
    }
  },
}

describe('read delivery proofs contract', () => {
  test('a consulta é sempre escopada pela empresa do contexto', async () => {
    const { calls, port } = repository()

    await readDeliveryProofs({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      downloads,
      repository: port,
      tripId: TRIP_ID,
    })

    expect(calls).toEqual([{ companyId: COMPANY_ID, documentId: DOCUMENT_ID, tripId: TRIP_ID }])
  })

  /**
   * ⚠️ **Nenhum link permanente no corpo.** A URL é assinada e expira; publicar a chave do objeto
   * ou uma URL de bucket sem prazo faria o comprovante — foto de canhoto com nome de quem recebeu —
   * circular fora de qualquer autorização, para sempre, por quem tivesse recebido o JSON uma vez.
   */
  test('devolve URL assinada com prazo, e nunca a chave do objeto', async () => {
    const proofs = await readDeliveryProofs({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      downloads,
      repository: repository().port,
      tripId: TRIP_ID,
    })

    expect(proofs).toEqual([
      {
        createdAt: PROOF.createdAt,
        downloadUrl: 'https://bucket.example/companies/1/proofs/a1.png?assinatura=abc',
        expiresAt: '2026-09-02T12:05:00.000Z',
        id: PROOF.id,
        kind: 'signature',
        receiverName: 'Portaria',
      },
    ])
    expect(JSON.stringify(proofs)).not.toInclude('"objectKey"')
    expect(JSON.stringify(proofs)).not.toInclude('"bucket"')
  })

  /** Entrega sem comprovante é lista vazia — nunca se confunde com "não entregue". */
  test('entrega sem comprovante devolve lista vazia', async () => {
    expect(
      await readDeliveryProofs({
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        downloads,
        repository: repository([]).port,
        tripId: TRIP_ID,
      }),
    ).toEqual([])
  })
})
