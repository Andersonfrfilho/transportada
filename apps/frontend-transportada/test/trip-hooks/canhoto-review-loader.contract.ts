/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.12: o painel do canhoto ligado ao carregador que guarda o aviso e chama
 * `reviewCanhoto`. O selo por veredito e os botões sem `trip.manage` já têm contrato em
 * `canhoto-review-panel.contract.ts`, e o diálogo isolado em `canhoto-reject-dialog.contract.ts`;
 * aqui só a integração. O refetch do 409 é do hook (`canhoto-review-outcome.contract.ts`).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripDeliveryProofLoader } from '../../src/modules/trip/components/TripDetail.component'
import type { TripWorkspaceController } from '../../src/modules/trip/hooks/useTripWorkspace.hook'
import type { DeliveryProof } from '../../src/modules/trip/shared/deliveryProof.service'
import { CANHOTO_REVIEW_OUTCOME } from '../../src/modules/trip/shared/trip.constant'
import type { CanhotoReviewOutcome } from '../../src/modules/trip/shared/trip.constant'
import type { TripDocumentDetail } from '../../src/modules/trip/shared/trip.types'

const DOCUMENT_ID = 'document-1'
const TRIP_ID = 'trip-1'
const APPROVE_LABEL = 'Aprovar canhoto'
const REJECT_LABEL = 'Recusar canhoto'
const ALREADY_RESOLVED_TEXT = 'Outra pessoa já conferiu este canhoto'
const FAILED_TEXT = 'Não foi possível registrar a conferência'
const LENGTH_ERROR_CODE = 'CANHOTO_REVIEW_NOTE_LENGTH'

type ReviewCall = Parameters<TripWorkspaceController['reviewCanhoto']>[0]

const PENDING_RECEIPT: DeliveryProof = {
  canhotoReview: 'pending',
  createdAt: '2026-09-30T10:00:00Z',
  downloadUrl: 'https://storage.test/original/receipt',
  expiresAt: '2026-09-30T10:05:00Z',
  id: 'proof-receipt',
  kind: 'photo',
  receiverName: '',
}

const DELIVERED_DOCUMENT = {
  deliveredAt: '2026-09-30T10:00:00Z',
  id: DOCUMENT_ID,
  returnedAt: null,
  returnReason: null,
  separationStatus: 'delivered',
  tripId: TRIP_ID,
} as unknown as TripDocumentDetail

let root: Root | undefined
let container: HTMLDivElement | undefined
let reviewCalls: ReviewCall[] = []

function createWorkspace(
  canReview: boolean,
  reviewCanhoto: (review: ReviewCall) => Promise<CanhotoReviewOutcome>,
): TripWorkspaceController {
  return {
    controller: { canManageTrips: canReview },
    deliveryProofsQuery: { data: [PENDING_RECEIPT], isLoading: false },
    documentProductsQuery: { data: [] },
    isSendingOccurrencePhotos: false,
    lastOccurrenceEmail: '',
    occurrencePhotoSendState: { status: 'idle' },
    occurrencesQuery: { data: [] },
    occurrenceTypesQuery: { data: [] },
    resetSeparationOccurrencePhotoSend: () => undefined,
    reviewCanhoto: (review: ReviewCall) => {
      reviewCalls.push(review)
      return reviewCanhoto(review)
    },
    sendSeparationOccurrencePhotos: () => Promise.resolve(undefined),
  } as unknown as TripWorkspaceController
}

async function renderLoader(
  reviewCanhoto: (review: ReviewCall) => Promise<CanhotoReviewOutcome>,
  canReview = true,
): Promise<void> {
  reviewCalls = []
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(TripDeliveryProofLoader, {
        documentId: DOCUMENT_ID,
        documents: [DELIVERED_DOCUMENT],
        workspace: createWorkspace(canReview, reviewCanhoto),
      }),
    )
    await Promise.resolve()
  })
}

