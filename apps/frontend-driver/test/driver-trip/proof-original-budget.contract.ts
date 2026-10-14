/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

import { createClientDiagnostics } from '@/modules/driver-trip/shared/clientDiagnostics.service'
import {
  createDriverTripClient,
  DriverTripRequestError,
  toAttachmentSendOutcome,
} from '@/modules/driver-trip/shared/driverTripClient.service'
import type {
  AttachmentStore,
  QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import {
  recoverQueuedProofPhotos,
  type ProofPhotoReducer,
} from '@/modules/driver-trip/shared/proofPhotoRecovery.service'
import {
  needsProofPhotoReduction,
  PROOF_ORIGINAL_MAX_BYTES,
  PROOF_PHOTO_MAX_BYTES,
  PROOF_PHOTO_REDUCTION_BUDGET_MS,
  PROOF_PHOTO_REDUCTION_TIMEOUT_MS,
  resolveProofUploadVariant,
} from '@/modules/driver-trip/shared/proofPhotoReduction.service'
import { resolveRejectionCauseLabelKey } from '@/modules/driver-trip/shared/rejectionCauseLabel.service'

const KIB = 1024
const MIB = 1024 * KIB
const EVENT_KEY = 'document:document-1'

function blobOfSize(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
}

function queuedPhoto(bytes: number): QueuedAttachment {
  return {
    attachmentKey: 'canhoto-1',
    blob: blobOfSize(bytes),
    capturedAt: '2026-10-14T12:00:00.000Z',
    documentId: 'document-1',
    fileName: 'IMG_0001.jpg',
    kind: 'photo',
    pendingReduction: true,
  }
}

function memoryStore(initial: QueuedAttachment): AttachmentStore & {
  readonly items: () => readonly QueuedAttachment[]
} {
  let items: readonly QueuedAttachment[] = [initial]
  return {
    items: () => items,
    read: () => Promise.resolve(items),
    readAll: () => Promise.resolve([[EVENT_KEY, items] as const]),
    readTotals: () => Promise.resolve({ count: 0, totalBytes: 0 }),
    remove: () => Promise.resolve(),
    update: (input) => {
      items = input.mutate(items)
      return Promise.resolve(items)
    },
  }
}

describe('spec 265 RF9: o orçamento da redução é 8 s', () => {
  it('o orçamento fixo é 8 s e o nome antigo do teto vale o mesmo', () => {
    expect(PROOF_PHOTO_REDUCTION_BUDGET_MS).toBe(8_000)
    expect(PROOF_PHOTO_REDUCTION_TIMEOUT_MS).toBe(PROOF_PHOTO_REDUCTION_BUDGET_MS)
  })

  it('a tela usa o orçamento na contagem e na porcentagem, não 20 s', () => {
    const component = readFileSync(
      resolve(
        import.meta.dir,
        '../../src/modules/driver-trip/components/ProofUploadStatus.component.tsx',
      ),
      'utf8',
    )
    expect(component).toContain('PROOF_PHOTO_REDUCTION_BUDGET_MS')
    expect(component).not.toContain('PROOF_PHOTO_REDUCTION_TIMEOUT_MS')
  })

  it('estourar o orçamento cancela a redução e o item segue com o original, sem tentar de novo', async () => {
    const store = memoryStore(queuedPhoto(4 * MIB))
    let wasCancelled = false
    const reduce: ProofPhotoReducer = (_file, options) => {
      options?.signal?.addEventListener('abort', () => {
        wasCancelled = true
      })
      return new Promise(() => undefined)
    }

    await recoverQueuedProofPhotos({
      attachmentStore: store,
      reduce,
      reductionTimeoutMs: 5,
      reductions: new Map(),
    })

    const [item] = store.items()
    expect(wasCancelled).toBe(true)
    expect(item?.pendingReduction).toBeUndefined()
    expect(item?.reductionAbandoned).toBe(true)
    expect(item?.blob.size).toBe(4 * MIB)
    if (item === undefined) throw new Error('ITEM_MISSING')
    expect(needsProofPhotoReduction(item)).toBe(false)
  })
})

describe('spec 265 RF3: a variante que o multipart declara', () => {
  it('foto acima de 960 KiB sobe como original; a que coube sobe como reduced', () => {
    expect(resolveProofUploadVariant({ file: blobOfSize(4 * MIB), kind: 'photo' })).toBe('original')
    expect(
      resolveProofUploadVariant({ file: blobOfSize(PROOF_PHOTO_MAX_BYTES), kind: 'photo' }),
    ).toBe('reduced')
    expect(resolveProofUploadVariant({ file: blobOfSize(300 * KIB), kind: 'cargo' })).toBe(
      'reduced',
    )
  })

  it('assinatura e arquivo que não é imagem não declaram variante', () => {
    expect(
      resolveProofUploadVariant({
        file: new Blob([new Uint8Array(10)], { type: 'image/png' }),
        kind: 'signature',
      }),
    ).toBeUndefined()
    expect(
      resolveProofUploadVariant({
        file: new Blob([new Uint8Array(10)], { type: 'application/pdf' }),
        kind: 'photo',
      }),
    ).toBeUndefined()
  })
})

function clientWithFetch(
  requests: Request[],
  body = '{"data":{"id":"p1","punctuality":"not_required"}}',
) {
  return createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: (input) => {
      requests.push(input as Request)
      return Promise.resolve(
        new Response(body, { headers: { 'content-type': 'application/json' }, status: 201 }),
      )
    },
    getAccessToken: () => Promise.resolve('token'),
  })
}

