/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T2.3: depois da troca de tripulação a linha do tempo da viagem é relida — o evento novo
 * ("Tripulação transferida") não pode esperar o próximo intervalo de repetição para aparecer.
 */
import { describe, expect, test } from 'bun:test'

import {
  TRIP_QUERY_KEY,
  TRIP_REPORT_ON_BEHALF_PERMISSION,
} from '@/modules/trip/shared/trip.constant'
import type { TripDetail } from '@/modules/trip/shared/trip.types'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook } from './renderHook.helper'

const { useTripWorkspace } = await import('@/modules/trip/hooks/useTripWorkspace.hook')
const { TRIP_TIMELINE_QUERY_KEY } = await import('@/modules/trip/hooks/useTripTimeline.hook')

const COMPANY_ID = 'company-1'
const TRIP_ID = 'trip-1'
const TIMELINE_KEY = [TRIP_QUERY_KEY, TRIP_ID, TRIP_TIMELINE_QUERY_KEY] as const

function installTransfer(): void {
  fakes.tripClient = {
    ...fakes.tripClient,
    transferTripCrew: () =>
      Promise.resolve({
        transfer: {
          costAfter: '860.00',
          costBefore: '360.00',
          costDifference: '500.00',
          costHasGaps: false,
          id: 'transfer-1',
          mdfeDriverDivergence: false,
        },
        trip: { id: TRIP_ID } as TripDetail,
      }),
  }
}

describe('transferCrewMutation relê a linha do tempo (spec 249 T2.3)', () => {
  test('invalida a linha do tempo da viagem', async () => {
    resetTripHookFakes([])
    installTransfer()
    const rendered = await renderHook(() =>
      useTripWorkspace({
        companyId: COMPANY_ID,
        permissions: [TRIP_REPORT_ON_BEHALF_PERMISSION],
        tripId: TRIP_ID,
      }),
    )
    rendered.queryClient.setQueryData(TIMELINE_KEY, { pages: [], pageParams: [] })

    await rendered.result().transferCrewMutation.mutateAsync({
      driverIds: ['driver-2'],
      helperIds: [],
      reason: 'Maria passou mal',
      tripId: TRIP_ID,
    })

    expect(rendered.queryClient.getQueryState(TIMELINE_KEY)?.isInvalidated).toBe(true)
    rendered.unmount()
  })

  test('continua invalidando as actions permitidas da viagem', async () => {
    resetTripHookFakes([])
    installTransfer()
    const rendered = await renderHook(() =>
      useTripWorkspace({
        companyId: COMPANY_ID,
        permissions: [TRIP_REPORT_ON_BEHALF_PERMISSION],
        tripId: TRIP_ID,
      }),
    )
    const actionsKey = [TRIP_QUERY_KEY, TRIP_ID, 'allowed-actions'] as const
    rendered.queryClient.setQueryData(actionsKey, { trip: [] })

    await rendered.result().transferCrewMutation.mutateAsync({
      driverIds: ['driver-2'],
      helperIds: [],
      reason: 'Maria passou mal',
      tripId: TRIP_ID,
    })

    expect(rendered.queryClient.getQueryState(actionsKey)?.isInvalidated).toBe(true)
    rendered.unmount()
  })
})
