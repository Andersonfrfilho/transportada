/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.8: o fluxo do maço de canhotos no detalhe da viagem — o que o botão oferece vem da
 * consulta dos comprovantes, abrir relê (RF-A9), e confirmar tira da seleção só o que saiu da fila.
 */
import { act } from 'react'
import { describe, expect, test } from 'bun:test'

import { useTripDocumentSelection } from '@/modules/trip/hooks/useTripDocumentSelection.hook'
import type { CanhotoBatchApprovalResult } from '@/modules/trip/shared/canhotoBatchApproval.service'
import type { TripDeliveryProof } from '@/modules/trip/shared/canhotoBatchSelection.service'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook, settle, waitFor } from './renderHook.helper'

const { useCanhotoBatchReview } = await import('@/modules/trip/hooks/useCanhotoBatchReview.hook')

const COMPANY_ID = 'company-1'
const TRIP_ID = 'trip-1'
const IDS = ['d1', 'd2', 'd3', 'd4', 'd5'] as const

const DOCUMENTS = IDS.map((id) => ({
  freightCalculationId: null,
  id,
  nfeDocumentId: null,
  nfeNumber: id.toUpperCase(),
  nfeSeries: '1',
  releasedAt: null,
}))

function makeProof(documentId: string, canhotoReview: 'approved' | 'pending'): TripDeliveryProof {
  return {
    canhotoReview,
    createdAt: '2026-09-30T10:00:00Z',
    documentId,
    downloadUrl: `https://storage.test/original/${documentId}`,
    expiresAt: '2026-09-30T10:05:00Z',
    id: `proof-${documentId}`,
    kind: 'photo',
    receiverName: '',
  }
}

function installProofs(proofs: () => readonly TripDeliveryProof[] | Error): {
  reads: () => number
} {
  let reads = 0
  fakes.tripClient = {
    ...fakes.tripClient,
    readTripDeliveryProofs: () => {
      reads += 1
      const next = proofs()
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
    },
  }
  return { reads: () => reads }
}

type ApproveCall = readonly string[]

async function renderReview(input: {
  readonly approve: (documentIds: readonly string[]) => Promise<CanhotoBatchApprovalResult>
  readonly canManage: boolean
}) {
  const rendered = await renderHook(() => {
    const selection = useTripDocumentSelection()
    const review = useCanhotoBatchReview({
      approveBatch: (body) => input.approve(body.documentIds),
      canManage: input.canManage,
      companyId: COMPANY_ID,
      documents: DOCUMENTS,
      selection,
      tripId: TRIP_ID,
      tripStatus: 'in_transit',
    })
    return { review, selection }
  })
  await act(async () => {
    rendered.result().selection.replace([...IDS])
    await Promise.resolve()
  })
  return rendered
}