describe('spec 265: o envio do original', () => {
  it('estourou o orçamento: o original sobe com variant=original (antes ia sem variante e voltava 413)', async () => {
    const requests: Request[] = []
    const client = clientWithFetch(requests)

    await client.attachProof({
      documentId: 'document-1',
      file: new File([new Uint8Array(4 * MIB)], 'IMG_0001.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })

    const form = await requests[0]?.formData()
    expect(form?.get('variant')).toBe('original')
    expect(form?.has('thumbnail')).toBe(false)
  })

  it('reduzida a tempo continua reduced, com a miniatura', async () => {
    const requests: Request[] = []
    const client = clientWithFetch(requests)

    await client.attachProof({
      documentId: 'document-1',
      file: new File([new Uint8Array(800 * KIB)], 'IMG_0001.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
      thumbnail: new File([new Uint8Array(40 * KIB)], 'thumbnail.jpg', { type: 'image/jpeg' }),
    })

    const form = await requests[0]?.formData()
    expect(form?.get('variant')).toBe('reduced')
    expect(form?.has('thumbnail')).toBe(true)
  })

  it('assinatura sobe sem variante, como antes', async () => {
    const requests: Request[] = []
    const client = clientWithFetch(requests)

    await client.attachProof({
      documentId: 'document-1',
      file: new File([new Uint8Array(10)], 'assinatura.png', { type: 'image/png' }),
      kind: 'signature',
    })

    expect((await requests[0]?.formData())?.has('variant')).toBe(false)
  })

  it('acima do teto de 12 MiB a recusa é explicada na fila, sem gastar dados', async () => {
    const requests: Request[] = []
    const client = clientWithFetch(requests)

    const error: unknown = await client
      .attachProof({
        documentId: 'document-1',
        file: new File([new Uint8Array(PROOF_ORIGINAL_MAX_BYTES + 1)], 'IMG_0001.jpg', {
          type: 'image/jpeg',
        }),
        kind: 'photo',
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DriverTripRequestError)
    expect(requests).toHaveLength(0)
    const outcome = toAttachmentSendOutcome(error)
    expect(outcome).toMatchObject({ cause: '422 TRIP_DELIVERY_PROOF_TOO_LARGE', kind: 'rejected' })
    if (outcome.kind !== 'rejected') throw new Error('NOT_REJECTED')
    expect(resolveRejectionCauseLabelKey(outcome.cause)).toBe('eventQueue.cause.tooLarge')
  })

  it('exatamente 12 MiB ainda sobe', async () => {
    const requests: Request[] = []
    const client = clientWithFetch(requests)

    await client.attachProof({
      documentId: 'document-1',
      file: new File([new Uint8Array(PROOF_ORIGINAL_MAX_BYTES)], 'IMG_0001.jpg', {
        type: 'image/jpeg',
      }),
      kind: 'photo',
    })

    expect(requests).toHaveLength(1)
  })

  it('processingState do servidor chega ao chamador; sem o campo (API antiga) nada muda', async () => {
    const file = new File([new Uint8Array(4)], 'IMG.jpg', { type: 'image/jpeg' })
    const processing = await clientWithFetch(
      [],
      '{"data":{"id":"p1","processingState":"received","punctuality":"not_required"}}',
    ).attachProof({ documentId: 'document-1', file, kind: 'photo' })
    const ready = await clientWithFetch(
      [],
      '{"data":{"id":"p1","processingState":"ready","punctuality":"not_required"}}',
    ).attachProof({ documentId: 'document-1', file, kind: 'photo' })
    const legacy = await clientWithFetch([]).attachProof({
      documentId: 'document-1',
      file,
      kind: 'photo',
    })

    expect(processing.processingState).toBe('received')
    expect(ready.processingState).toBeUndefined()
    expect(legacy.processingState).toBeUndefined()
    expect(legacy).toEqual({ id: 'p1', punctuality: 'not_required' })
  })
})

describe('spec 265 RF13: o upload deixa rastro com o tamanho e a duração', () => {
  it('step_timing de upload_put com photoBytes, durationMs e o rótulo proof', async () => {
    const sent: unknown[] = []
    const diagnostics = createClientDiagnostics({
      send: (batch) => {
        sent.push(batch)
        return Promise.resolve({ status: 204 })
      },
    })
    let clock = 1_000
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      diagnostics,
      fetch: () => {
        clock = 4_500
        return Promise.resolve(
          new Response('{"data":{"id":"p1","punctuality":"not_required"}}', { status: 201 }),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
      now: () => clock,
    })

    await client.attachProof({
      attachmentKey: 'key-1',
      documentId: 'document-1',
      file: new File([new Uint8Array(3 * MIB)], 'IMG.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })
    await diagnostics.flush()

    const events = (sent[0] as { events: Array<Record<string, unknown>> }).events
    expect(events[0]).toMatchObject({
      attachmentKey: 'key-1',
      durationMs: 3_500,
      eventKind: 'step_timing',
      photoBytes: 3 * MIB,
      reportKind: 'proof',
      step: 'upload_put',
    })
  })
})
