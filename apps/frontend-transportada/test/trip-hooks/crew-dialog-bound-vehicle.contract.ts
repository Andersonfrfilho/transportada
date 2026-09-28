/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Defeito relatado pelo usuário: no diálogo "Trocar motorista/veículo", escolher outro motorista
 * não trocava o veículo do agregado vinculado a ele — o campo ficava preso no veículo que a viagem
 * já tinha. Precisa de DOM porque o vínculo vem de `useQueries` (`useDriverVehicleBindings`), e o
 * que se prova é a corrida entre a consulta e a troca de seleção — a função pura
 * (`resolveBoundVehicleIds`) já está coberta em `test/trip/driver-bound-vehicles.contract.ts`.
 */
import { act } from 'react'
import { afterEach, describe, expect, test } from 'bun:test'

import type { FleetDriverVehicleLink } from '@/modules/fleet/shared/fleet.types'
import type { TripDetail } from '@/modules/trip/shared/trip.types'

import { renderHook, settle, waitFor, type RenderedHook } from './renderHook.helper'
import { resetTripHookFakes, tripHookFakes } from './tripClientMocks.helper'

const { useTripCrewDialog } = await import('@/modules/trip/hooks/useTripCrewDialog.hook')

const DRIVER_SOLO_ID = 'driver-solo'
const DRIVER_SOLO_VEHICLE_ID = 'vehicle-solo'
const DRIVER_NO_LINK_ID = 'driver-no-link'
const TRIP_VEHICLE_ID = 'vehicle-trip'

function link(
  input: Readonly<{ ownedByDriver: boolean; vehicleId: string }>,
): FleetDriverVehicleLink {
  return {
    assignedAt: '2026-01-01T00:00:00.000Z',
    id: `link-${input.vehicleId}`,
    ownedByDriver: input.ownedByDriver,
    vehicle: { id: input.vehicleId },
  } as unknown as FleetDriverVehicleLink
}

function buildTrip(
  input: Readonly<{ driverIds: readonly string[]; vehicleId: null | string }>,
): TripDetail {
  return {
    drivers: input.driverIds.map((driverId, index) => ({
      driverId,
      driverName: driverId,
      driverTaxId: null,
      position: index,
    })),
    id: 'trip-1',
    vehicleId: input.vehicleId,
  } as unknown as TripDetail
}

describe('useTripCrewDialog — o veículo do agregado acompanha a troca de motorista', () => {
  let hook: RenderedHook<ReturnType<typeof useTripCrewDialog>> | undefined

  afterEach(() => {
    hook?.unmount()
    hook = undefined
  })

  test('escolher um motorista com um único veículo vinculado troca o veículo do diálogo', async () => {
    resetTripHookFakes([])
    tripHookFakes.driverVehicleLinksByDriverId = {
      [DRIVER_SOLO_ID]: [link({ ownedByDriver: true, vehicleId: DRIVER_SOLO_VEHICLE_ID })],
    }

    const trip = buildTrip({ driverIds: [], vehicleId: TRIP_VEHICLE_ID })
    hook = await renderHook(() =>
      useTripCrewDialog({
        isOpen: true,
        onSubmit: () => Promise.resolve(),
        selectableDriverIds: [DRIVER_SOLO_ID, DRIVER_NO_LINK_ID],
        selectableVehicleIds: [DRIVER_SOLO_VEHICLE_ID, TRIP_VEHICLE_ID],
        trip,
      }),
    )

    expect(hook.result().vehicleId).toBe(TRIP_VEHICLE_ID)

    await act(async () => {
      hook?.result().setDriverIds([DRIVER_SOLO_ID])
      await Promise.resolve()
    })

    await waitFor(() => expect(hook?.result().vehicleId).toBe(DRIVER_SOLO_VEHICLE_ID))
  })

  test('motorista sem vínculo inequívoco não mexe no veículo já escolhido', async () => {
    resetTripHookFakes([])
    tripHookFakes.driverVehicleLinksByDriverId = { [DRIVER_NO_LINK_ID]: [] }

    const trip = buildTrip({ driverIds: [], vehicleId: TRIP_VEHICLE_ID })
    hook = await renderHook(() =>
      useTripCrewDialog({
        isOpen: true,
        onSubmit: () => Promise.resolve(),
        selectableDriverIds: [DRIVER_NO_LINK_ID],
        selectableVehicleIds: [TRIP_VEHICLE_ID],
        trip,
      }),
    )

    await act(async () => {
      hook?.result().setDriverIds([DRIVER_NO_LINK_ID])
      await Promise.resolve()
    })
    await waitFor(() => expect(hook?.result().driverIds).toEqual([DRIVER_NO_LINK_ID]))
    await settle()
    await settle()

    expect(hook.result().vehicleId).toBe(TRIP_VEHICLE_ID)
  })

  test('reabrir o diálogo com o par atual da viagem não pisa nele com a sugestão do vínculo', async () => {
    resetTripHookFakes([])
    tripHookFakes.driverVehicleLinksByDriverId = {
      [DRIVER_SOLO_ID]: [link({ ownedByDriver: true, vehicleId: DRIVER_SOLO_VEHICLE_ID })],
    }

    /** A viagem já leva o dono de `DRIVER_SOLO_VEHICLE_ID`, mas com outro veículo escolhido. */
    const trip = buildTrip({ driverIds: [DRIVER_SOLO_ID], vehicleId: TRIP_VEHICLE_ID })
    hook = await renderHook(() =>
      useTripCrewDialog({
        isOpen: true,
        onSubmit: () => Promise.resolve(),
        selectableDriverIds: [DRIVER_SOLO_ID],
        selectableVehicleIds: [DRIVER_SOLO_VEHICLE_ID, TRIP_VEHICLE_ID],
        trip,
      }),
    )

    await waitFor(() => expect(hook?.result().driverIds).toEqual([DRIVER_SOLO_ID]))
    await settle()
    await settle()

    expect(hook.result().vehicleId).toBe(TRIP_VEHICLE_ID)
  })
})
