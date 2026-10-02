/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.5: aprovar o maço pelo workspace da viagem — o resultado separa aprovado, conflito
 * (409, que não é falha) e falha, e a consulta da viagem é invalidada ao fim, para o que saiu da
 * fila sair da tela.
 */
import { describe, expect, test } from 'bun:test'

import type { CanhotoReviewProofInput } from '@/modules/trip/shared/canhotoReviewResult.service'
import {
  CANHOTO_REVIEW_ALREADY_RESOLVED_CODE,
  TRIP_MANAGE_PERMISSION,
  TRIP_QUERY_KEY,
} from '@/modules/trip/shared/trip.constant'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook } from './renderHook.helper'

const { useTripWorkspace } = await import('@/modules/trip/hooks/useTripWorkspace.hook')

const COMPANY_ID = 'company-1'
const TRIP_ID = 'trip-1'
const TRIP_KEY = [TRIP_QUERY_KEY, COMPANY_ID, TRIP_ID] as const
const FIVE_DOCUMENTS = ['d1', 'd2', 'd3', 'd4', 'd5'] as const

function installReview(
  failures: Readonly<Record<string, Error>> = {},
): readonly CanhotoReviewProofInput[] {
  const calls: CanhotoReviewProofInput[] = []
  fakes.tripClient = {
    ...fakes.tripClient,
    canhotoReviewProof: (input) => {
      calls.push(input)
      const failure = failures[input.documentId]
      if (failure !== undefined) return Promise.reject(failure)
      return Promise.resolve({ canhotoReview: 'approved', canhotoReviewOrigin: 'manual' })
    },
  }
  return calls
}

async function renderWorkspace(permissions: readonly string[]) {
  const rendered = await renderHook(() =>
    useTripWorkspace({ companyId: COMPANY_ID, permissions, tripId: TRIP_ID }),
  )
  rendered.queryClient.setQueryData(TRIP_KEY, { id: TRIP_ID })
  return rendered
}

describe('approveCanhotoBatchMutation (spec 222 T2.5)', () => {
  test('approves every note with approve and invalidates the trip query', async () => {
    resetTripHookFakes([])
    const calls = installReview()
    const rendered = await renderWorkspace([TRIP_MANAGE_PERMISSION])

    const result = await rendered
      .result()
      .approveCanhotoBatchMutation.mutateAsync({ documentIds: FIVE_DOCUMENTS, tripId: TRIP_ID })

    expect(result).toEqual({ approved: [...FIVE_DOCUMENTS], conflicted: [], failed: [] })
    expect(calls.map((call) => call.review)).toEqual(
      FIVE_DOCUMENTS.map(() => ({ action: 'approve' })),
    )
    expect(rendered.queryClient.getQueryState(TRIP_KEY)?.isInvalidated).toBe(true)
    rendered.unmount()
  })

  test('a 409 is a conflict, a network failure is a failure, and the rest still go through', async () => {
    resetTripHookFakes([])
    installReview({
      d2: new Error(CANHOTO_REVIEW_ALREADY_RESOLVED_CODE),
      d4: new TypeError('Failed to fetch'),
    })
    const rendered = await renderWorkspace([TRIP_MANAGE_PERMISSION])

    const result = await rendered
      .result()
      .approveCanhotoBatchMutation.mutateAsync({ documentIds: FIVE_DOCUMENTS, tripId: TRIP_ID })

    expect(result.approved).toEqual(['d1', 'd3', 'd5'])
    expect(result.conflicted).toEqual(['d2'])
    expect(result.failed.map((failure) => failure.documentId)).toEqual(['d4'])
    expect(rendered.queryClient.getQueryState(TRIP_KEY)?.isInvalidated).toBe(true)
    rendered.unmount()
  })

  test('without trip.manage no note reaches the client and every one is reported as failed', async () => {
    resetTripHookFakes([])
    const calls = installReview()
    const rendered = await renderWorkspace([])

    const result = await rendered
      .result()
      .approveCanhotoBatchMutation.mutateAsync({ documentIds: FIVE_DOCUMENTS, tripId: TRIP_ID })

    expect(calls).toHaveLength(0)
    expect(result.approved).toEqual([])
    expect(result.failed).toHaveLength(FIVE_DOCUMENTS.length)
    rendered.unmount()
  })
})
