/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.16: quando a conferência automática não consegue (prazo estourado ou PATCH falho) a
 * tela diz uma frase só, de sessão; o comprovante segue `pending`. Rede, `createImageBitmap` e
 * canvas são dublês; o prazo de 20 s é encurtado trocando só esse `setTimeout`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripDeliveryProofLoader } from '../../src/modules/trip/components/TripDetail.component'
import type { TripWorkspaceController } from '../../src/modules/trip/hooks/useTripWorkspace.hook'
import type { CanhotoTripDocument } from '../../src/modules/trip/shared/canhotoIdentification.service'
import { CANHOTO_REVIEW_TIMEOUT_MS } from '../../src/modules/trip/shared/canhotoReview.service'
import type { DeliveryProof } from '../../src/modules/trip/shared/deliveryProof.service'
import { CANHOTO_REVIEW_OUTCOME } from '../../src/modules/trip/shared/trip.constant'
import type { TripDocumentDetail } from '../../src/modules/trip/shared/trip.types'

const DOCUMENT_ID = 'document-1'
const TRIP_ID = 'trip-1'
const ACCESS_KEY = '35260112345678000190550010000001231000001234'
const ORIGINAL_URL = 'https://storage.test/original/receipt'
const THUMBNAIL_URL = 'https://storage.test/thumbnail/receipt'
const SETTLE_DELAY_MS = 60
const SHORT_DEADLINE_MS = 5
const FAKE_IMAGE_SIZE = 4
const UNAVAILABLE_TEXT = 'Não foi possível conferir automaticamente. Confira este canhoto.'

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
let isPatchFailing = false
let isFetchHanging = false
const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
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
      if (isPatchFailing) return Promise.reject(new Error('PATCH_FAILED'))
      return Promise.resolve(CANHOTO_REVIEW_OUTCOME.APPLIED)
    },
    sendSeparationOccurrencePhotos: () => Promise.resolve(undefined),
  } as unknown as TripWorkspaceController
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => originalSetTimeout(resolve, SETTLE_DELAY_MS))
  })
}

async function openItem(proof: DeliveryProof): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(TripDeliveryProofLoader, {
        canhotoReadContext: { canhotoOcrEnabled: false, tripDocuments: TRIP_DOCUMENTS },
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

function isUnavailableShown(): boolean {
  return container?.textContent?.includes(UNAVAILABLE_TEXT) ?? false
}

describe('a conferência automática que não consegue (spec 220 T7.16)', () => {
  beforeEach(() => {
    reviewCalls = []
    isPatchFailing = false
    isFetchHanging = false
    globalThis.fetch = (() =>
      isFetchHanging
        ? new Promise<Response>(() => undefined)
        : Promise.resolve(
            new Response(new Blob([new Uint8Array([1, 2, 3])])),
          )) as unknown as typeof fetch
    globalThis.setTimeout = ((handler: () => void, delay?: number) =>
      originalSetTimeout(
        handler,
        delay === CANHOTO_REVIEW_TIMEOUT_MS ? SHORT_DEADLINE_MS : delay,
      )) as unknown as typeof setTimeout
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
    globalThis.setTimeout = originalSetTimeout
    globalThis.createImageBitmap = originalCreateImageBitmap
    if (originalGetContext !== undefined) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext)
    }
  })

  it('estourado o prazo, a frase aparece e nenhum PATCH é enviado', async () => {
    isFetchHanging = true
    await openItem(buildProof({ id: 'proof-timeout' }))

    expect(isUnavailableShown()).toBe(true)
    expect(reviewCalls).toEqual([])
  })

  it('o PATCH automático que falha produz a mesma frase', async () => {
    isPatchFailing = true
    await openItem(buildProof({ id: 'proof-patch-fails' }))

    expect(reviewCalls).toHaveLength(1)
    expect(isUnavailableShown()).toBe(true)
  })

  it('a frase é de sessão: remontando o item ela não volta sozinha', async () => {
    isFetchHanging = true
    const proof = buildProof({ id: 'proof-session' })
    await openItem(proof)
    expect(isUnavailableShown()).toBe(true)

    closeItem()
    isFetchHanging = false
    await openItem(proof)

    expect(isUnavailableShown()).toBe(false)
  })

  it('a leitura que chega dentro do prazo não mostra a frase', async () => {
    await openItem(buildProof({ id: 'proof-in-time' }))

    expect(reviewCalls).toHaveLength(1)
    expect(isUnavailableShown()).toBe(false)
  })
})
