/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T2.1: o estado do diálogo "Transferir tripulação". O hook é o que decide se o botão
 * confirma — motivo vazio desabilita, tripulação igual à atual desabilita — e o que fica na tela
 * depois da troca (o resumo de custo), por isso precisa de DOM.
 */
import { act } from 'react'
import { afterEach, describe, expect, test } from 'bun:test'

import type { FleetDriverListItem } from '@/modules/fleet/shared/fleet.types'
import type { TripDetail } from '@/modules/trip/shared/trip.types'

import { renderHook, waitFor, type RenderedHook } from './renderHook.helper'

type TransferResult = Readonly<{
  transfer: Readonly<{
    costAfter: string
    costBefore: string
    costDifference: string
    costHasGaps: boolean
    id: string
    mdfeDriverDivergence: boolean
  }>
  trip: TripDetail
}>

type TransferSubmitInput = Readonly<{
  driverIds: readonly string[]
  helperIds: readonly string[]
  reason: string
}>

type TransferDialog = Readonly<{
  canSubmit: boolean
  driverIds: readonly string[]
  errorKey: string | undefined
  helperIds: readonly string[]
  outcome: unknown
  reason: string
  setDriverIds: (driverIds: readonly string[]) => void
  setReason: (reason: string) => void
  submit: () => Promise<boolean>
}>

type DialogInput = Readonly<{
  drivers: readonly FleetDriverListItem[]
  isOpen: boolean
  onSubmit: (input: TransferSubmitInput) => Promise<TransferResult>
  trip: TripDetail
}>

const HOOK_PATH = '@/modules/trip/hooks/useTripCrewTransferDialog.hook'

async function loadHook(): Promise<(input: DialogInput) => TransferDialog> {
  const module = (await import(HOOK_PATH)) as {
    useTripCrewTransferDialog: (input: DialogInput) => TransferDialog
  }
  return module.useTripCrewTransferDialog
}

function fleetDriver(input: Readonly<{ id: string; name: string }>): FleetDriverListItem {
  return {
    canActAsHelper: true,
    canDrive: true,
    id: input.id,
    name: input.name,
    status: 'active',
  } as unknown as FleetDriverListItem
}

const TRIP = {
  drivers: [
    { driverId: 'driver-1', driverName: 'Maria', driverTaxId: null, position: 1, role: 'driver' },
    { driverId: 'helper-1', driverName: 'Ana', driverTaxId: null, position: 2, role: 'helper' },
  ],
  id: 'trip-1',
  vehicleId: 'vehicle-1',
} as unknown as TripDetail

const FLEET = [
  fleetDriver({ id: 'driver-1', name: 'Maria' }),
  fleetDriver({ id: 'driver-2', name: 'João' }),
  fleetDriver({ id: 'helper-1', name: 'Ana' }),
]

const RESULT: TransferResult = {
  transfer: {
    costAfter: '1350.00',
    costBefore: '1200.00',
    costDifference: '150.00',
    costHasGaps: false,
    id: 'transfer-1',
    mdfeDriverDivergence: true,
  },
  trip: TRIP,
}

describe('useTripCrewTransferDialog (spec 249 T2.1)', () => {
  let hook: RenderedHook<TransferDialog> | undefined

  afterEach(() => {
    hook?.unmount()
    hook = undefined
  })

  async function open(
    onSubmit: DialogInput['onSubmit'] = () => Promise.resolve(RESULT),
  ): Promise<RenderedHook<TransferDialog>> {
    const useTripCrewTransferDialog = await loadHook()
    hook = await renderHook(() =>
      useTripCrewTransferDialog({ drivers: FLEET, isOpen: true, onSubmit, trip: TRIP }),
    )
    return hook
  }

  test('abre com a tripulação atual e sem confirmar: nada mudou e não há motivo', async () => {
    const dialog = await open()

    await waitFor(() => expect(dialog.result().driverIds).toEqual(['driver-1']))
    expect(dialog.result().helperIds).toEqual(['helper-1'])
    expect(dialog.result().reason).toBe('')
    expect(dialog.result().canSubmit).toBe(false)
  })

  test('motivo vazio desabilita mesmo com a tripulação trocada; o motivo habilita', async () => {
    const dialog = await open()
    await waitFor(() => expect(dialog.result().driverIds).toEqual(['driver-1']))

    await act(async () => {
      dialog.result().setDriverIds(['driver-2'])
      await Promise.resolve()
    })
    expect(dialog.result().canSubmit).toBe(false)

    await act(async () => {
      dialog.result().setReason('   ')
      await Promise.resolve()
    })
    expect(dialog.result().canSubmit).toBe(false)

    await act(async () => {
      dialog.result().setReason('Motorista passou mal')
      await Promise.resolve()
    })
    expect(dialog.result().canSubmit).toBe(true)
  })

  test('confirma com o motivo aparado e guarda o resumo para a tela', async () => {
    const received: TransferSubmitInput[] = []
    const dialog = await open((input) => {
      received.push(input)
      return Promise.resolve(RESULT)
    })
    await waitFor(() => expect(dialog.result().driverIds).toEqual(['driver-1']))

    await act(async () => {
      dialog.result().setDriverIds(['driver-2'])
      dialog.result().setReason('  Motorista passou mal  ')
      await Promise.resolve()
    })
    let succeeded = false
    await act(async () => {
      succeeded = await dialog.result().submit()
    })

    expect(succeeded).toBe(true)
    expect(received).toEqual([
      { driverIds: ['driver-2'], helperIds: ['helper-1'], reason: 'Motorista passou mal' },
    ])
    expect(dialog.result().outcome).toEqual(
      expect.objectContaining({ direction: 'increase', hasMdfeDivergence: true }),
    )
    expect(dialog.result().errorKey).toBeUndefined()
  })

  test('recusa da API vira mensagem pelo código e não deixa resumo', async () => {
    const dialog = await open(() => Promise.reject(new Error('TRIP_CREW_UNCHANGED')))
    await waitFor(() => expect(dialog.result().driverIds).toEqual(['driver-1']))

    await act(async () => {
      dialog.result().setDriverIds(['driver-2'])
      dialog.result().setReason('Motorista passou mal')
      await Promise.resolve()
    })
    let succeeded = true
    await act(async () => {
      succeeded = await dialog.result().submit()
    })

    expect(succeeded).toBe(false)
    expect(dialog.result().errorKey).toBe('unchanged')
    expect(dialog.result().outcome).toBeUndefined()
  })
})
