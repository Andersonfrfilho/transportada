/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.17: a chave de acesso antes da leitura. `reviewCanhoto` casa pela chave inteira, e
 * `GET /trips/:id` não a traz — ela vem da rota estreita da spec 156 T14, que responde depois e
 * pode não responder nunca (erro de rota, perfil sem `trip.report-on-behalf`). Sem a chave a leitura
 * **espera**: não degrada para número/série, porque `matched` é a única porta de aprovação
 * automática da RF26. Esperar não é falhar — a frase de indisponibilidade da T7.16 não pode
 * aparecer, e nada trava o passo. A escolha é por nota (`find` pelo `documentId`), nunca a primeira
 * chave que aparecer na lista.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  CanhotoAutomaticReview,
  type CanhotoReadContext,
} from '../../src/modules/trip/components/CanhotoAutomaticReview.component'
import type { TripWorkspaceController } from '../../src/modules/trip/hooks/useTripWorkspace.hook'
import type { CanhotoTripDocument } from '../../src/modules/trip/shared/canhotoIdentification.service'
import { CANHOTO_REVIEW_OUTCOME } from '../../src/modules/trip/shared/trip.constant'
import type { DeliveryProof } from '../../src/modules/trip/shared/deliveryProof.service'

const DOCUMENT_ID = 'document-open'
const OTHER_DOCUMENT_ID = 'document-other'
const TRIP_ID = 'trip-1'
const ACCESS_KEY = '35260112345678000190550010000001231000001234'
const OTHER_ACCESS_KEY = '35260112345678000190550010000009991000009999'
const ORIGINAL_URL = 'https://storage.test/original/receipt'
const THUMBNAIL_URL = 'https://storage.test/thumbnail/receipt'
const SETTLE_DELAY_MS = 20
const FAKE_IMAGE_SIZE = 4

type ReviewCall = Parameters<TripWorkspaceController['reviewCanhoto']>[0]

/** A rota estreita não respondeu ainda, falhou, ou o perfil não tem `trip.report-on-behalf`. */
const NO_ANSWER_YET: readonly CanhotoTripDocument[] = []

/** Respondeu, mas sem a nota aberta — outra viagem, ou a nota não voltou na resposta. */
const WITHOUT_THE_OPEN_DOCUMENT: readonly CanhotoTripDocument[] = [
  { accessKey: OTHER_ACCESS_KEY, id: OTHER_DOCUMENT_ID, nfeNumber: '999', nfeSeries: '1' },
]

/** A nota aberta está na lista, mas sem chave — a vizinha tem, e não serve. */
const OPEN_DOCUMENT_WITHOUT_KEY: readonly CanhotoTripDocument[] = [
  { accessKey: OTHER_ACCESS_KEY, id: OTHER_DOCUMENT_ID, nfeNumber: '999', nfeSeries: '1' },
  { id: DOCUMENT_ID, nfeNumber: '123', nfeSeries: '1' },
]

const WITH_THE_KEY: readonly CanhotoTripDocument[] = [
  { accessKey: OTHER_ACCESS_KEY, id: OTHER_DOCUMENT_ID, nfeNumber: '999', nfeSeries: '1' },
  { accessKey: ACCESS_KEY, id: DOCUMENT_ID, nfeNumber: '123', nfeSeries: '1' },
]

let root: Root | undefined
let container: HTMLDivElement | undefined
let fetchedUrls: string[] = []
let reviewCalls: ReviewCall[] = []
let unavailableCount = 0
const originalFetch = globalThis.fetch
const originalCreateImageBitmap = globalThis.createImageBitmap
const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext',
)

const PENDING_PROOF: DeliveryProof = {
  canhotoReview: 'pending',
  createdAt: '2026-09-30T10:00:00Z',
  downloadUrl: ORIGINAL_URL,
  expiresAt: '2026-09-30T10:05:00Z',
  id: 'proof-receipt',
  kind: 'photo',
  receiverName: '',
  thumbnailUrl: THUMBNAIL_URL,
} as unknown as DeliveryProof

function buildContext(tripDocuments: readonly CanhotoTripDocument[]): CanhotoReadContext {
  return { canhotoOcrEnabled: false, tripDocuments }
}

async function render(tripDocuments: readonly CanhotoTripDocument[]): Promise<void> {
  await act(async () => {
    root?.render(
      createElement(CanhotoAutomaticReview, {
        context: buildContext(tripDocuments),
        documentId: DOCUMENT_ID,
        onUnavailable: () => {
          unavailableCount += 1
        },
        proof: PENDING_PROOF,
        reviewCanhoto: (review: ReviewCall) => {
          reviewCalls.push(review)
          return Promise.resolve(CANHOTO_REVIEW_OUTCOME.APPLIED)
        },
        tripId: TRIP_ID,
      }),
    )
    await Promise.resolve()
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))
  })
}

async function mount(tripDocuments: readonly CanhotoTripDocument[]): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await render(tripDocuments)
}

describe('a chave de acesso antes da leitura do canhoto (spec 220 T7.17)', () => {
  beforeEach(() => {
    fetchedUrls = []
    reviewCalls = []
    unavailableCount = 0
    globalThis.fetch = ((url: string) => {
      fetchedUrls.push(url)
      return Promise.resolve(new Response(new Blob([new Uint8Array([1, 2, 3])])))
    }) as unknown as typeof fetch
    globalThis.createImageBitmap = () =>
      Promise.resolve({
        close: () => undefined,
        height: FAKE_IMAGE_SIZE,
        width: FAKE_IMAGE_SIZE,
      } as ImageBitmap)
    HTMLCanvasElement.prototype.getContext = (() => ({
      drawImage: () => undefined,
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        height,
        width,
      }),
    })) as unknown as HTMLCanvasElement['getContext']
  })

  afterEach(() => {
    if (root !== undefined) act(() => root?.unmount())
    container?.remove()
    root = undefined
    container = undefined
    globalThis.fetch = originalFetch
    globalThis.createImageBitmap = originalCreateImageBitmap
    if (originalGetContext !== undefined) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext)
    }
  })

  it('sem resposta da rota estreita, a imagem nem é buscada — e nada trava', async () => {
    await mount(NO_ANSWER_YET)

    expect(fetchedUrls).toEqual([])
    expect(reviewCalls).toEqual([])
    expect(unavailableCount).toBe(0)
  })

  it('resposta sem a nota aberta é o mesmo que resposta nenhuma', async () => {
    await mount(WITHOUT_THE_OPEN_DOCUMENT)

    expect(fetchedUrls).toEqual([])
    expect(reviewCalls).toEqual([])
  })

  it('a chave é a da nota aberta, nunca a primeira da lista', async () => {
    await mount(OPEN_DOCUMENT_WITHOUT_KEY)

    expect(fetchedUrls).toEqual([])
    expect(reviewCalls).toEqual([])
  })

  it('chegada a chave, a leitura dispara uma vez só', async () => {
    await mount(NO_ANSWER_YET)
    expect(fetchedUrls).toEqual([])

    await render(WITH_THE_KEY)
    await render(WITH_THE_KEY)

    expect(fetchedUrls).toEqual([ORIGINAL_URL])
    expect(reviewCalls).toHaveLength(1)
  })
})
