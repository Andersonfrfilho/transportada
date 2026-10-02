/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.4: o detalhe da viagem não passa a buscar comprovante de graça — a consulta do maço só
 * dispara com `trip.manage` **e** ao menos uma nota marcada.
 */
import { describe, expect, test } from 'bun:test'

import type { TripDeliveryProof } from '@/modules/trip/shared/canhotoBatchSelection.service'
import { TRIP_QUERY_KEY } from '@/modules/trip/shared/trip.constant'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook, waitFor } from './renderHook.helper'

const { useTripDeliveryProofsQuery } = await import(
  '@/modules/trip/queries/useTripDeliveryProofs.query'
)

const COMPANY_ID = 'company-1'
const TRIP_ID = 'trip-1'

const PROOF: TripDeliveryProof = {
  canhotoReview: 'pending',
  createdAt: '2026-09-30T10:00:00Z',
  documentId: 'document-1',
  downloadUrl: 'https://storage.test/original/receipt',
  expiresAt: '2026-09-30T10:05:00Z',
  id: 'proof-receipt',
  kind: 'photo',
  receiverName: '',
}

function installCountingClient(): { calls: () => number } {
  let calls = 0
  fakes.tripClient = {
    ...fakes.tripClient,
    readTripDeliveryProofs: () => {
      calls += 1
      return Promise.resolve([PROOF])
    },
  }
  return { calls: () => calls }
}

async function renderQuery(input: Readonly<{ canManage: boolean; hasSelection: boolean }>) {
  return renderHook(() =>
    useTripDeliveryProofsQuery({ ...input, companyId: COMPANY_ID, tripId: TRIP_ID }),
  )
}

describe('useTripDeliveryProofsQuery (spec 222 T2.4)', () => {
  test('does not call the client without trip.manage, even with notes marked', async () => {
    resetTripHookFakes([])
    const client = installCountingClient()

    const rendered = await renderQuery({ canManage: false, hasSelection: true })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(client.calls()).toBe(0)
    rendered.unmount()
  })

  test('does not call the client with trip.manage and an empty selection', async () => {
    resetTripHookFakes([])
    const client = installCountingClient()

    const rendered = await renderQuery({ canManage: true, hasSelection: false })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(client.calls()).toBe(0)
    rendered.unmount()
  })

  test('calls the client once with trip.manage and a marked note, under the trip key', async () => {
    resetTripHookFakes([])
    const client = installCountingClient()

    const rendered = await renderQuery({ canManage: true, hasSelection: true })
    await waitFor(() => expect(rendered.result().data).toEqual([PROOF]))

    expect(client.calls()).toBe(1)
    expect(
      rendered.queryClient.getQueryData<readonly TripDeliveryProof[]>([
        TRIP_QUERY_KEY,
        COMPANY_ID,
        TRIP_ID,
        'delivery-proofs-batch',
      ]),
    ).toEqual([PROOF])
    rendered.unmount()
  })
})