describe('useCanhotoBatchReview (spec 222 T2.8)', () => {
  test('offers only the marked notes whose canhoto is pending', async () => {
    resetTripHookFakes([])
    installProofs(() => [
      makeProof('d1', 'pending'),
      makeProof('d2', 'pending'),
      makeProof('d3', 'approved'),
    ])
    const rendered = await renderReview({
      approve: () => Promise.resolve({ approved: [], conflicted: [], failed: [] }),
      canManage: true,
    })

    await waitFor(() => expect(rendered.result().review.batch.eligible).toHaveLength(2))
    expect(rendered.result().review.batch.excludedCount).toBe(3)
    rendered.unmount()
  })

  test('without trip.manage nothing is read and nothing is offered', async () => {
    resetTripHookFakes([])
    const client = installProofs(() => [makeProof('d1', 'pending')])
    const rendered = await renderReview({
      approve: () => Promise.resolve({ approved: [], conflicted: [], failed: [] }),
      canManage: false,
    })
    await settle()

    expect(client.reads()).toBe(0)
    expect(rendered.result().review.batch.eligible).toHaveLength(0)
    rendered.unmount()
  })

  test('opening re-reads the proofs and shows what the re-read found (RF-A9)', async () => {
    resetTripHookFakes([])
    let current: readonly TripDeliveryProof[] = [
      makeProof('d1', 'pending'),
      makeProof('d2', 'pending'),
    ]
    const client = installProofs(() => current)
    const rendered = await renderReview({
      approve: () => Promise.resolve({ approved: [], conflicted: [], failed: [] }),
      canManage: true,
    })
    await waitFor(() => expect(rendered.result().review.batch.eligible).toHaveLength(2))
    expect(client.reads()).toBe(1)

    current = [makeProof('d1', 'approved'), makeProof('d2', 'pending')]
    await act(async () => {
      await rendered.result().review.open()
    })
    await waitFor(() => expect(rendered.result().review.dialog.status).toBe('ready'))

    expect(client.reads()).toBe(2)
    expect(rendered.result().review.dialog.isOpen).toBe(true)
    expect(rendered.result().review.dialog.items.map((item) => item.documentId)).toEqual(['d2'])
    rendered.unmount()
  })

  test('while the re-read is pending the dialog shows no photo at all (the screen approves only what it showed)', async () => {
    resetTripHookFakes([])
    let release: (proofs: readonly TripDeliveryProof[]) => void = () => undefined
    let reads = 0
    fakes.tripClient = {
      ...fakes.tripClient,
      readTripDeliveryProofs: () => {
        reads += 1
        if (reads === 1) return Promise.resolve([makeProof('d1', 'pending')])
        return new Promise<readonly TripDeliveryProof[]>((resolve) => {
          release = resolve
        })
      },
    }
    const rendered = await renderReview({
      approve: () => Promise.resolve({ approved: [], conflicted: [], failed: [] }),
      canManage: true,
    })
    await waitFor(() => expect(rendered.result().review.batch.eligible).toHaveLength(1))

    let opening: Promise<void> = Promise.resolve()
    await act(async () => {
      opening = rendered.result().review.open()
      await Promise.resolve()
    })

    expect(rendered.result().review.dialog.status).toBe('loading')
    expect(rendered.result().review.dialog.items).toHaveLength(0)

    await act(async () => {
      release([makeProof('d1', 'pending')])
      await opening
    })
    expect(rendered.result().review.dialog.status).toBe('ready')
    expect(rendered.result().review.dialog.items).toHaveLength(1)
    rendered.unmount()
  })

  test('a failed re-read puts the dialog in the failed state', async () => {
    resetTripHookFakes([])
    let shouldFail = false
    installProofs(() => (shouldFail ? new Error('DOWN') : [makeProof('d1', 'pending')]))
    const rendered = await renderReview({
      approve: () => Promise.resolve({ approved: [], conflicted: [], failed: [] }),
      canManage: true,
    })
    await waitFor(() => expect(rendered.result().review.batch.eligible).toHaveLength(1))

    shouldFail = true
    await act(async () => {
      await rendered.result().review.open()
    })

    await waitFor(() => expect(rendered.result().review.dialog.status).toBe('failed'))
    expect(rendered.result().review.dialog.items).toHaveLength(0)
    rendered.unmount()
  })

  test('confirming unmarks approved and conflicted notes, keeps the failed one and reports 1 of 5 (CA07/CA08)', async () => {
    resetTripHookFakes([])
    installProofs(() => IDS.map((id) => makeProof(id, 'pending')))
    const calls: ApproveCall[] = []
    const rendered = await renderReview({
      approve: (documentIds) => {
        calls.push(documentIds)
        return Promise.resolve({
          approved: ['d1', 'd2', 'd3'],
          conflicted: ['d4'],
          failed: [{ documentId: 'd5', errorCode: 'NETWORK' }],
        })
      },
      canManage: true,
    })
    await waitFor(() => expect(rendered.result().review.batch.eligible).toHaveLength(5))
    await act(async () => {
      await rendered.result().review.open()
    })
    await waitFor(() => expect(rendered.result().review.dialog.status).toBe('ready'))

    await act(async () => {
      await rendered.result().review.confirm([...IDS])
    })

    expect(calls).toEqual([[...IDS]])
    expect([...rendered.result().selection.selectedIds]).toEqual(['d5'])
    expect(rendered.result().review.dialog.isOpen).toBe(false)
    expect(rendered.result().review.failure).toEqual({ failedCount: 1, totalCount: 5 })
    rendered.unmount()
  })

  test('a clean batch clears the marks and leaves no failure notice', async () => {
    resetTripHookFakes([])
    installProofs(() => IDS.map((id) => makeProof(id, 'pending')))
    const rendered = await renderReview({
      approve: (documentIds) =>
        Promise.resolve({ approved: documentIds, conflicted: [], failed: [] }),
      canManage: true,
    })
    await waitFor(() => expect(rendered.result().review.batch.eligible).toHaveLength(5))

    await act(async () => {
      await rendered.result().review.confirm([...IDS])
    })

    expect(rendered.result().selection.selectedIds.size).toBe(0)
    expect(rendered.result().review.failure).toBeNull()
    rendered.unmount()
  })
})
