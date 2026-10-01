/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.11: o que o hook faz com o 200 e com o 409 do veredito do canhoto. O 200 (inclusive o
 * `unchanged` do clique duplo) só escreve no cache; o 409 não escreve nada e manda refazer a consulta,
 * para o operador ver o veredito que venceu.
 */
import { describe, expect, test } from 'bun:test'

import {
  CANHOTO_REVIEW_ALREADY_RESOLVED_CODE,
  CANHOTO_REVIEW_OUTCOME,
  TRIP_MANAGE_PERMISSION,
  TRIP_QUERY_KEY,
} from '@/modules/trip/shared/trip.constant'
import type { CanhotoReviewResult } from '@/modules/trip/shared/canhotoReviewResult.service'
import type { DeliveryProof } from '@/modules/trip/shared/deliveryProof.service'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook } from './renderHook.helper'

const { useTripWorkspace } = await import('@/modules/trip/hooks/useTripWorkspace.hook')

const COMPANY_ID = 'company-1'
const TRIP_ID = 'trip-1'
const DOCUMENT_ID = 'document-1'
const PROOFS_KEY = [TRIP_QUERY_KEY, COMPANY_ID, TRIP_ID, 'delivery-proofs', DOCUMENT_ID] as const
const TARGET = { documentId: DOCUMENT_ID, review: { action: 'approve' }, tripId: TRIP_ID } as const

const PENDING_RECEIPT: DeliveryProof = {
  canhotoReview: 'pending',
  createdAt: '2026-09-30T10:00:00Z',
  downloadUrl: 'https://storage.test/original/receipt',
  expiresAt: '2026-09-30T10:05:00Z',
  id: 'proof-receipt',
  kind: 'photo',
  receiverName: '',
}

const APPROVED: CanhotoReviewResult = {
  canhotoReview: 'approved',
  canhotoReviewAt: '2026-09-30T12:00:00Z',
  canhotoReviewOrigin: 'manual',
}

async function renderSeededWorkspace() {
  const rendered = await renderHook(() =>
    useTripWorkspace({
      companyId: COMPANY_ID,
      permissions: [TRIP_MANAGE_PERMISSION],
      tripId: TRIP_ID,
    }),
  )
  rendered.queryClient.setQueryData(PROOFS_KEY, [PENDING_RECEIPT])
  return rendered
}

describe('reviewCanhoto (spec 220 T7.11)', () => {
  test('200 writes the verdict into the proofs cache and does not refetch', async () => {
    resetTripHookFakes([])
    fakes.tripClient = { ...fakes.tripClient, canhotoReviewProof: () => Promise.resolve(APPROVED) }
    const rendered = await renderSeededWorkspace()

    const outcome = await rendered.result().reviewCanhoto(TARGET)

    const cached = rendered.queryClient.getQueryData<DeliveryProof[]>(PROOFS_KEY)
    expect(outcome).toBe(CANHOTO_REVIEW_OUTCOME.APPLIED)
    expect(cached?.[0]?.canhotoReview).toBe('approved')
    expect(rendered.queryClient.getQueryState(PROOFS_KEY)?.isInvalidated).toBe(false)
    rendered.unmount()
  })

  test('409 leaves the cache alone and invalidates it so the winning verdict is read', async () => {
    resetTripHookFakes([])
    fakes.tripClient = {
      ...fakes.tripClient,
      canhotoReviewProof: () => Promise.reject(new Error(CANHOTO_REVIEW_ALREADY_RESOLVED_CODE)),
    }
    const rendered = await renderSeededWorkspace()

    const outcome = await rendered.result().reviewCanhoto(TARGET)

    const cached = rendered.queryClient.getQueryData<DeliveryProof[]>(PROOFS_KEY)
    expect(outcome).toBe(CANHOTO_REVIEW_OUTCOME.ALREADY_RESOLVED)
    expect(cached?.[0]?.canhotoReview).toBe('pending')
    expect(rendered.queryClient.getQueryState(PROOFS_KEY)?.isInvalidated).toBe(true)
    rendered.unmount()
  })

  test('any other failure is rethrown for the dialog to translate, and the cache stays', async () => {
    resetTripHookFakes([])
    fakes.tripClient = {
      ...fakes.tripClient,
      canhotoReviewProof: () => Promise.reject(new Error('CANHOTO_REVIEW_NOTE_LENGTH')),
    }
    const rendered = await renderSeededWorkspace()

    let failure: unknown
    try {
      await rendered.result().reviewCanhoto(TARGET)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('CANHOTO_REVIEW_NOTE_LENGTH')
    expect(rendered.queryClient.getQueryState(PROOFS_KEY)?.isInvalidated).toBe(false)
    rendered.unmount()
  })
})
