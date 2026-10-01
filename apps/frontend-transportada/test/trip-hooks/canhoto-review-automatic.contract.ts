/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.14: o `TripDeliveryProofLoader` dispara a conferência automática sozinho ao abrir o
 * item. A rede, o `createImageBitmap` e o canvas são dublês; o que se prova é o disparo, a imagem
 * original (nunca a miniatura) e que o corpo do PATCH automático não carrega `review`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripDeliveryProofLoader } from '../../src/modules/trip/components/TripDetail.component'
import type { TripWorkspaceController } from '../../src/modules/trip/hooks/useTripWorkspace.hook'
import type { CanhotoTripDocument } from '../../src/modules/trip/shared/canhotoIdentification.service'
import type { DeliveryProof } from '../../src/modules/trip/shared/deliveryProof.service'
import { CANHOTO_REVIEW_OUTCOME } from '../../src/modules/trip/shared/trip.constant'
import type { TripDocumentDetail } from '../../src/modules/trip/shared/trip.types'

const DOCUMENT_ID = 'document-1'
const TRIP_ID = 'trip-1'
const ACCESS_KEY = '35260112345678000190550010000001231000001234'
const ORIGINAL_URL = 'https://storage.test/original/receipt'
const THUMBNAIL_URL = 'https://storage.test/thumbnail/receipt'
const SETTLE_DELAY_MS = 30
const FAKE_IMAGE_SIZE = 4
const AUTOMATIC_BODY_KEYS = ['action', 'readDocumentId', 'readNumber', 'readSeries', 'readSource']

type ReviewCall = Parameters<TripWorkspaceController['reviewCanhoto']>[0]

const DELIVERED_DOCUMENT = {
  deliveredAt: '2026-09-30T10:00:00Z',
  id: DOCUMENT_ID,
  returnedAt: null,
  returnReason: null,
  separationStatus: 'delivered',
  tripId: TRIP_ID,
} as unknown as TripDocumentDetail

const TRIP_DOCUMENTS: readonly CanhotoTripDocument[] = [
  { accessKey: ACCESS_KEY, id: DOCUMENT_ID, nfeNumber: '123', nfeSeries: '1' },
]

let root: Root | undefined
let container: HTMLDivElement | undefined
let reviewCalls: ReviewCall[] = []
let fetchedUrls: string[] = []
const originalFetch = globalThis.fetch
const originalCreateImageBitmap = globalThis.createImageBitmap
const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext',
)

function buildProof(overrides: Partial<DeliveryProof>): DeliveryProof {
  return {
    canhotoReview: 'pending',
    createdAt: '2026-09-30T10:00:00Z',
    downloadUrl: ORIGINAL_URL,
    expiresAt: '2026-09-30T10:05:00Z',
    id: 'proof-default',
    kind: 'photo',
    receiverName: '',
    thumbnailUrl: THUMBNAIL_URL,
    ...overrides,
  }
}

function createWorkspace(proof: DeliveryProof): TripWorkspaceController {
  return {
    controller: { canManageTrips: true },
    deliveryProofsQuery: { data: [proof], isLoading: false },
    documentProductsQuery: { data: [] },
    isSendingOccurrencePhotos: false,
    lastOccurrenceEmail: '',
    occurrencePhotoSendState: { status: 'idle' },
    occurrencesQuery: { data: [] },
    occurrenceTypesQuery: { data: [] },
    resetSeparationOccurrencePhotoSend: () => undefined,
    reviewCanhoto: (review: ReviewCall) => {
      reviewCalls.push(review)
      return Promise.resolve(CANHOTO_REVIEW_OUTCOME.APPLIED)
    },
    sendSeparationOccurrencePhotos: () => Promise.resolve(undefined),
  } as unknown as TripWorkspaceController
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))
  })
}

async function openItem(
  proof: DeliveryProof,
  tripDocuments: readonly CanhotoTripDocument[] = TRIP_DOCUMENTS,
): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(TripDeliveryProofLoader, {
        canhotoReadContext: { canhotoOcrEnabled: false, tripDocuments },
        documentId: DOCUMENT_ID,
        documents: [DELIVERED_DOCUMENT],
        workspace: createWorkspace(proof),
      }),
    )
    await Promise.resolve()
  })
  await settle()
}

function closeItem(): void {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
}

describe('a conferência automática do canhoto ao abrir o item (spec 220 T7.14)', () => {
  beforeEach(() => {
    reviewCalls = []
    fetchedUrls = []
    globalThis.fetch = ((url: string) => {
      fetchedUrls.push(url)
      return Promise.resolve(new Response(new Blob([new Uint8Array([1, 2, 3])])))
    }) as unknown as typeof fetch
    globalThis.createImageBitmap = () =>
      Promise.resolve({
        close: () => undefined,
        height: FAKE_IMAGE_SIZE,
        width: FAKE_IMAGE_SIZE,
      })
    HTMLCanvasElement.prototype.getContext = (() => ({
      drawImage: () => undefined,
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(() => {
    if (root !== undefined) closeItem()
    globalThis.fetch = originalFetch
    globalThis.createImageBitmap = originalCreateImageBitmap
    if (originalGetContext !== undefined) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext)
    }
  })

  it('photo pendente e sem leitura dispara sozinho, com a imagem original e sem review no corpo', async () => {
    await openItem(buildProof({ id: 'proof-fires' }))

    expect(fetchedUrls).toEqual([ORIGINAL_URL])
    expect(reviewCalls).toHaveLength(1)
    const [call] = reviewCalls
    expect(call?.documentId).toBe(DOCUMENT_ID)
    expect(call?.tripId).toBe(TRIP_ID)
    expect(Object.keys(call?.review ?? {}).sort()).toEqual(AUTOMATIC_BODY_KEYS)
    expect(call?.review).not.toHaveProperty('review')
  })

  it('comprovante que já tem leitura não dispara', async () => {
    await openItem(buildProof({ canhotoReadSource: 'ocr', id: 'proof-read' }))

    expect(fetchedUrls).toEqual([])
    expect(reviewCalls).toEqual([])
  })

  it('comprovante que não é foto não dispara', async () => {
    await openItem(buildProof({ id: 'proof-cargo', kind: 'cargo' }))

    expect(fetchedUrls).toEqual([])
    expect(reviewCalls).toEqual([])
  })

  it('comprovante já conferido não dispara', async () => {
    await openItem(buildProof({ canhotoReview: 'approved', id: 'proof-approved' }))

    expect(fetchedUrls).toEqual([])
    expect(reviewCalls).toEqual([])
  })

  it('sem a chave de acesso da nota ele espera, não lê', async () => {
    await openItem(buildProof({ id: 'proof-waiting' }), [{ id: DOCUMENT_ID }])

    expect(fetchedUrls).toEqual([])
    expect(reviewCalls).toEqual([])
  })

  it('fechar e reabrir o item não relê', async () => {
    const proof = buildProof({ id: 'proof-reopen' })
    await openItem(proof)
    expect(reviewCalls).toHaveLength(1)

    closeItem()
    await openItem(proof)

    expect(fetchedUrls).toHaveLength(1)
    expect(reviewCalls).toHaveLength(1)
  })
})