function buttonByText(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${text}`)
  return found
}

function alertTexts(): string[] {
  return [...document.querySelectorAll('[role="alert"]')].map((alert) => alert.textContent ?? '')
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]')
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
}

describe('o painel do canhoto ligado ao carregador (spec 220 T7.12)', () => {
  afterEach(async () => {
    if (root !== undefined) act(() => root?.unmount())
    await new Promise((resolve) => setTimeout(resolve))
    container?.remove()
    root = undefined
    container = undefined
  })

  it('aprovar chama reviewCanhoto com o documento e a viagem, e o 200 não deixa aviso', async () => {
    await renderLoader(() => Promise.resolve(CANHOTO_REVIEW_OUTCOME.APPLIED))

    await click(buttonByText(APPROVE_LABEL))

    expect(reviewCalls).toEqual([
      { documentId: DOCUMENT_ID, review: { action: 'approve' }, tripId: TRIP_ID },
    ])
    expect(alertTexts()).toEqual([])
  })

  it('409 vira o aviso de que outra pessoa já conferiu', async () => {
    await renderLoader(() => Promise.resolve(CANHOTO_REVIEW_OUTCOME.ALREADY_RESOLVED))

    await click(buttonByText(APPROVE_LABEL))

    expect(alertTexts()).toHaveLength(1)
    expect(alertTexts()[0]).toContain(ALREADY_RESOLVED_TEXT)
  })

  it('qualquer outra falha da aprovação vira o aviso de falha, não silêncio', async () => {
    await renderLoader(() => Promise.reject(new Error('NETWORK_DOWN')))

    await click(buttonByText(APPROVE_LABEL))

    expect(alertTexts()).toHaveLength(1)
    expect(alertTexts()[0]).toContain(FAILED_TEXT)
  })

  it('uma nova tentativa limpa o aviso da anterior', async () => {
    let attempt = 0
    await renderLoader(() => {
      attempt += 1
      return attempt === 1
        ? Promise.reject(new Error('NETWORK_DOWN'))
        : Promise.resolve(CANHOTO_REVIEW_OUTCOME.APPLIED)
    })

    await click(buttonByText(APPROVE_LABEL))
    expect(alertTexts()[0]).toContain(FAILED_TEXT)
    await click(buttonByText(APPROVE_LABEL))

    expect(alertTexts()).toEqual([])
  })

  it('sem trip.manage o carregador não oferece botão nenhum', async () => {
    await renderLoader(() => Promise.resolve(CANHOTO_REVIEW_OUTCOME.APPLIED), false)

    const labels = [...document.querySelectorAll('button')].map((button) =>
      button.textContent?.trim(),
    )
    expect(labels).not.toContain(APPROVE_LABEL)
    expect(labels).not.toContain(REJECT_LABEL)
  })

  it('recusar abre o diálogo com o foco dentro, e a confirmação envia o motivo', async () => {
    await renderLoader(() => Promise.resolve(CANHOTO_REVIEW_OUTCOME.APPLIED))
    expect(dialog()).toBeNull()

    await click(buttonByText(REJECT_LABEL))
    expect(dialog()).not.toBeNull()
    expect(dialog()?.contains(document.activeElement)).toBe(true)

    const confirm = [...(dialog()?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === REJECT_LABEL,
    )
    if (confirm === undefined) throw new Error('CONFIRM_NOT_FOUND')
    await click(confirm)

    expect(reviewCalls).toEqual([
      {
        documentId: DOCUMENT_ID,
        review: { action: 'reject', reason: 'illegible' },
        tripId: TRIP_ID,
      },
    ])
    expect(dialog()).toBeNull()
  })

  it('Esc fecha o diálogo sem chamar reviewCanhoto', async () => {
    await renderLoader(() => Promise.resolve(CANHOTO_REVIEW_OUTCOME.APPLIED))
    await click(buttonByText(REJECT_LABEL))

    await act(async () => {
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      await Promise.resolve()
    })

    expect(dialog()).toBeNull()
    expect(reviewCalls).toEqual([])
  })

  it('o 400 da recusa mantém o diálogo aberto com a mensagem, sem aviso de painel', async () => {
    await renderLoader(() => Promise.reject(new Error(LENGTH_ERROR_CODE)))
    await click(buttonByText(REJECT_LABEL))

    const confirm = [...(dialog()?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === REJECT_LABEL,
    )
    if (confirm === undefined) throw new Error('CONFIRM_NOT_FOUND')
    await click(confirm)

    expect(dialog()).not.toBeNull()
    expect(dialog()?.textContent).toContain('entre')
    expect(alertTexts().some((text) => text.includes(FAILED_TEXT))).toBe(false)
  })
})
