/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildFieldDeliveryImageWithThumbnail,
  FIELD_DELIVERY_THUMBNAIL_MAX_BYTES,
  FIELD_DELIVERY_THUMBNAIL_MAX_SIDE,
} from '../../src/modules/trip/shared/fieldDeliveryImage.service'
import { createTripClient } from '../../src/modules/trip/shared/tripClient.service'

const API_URL = 'https://api.example.test'
const KIBIBYTE = 1024

function blobOfSize(sizeBytes: number): Blob {
  return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' })
}

describe('miniatura do canhoto no envio pelo escritório (spec 220 T3.4, RF17)', () => {
  test('a régua é a da 161 D12: 320 px e teto duro de 128 KiB', () => {
    expect(FIELD_DELIVERY_THUMBNAIL_MAX_SIDE).toBe(320)
    expect(FIELD_DELIVERY_THUMBNAIL_MAX_BYTES).toBe(128 * KIBIBYTE)
  })

  test('miniatura dentro do teto acompanha o original', async () => {
    const original = blobOfSize(300 * KIBIBYTE)
    const thumbnail = blobOfSize(40 * KIBIBYTE)
    const requestedSides: number[] = []

    const result = await buildFieldDeliveryImageWithThumbnail({
      encodeThumbnail: (maxSide) => {
        requestedSides.push(maxSide)
        return Promise.resolve(thumbnail)
      },
      original,
    })

    expect(requestedSides).toEqual([320])
    expect(result).toEqual({ original, thumbnail })
  })

  test('falha ao gerar a miniatura só envia o original (RF19)', async () => {
    const original = blobOfSize(300 * KIBIBYTE)

    const result = await buildFieldDeliveryImageWithThumbnail({
      encodeThumbnail: () => Promise.reject(new Error('FIELD_DELIVERY_IMAGE_ENCODE_FAILED')),
      original,
    })

    expect(result).toEqual({ original })
  })

  test('miniatura acima de 128 KiB é descartada', async () => {
    const original = blobOfSize(300 * KIBIBYTE)

    const result = await buildFieldDeliveryImageWithThumbnail({
      encodeThumbnail: () => Promise.resolve(blobOfSize(128 * KIBIBYTE + 1)),
      original,
    })

    expect(result).toEqual({ original })
  })

  test('original + miniatura acima de 1000 KiB descarta a miniatura e o original segue', async () => {
    const original = blobOfSize(960 * KIBIBYTE)

    const result = await buildFieldDeliveryImageWithThumbnail({
      encodeThumbnail: () => Promise.resolve(blobOfSize(60 * KIBIBYTE)),
      original,
    })

    expect(result).toEqual({ original })
  })
})

describe('cliente do painel envia o campo thumbnail (spec 220 T3.4)', () => {
  async function recordForms(
    run: (client: ReturnType<typeof createTripClient>) => Promise<unknown>,
  ): Promise<FormData> {
    const requests: Request[] = []
    const client = createTripClient({
      apiUrl: API_URL,
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        const data = request.url.endsWith('/field-delivery')
          ? {
              alreadySettled: false,
              id: 'event-1',
              proofId: 'proof-1',
              stopCompleted: false,
              tripCompleted: false,
            }
          : { id: 'proof-1' }
        return Promise.resolve(Response.json({ data }))
      },
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })
    await run(client)
    const request = requests[0]
    if (request === undefined) throw new Error('REQUEST_MISSING')
    return request.formData()
  }

  const deliveryBase = {
    deliveredAt: '2026-09-18T12:00:00.000Z',
    documentId: 'doc-1',
    idempotencyKey: 'idem-1',
    imageBlob: blobOfSize(10 * KIBIBYTE),
    tripId: 'trip-1',
  } as const

  test('reportFieldDelivery anexa a miniatura quando existe', async () => {
    const form = await recordForms((client) =>
      client.reportFieldDelivery({ ...deliveryBase, thumbnailBlob: blobOfSize(2 * KIBIBYTE) }),
    )
    expect((form.get('thumbnail') as File).size).toBe(2 * KIBIBYTE)
  })

  test('reportFieldDelivery sem miniatura não manda o campo', async () => {
    const form = await recordForms((client) => client.reportFieldDelivery(deliveryBase))
    expect(form.get('thumbnail')).toBeNull()
  })

  test('attachFieldProof anexa a miniatura quando existe, e não manda sem ela', async () => {
    const proofBase = {
      documentId: 'doc-1',
      idempotencyKey: 'idem-2',
      imageBlob: blobOfSize(10 * KIBIBYTE),
      kind: 'cargo',
      tripId: 'trip-1',
    } as const
    const withThumbnail = await recordForms((client) =>
      client.attachFieldProof({ ...proofBase, thumbnailBlob: blobOfSize(2 * KIBIBYTE) }),
    )
    const withoutThumbnail = await recordForms((client) => client.attachFieldProof(proofBase))
    expect((withThumbnail.get('thumbnail') as File).size).toBe(2 * KIBIBYTE)
    expect(withoutThumbnail.get('thumbnail')).toBeNull()
  })
})
