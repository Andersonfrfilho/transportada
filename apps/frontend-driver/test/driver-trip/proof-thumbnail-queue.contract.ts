/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createDriverTripClient } from '@/modules/driver-trip/shared/driverTripClient.service'
import type { QueuedAttachment } from '@/modules/driver-trip/shared/offlineAttachments.service'
import {
  buildProofPhotoWithThumbnail,
  replaceAttachmentBlob,
} from '@/modules/driver-trip/shared/proofPhotoReduction.service'

const KIB = 1024

function blobOfSize(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
}

function queuedPhoto(extra: Partial<QueuedAttachment> = {}): QueuedAttachment {
  return {
    attachmentKey: 'key-1',
    attempts: 0,
    blob: blobOfSize(3000 * KIB),
    capturedAt: '2026-09-30T12:00:00.000Z',
    documentId: 'document-1',
    fileName: 'canhoto.jpg',
    kind: 'photo',
    pendingReduction: true,
    ...extra,
  } as QueuedAttachment
}

describe('spec 220 T3.3: a miniatura viaja com o anexo da fila', () => {
  it('a redução troca o arquivo e grava a miniatura no mesmo item', () => {
    const thumbnail = blobOfSize(50 * KIB)
    const [item] = replaceAttachmentBlob({
      attachmentKey: 'key-1',
      blob: blobOfSize(800 * KIB),
      fileName: 'canhoto.jpg',
      items: [queuedPhoto()],
      thumbnail,
    })

    expect(item?.thumbnail).toBe(thumbnail)
    expect(item?.pendingReduction).toBeUndefined()
  })

  it('troca sem miniatura nova descarta a antiga: ela é do arquivo que saiu', () => {
    const [item] = replaceAttachmentBlob({
      attachmentKey: 'key-1',
      blob: blobOfSize(800 * KIB),
      fileName: 'canhoto.jpg',
      items: [queuedPhoto({ thumbnail: blobOfSize(50 * KIB) })],
    })

    expect(item?.thumbnail).toBeUndefined()
  })

  it('original mais miniatura acima do corpo de 1 MiB descarta a miniatura, não a foto', async () => {
    const result = await buildProofPhotoWithThumbnail({
      encodeThumbnail: () => Promise.resolve(blobOfSize(100 * KIB)),
      original: blobOfSize(960 * KIB),
    })

    expect(result.thumbnail).toBeUndefined()
  })

  it('o multipart carrega o campo thumbnail quando há miniatura, e só então', async () => {
    const requests: Request[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        requests.push(input as Request)
        return Promise.resolve(
          new Response('{"data":{"id":"proof-1","punctuality":"not_required"}}', {
            headers: { 'content-type': 'application/json' },
          }),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    const file = new File([new Uint8Array(4)], 'canhoto.jpg', { type: 'image/jpeg' })

    await client.attachProof({
      documentId: 'document-1',
      file,
      kind: 'photo',
      thumbnail: new File([new Uint8Array(4)], 'thumbnail.jpg', { type: 'image/jpeg' }),
    })
    await client.attachProof({ documentId: 'document-1', file, kind: 'photo' })

    expect((await requests[0]?.formData())?.has('thumbnail')).toBe(true)
    expect((await requests[1]?.formData())?.has('thumbnail')).toBe(false)
  })
})
