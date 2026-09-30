/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createListTripOccurrenceFeedUseCase } from '../../src/trips/application/trip-occurrence-feed.use-case.js'
import { readDeliveryProofs } from '../../src/trips/application/read-delivery-proof.use-case.js'
import { createDeliveryProofDownloadGateway } from '../../src/trips/infrastructure/delivery-proof-download.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000011'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000017'

const PROOF = {
  bucket: 'transportada',
  createdAt: '2026-09-02T12:00:00.000Z',
  id: '00000000-0000-4000-8000-0000000000a1',
  kind: 'signature' as const,
  lateRegistration: false,
  mimeType: 'image/png',
  objectKey: 'companies/1/proofs/a1.png',
  /** ADR-0057 §3: o que a linha carrega já é a máscara — a leitura nunca vê o valor em claro. */
  receiverDocumentMasked: '***.938.570-**',
  receiverName: 'Portaria',
  /** Spec 193 D11: o comprovante antigo, sem quem recebeu. */
  receivedBy: null,
  receivedByDetail: null,
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
        lateRegistration: false,
        receiverDocument: '***.938.570-**',
        receiverName: 'Portaria',
        receivedBy: null,
        receivedByDetail: null,
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

  /**
   * Spec 220 RF20/CA06. Spec 161 D14 é o precedente: a miniatura vem ao lado do original, e
   * ausência é campo omitido — nunca `null`, nunca string vazia — para a tela cair no original.
   */
  describe('miniatura do comprovante (spec 220 RF20)', () => {
    const THUMBNAIL = {
      bucket: 'transportada',
      mimeType: 'image/jpeg',
      objectKey: 'companies/1/proofs/a2-thumb.jpg',
    }
    const WITH_THUMBNAIL = {
      ...PROOF,
      id: '00000000-0000-4000-8000-0000000000a2',
      kind: 'cargo' as const,
      objectKey: 'companies/1/proofs/a2.jpg',
      thumbnail: THUMBNAIL,
    }
    const WITHOUT_THUMBNAIL = {
      ...PROOF,
      id: '00000000-0000-4000-8000-0000000000a3',
      kind: 'canhoto' as const,
      objectKey: 'companies/1/proofs/a3.jpg',
      thumbnail: null,
    }

    function countingDownloads() {
      const requestedKeys: string[] = []
      let inFlight = 0
      let maxInFlight = 0
      return {
        get maxInFlight(): number {
          return maxInFlight
        },
        port: {
          async createDownloadUrl(input: { readonly objectKey: string }) {
            requestedKeys.push(input.objectKey)
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await Promise.resolve()
            inFlight -= 1
            return {
              expiresAt: '2026-09-02T12:05:00.000Z',
              url: `https://bucket.example/${input.objectKey}?assinatura=abc`,
            }
          },
        },
        requestedKeys,
      }
    }

    function readProofs(input: {
      readonly downloads: typeof downloads
      readonly proofs: readonly object[]
    }) {
      return readDeliveryProofs({
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        downloads: input.downloads,
        repository: repository(input.proofs as readonly (typeof PROOF)[]).port,
        tripId: TRIP_ID,
      })
    }

    test('com miniatura, thumbnailUrl vem ao lado de downloadUrl, ambas assinadas', async () => {
      const [view] = await readProofs({
        downloads: countingDownloads().port,
        proofs: [WITH_THUMBNAIL],
      })

      expect(view).toMatchObject({
        downloadUrl: 'https://bucket.example/companies/1/proofs/a2.jpg?assinatura=abc',
        thumbnailUrl: 'https://bucket.example/companies/1/proofs/a2-thumb.jpg?assinatura=abc',
      })
      expect(JSON.stringify(view)).not.toInclude('"objectKey"')
      expect(JSON.stringify(view)).not.toInclude('"thumbnail"')
    })

    test('sem miniatura (comprovante antigo, assinatura) o campo é omitido, não nulo', async () => {
      const views = await readProofs({
        downloads: countingDownloads().port,
        proofs: [WITHOUT_THUMBNAIL, { ...PROOF, thumbnail: null }],
      })

      expect(views).toHaveLength(2)
      for (const view of views) {
        expect(view).not.toHaveProperty('thumbnailUrl')
        expect(view.downloadUrl).toStartWith('https://bucket.example/')
      }
    })

    test('registro anterior à coluna (sem o campo thumbnail) também omite', async () => {
      const [view] = await readProofs({ downloads: countingDownloads().port, proofs: [PROOF] })

      expect(view).not.toHaveProperty('thumbnailUrl')
    })

    /** RNF01: nada de chamada extra por imagem, e tudo no mesmo lote — não original e depois miniatura. */
    test('o detalhe assina só o que existe, e tudo de uma vez', async () => {
      const counter = countingDownloads()

      await readProofs({
        downloads: counter.port,
        proofs: [WITH_THUMBNAIL, WITHOUT_THUMBNAIL, { ...WITH_THUMBNAIL, id: 'outro' }],
      })

      expect(counter.requestedKeys).toHaveLength(5)
      expect(counter.maxInFlight).toBe(5)
    })

    test('as duas URLs valem 5 minutos', async () => {
      const signedRequests: number[] = []
      const gateway = createDeliveryProofDownloadGateway({
        now: () => new Date('2026-09-02T12:00:00.000Z'),
        storage: {
          async createSignedDownload(input) {
            signedRequests.push(input.expiresInSeconds)
            return new URL(`https://bucket.example/${input.key}`)
          },
        },
      })

      const [view] = await readProofs({ downloads: gateway, proofs: [WITH_THUMBNAIL] })

      expect(signedRequests).toEqual([300, 300])
      expect(view?.expiresAt).toBe('2026-09-02T12:05:00.000Z')
    })

    /** ⚠️ Assinar por item numa lista é o defeito que RNF01 existe para impedir (161 RF12/RNF2). */
    test('o cursor de listagem não assina URL nenhuma', async () => {
      const locationLookups: object[] = []
      const feed = createListTripOccurrenceFeedUseCase({
        reader: {
          async listAttachmentLocations(input) {
            locationLookups.push(input)
            return []
          },
          async listFeed() {
            return { items: [], nextCursor: 'cursor-2' }
          },
        },
      })

      const page = await feed.execute({
        context: { companyId: COMPANY_ID },
        cursor: 'cursor-1',
        limit: 20,
        order: 'desc',
      })

      expect(page.nextCursor).toBe('cursor-2')
      expect(locationLookups).toEqual([])
      expect(JSON.stringify(page)).not.toInclude('thumbnailUrl')
    })
  })
})
