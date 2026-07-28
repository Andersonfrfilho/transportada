/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DRIVER_BODY,
  DRIVER_DETAIL,
  DRIVER_ID,
  DRIVER_PAGE,
  EMPTY_DRIVER_PAGE,
  EMPTY_VEHICLE_PAGE,
  FLEET_MANAGE,
  FLEET_READ,
  loadFutureModule,
  VEHICLE_BODY,
  VEHICLE_DETAIL,
  VEHICLE_ID,
  VEHICLE_PAGE,
} from './fleet.fixture'

describe('fleet permissions and states contract', () => {
  test('exposes fleet mutations only to fleet.manage and reads only to fleet.read', async () => {
    const { createFleetController } = await loadFutureModule<FleetHookModule>(
      '../../src/modules/fleet/hooks/useFleet.hook',
    )
    const client = createMutationRecordingClient()

    const blindController = createFleetController({ client, permissions: [] })
    expect(blindController.canReadFleet).toBe(false)
    expect(blindController.canManageFleet).toBe(false)
    expect(
      await blindController
        .listVehicles({ cursor: null, limit: 25 })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_FORBIDDEN' }))

    const readOnlyController = createFleetController({ client, permissions: [FLEET_READ] })
    expect(readOnlyController.canReadFleet).toBe(true)
    expect(readOnlyController.canManageFleet).toBe(false)
    expect(await readOnlyController.listVehicles({ cursor: null, limit: 25 })).toEqual(VEHICLE_PAGE)
    expect(await readOnlyController.listDrivers({ cursor: null, limit: 25 })).toEqual(DRIVER_PAGE)
    expect(
      await readOnlyController.createVehicle(VEHICLE_BODY).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_FORBIDDEN' }))
    expect(
      await readOnlyController
        .updateVehicle({
          ...VEHICLE_BODY,
          expectedVersion: '1',
          status: 'inactive',
          vehicleId: VEHICLE_ID,
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_FORBIDDEN' }))
    expect(
      await readOnlyController.createDriver(DRIVER_BODY).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_FORBIDDEN' }))
    expect(
      await readOnlyController
        .updateDriver({
          ...DRIVER_BODY,
          driverId: DRIVER_ID,
          expectedVersion: '1',
          status: 'inactive',
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_FORBIDDEN' }))
    expect(client.mutationCount).toBe(0)

    const controller = createFleetController({
      client,
      permissions: [FLEET_READ, FLEET_MANAGE],
    })
    expect(controller.canManageFleet).toBe(true)
    await controller.createVehicle(VEHICLE_BODY)
    await controller.createDriver(DRIVER_BODY)
    expect(client.mutationCount).toBe(2)
  })

  test('maps forbidden, empty, ready and error states without leaking tenant fields', async () => {
    const { createFleetViewModel } = await loadFutureModule<FleetViewModelModule>(
      '../../src/modules/fleet/shared/fleetViewModel.service',
    )

    expect(
      createFleetViewModel({
        drivers: DRIVER_PAGE,
        permissions: [],
        status: 'success',
        vehicles: VEHICLE_PAGE,
      }),
    ).toEqual({ canManageFleet: false, canReadFleet: false, status: 'forbidden' })

    expect(
      createFleetViewModel({
        drivers: EMPTY_DRIVER_PAGE,
        permissions: [FLEET_READ],
        status: 'success',
        vehicles: EMPTY_VEHICLE_PAGE,
      }),
    ).toEqual({ canManageFleet: false, canReadFleet: true, status: 'empty' })

    const readyViewModel = createFleetViewModel({
      drivers: DRIVER_PAGE,
      permissions: [FLEET_READ, FLEET_MANAGE],
      status: 'success',
      vehicles: VEHICLE_PAGE,
    })
    expect(readyViewModel.status).toBe('ready')
    expect(readyViewModel.canManageFleet).toBe(true)
    expect(readyViewModel.vehicles).toEqual([VEHICLE_DETAIL])
    expect(readyViewModel.drivers).toEqual([DRIVER_DETAIL])
    expect(JSON.stringify(readyViewModel)).not.toContain('companyId')

    expect(createFleetViewModel({ permissions: [FLEET_READ], status: 'error' })).toEqual({
      canManageFleet: false,
      canReadFleet: true,
      status: 'error',
    })
    expect(createFleetViewModel({ permissions: [FLEET_READ], status: 'loading' })).toEqual({
      canManageFleet: false,
      canReadFleet: true,
      status: 'loading',
    })
  })
})

function createMutationRecordingClient(): FleetClient & { readonly mutationCount: number } {
  let mutationCount = 0
  const recordVehicleMutation = (): Promise<unknown> => {
    mutationCount += 1
    return Promise.resolve(VEHICLE_DETAIL)
  }
  const recordDriverMutation = (): Promise<unknown> => {
    mutationCount += 1
    return Promise.resolve(DRIVER_DETAIL)
  }

  return {
    createDriver: recordDriverMutation,
    createVehicle: recordVehicleMutation,
    listDrivers: () => Promise.resolve(DRIVER_PAGE),
    listVehicles: () => Promise.resolve(VEHICLE_PAGE),
    get mutationCount(): number {
      return mutationCount
    },
    updateDriver: recordDriverMutation,
    updateVehicle: recordVehicleMutation,
  }
}

type ListInput = Readonly<{ cursor: null | string; limit: number }>
type VehicleVersionInput = Readonly<{
  expectedVersion: string
  status: 'active' | 'inactive'
  vehicleId: string
}>
type DriverVersionInput = Readonly<{
  driverId: string
  expectedVersion: string
  status: 'active' | 'inactive'
}>

type FleetClient = {
  createDriver(input: typeof DRIVER_BODY): Promise<unknown>
  createVehicle(input: typeof VEHICLE_BODY): Promise<unknown>
  listDrivers(input: ListInput): Promise<unknown>
  listVehicles(input: ListInput): Promise<unknown>
  updateDriver(input: typeof DRIVER_BODY & DriverVersionInput): Promise<unknown>
  updateVehicle(input: typeof VEHICLE_BODY & VehicleVersionInput): Promise<unknown>
}

type FleetHookModule = {
  readonly createFleetController: (input: {
    readonly client: FleetClient
    readonly permissions: readonly string[]
  }) => {
    readonly canManageFleet: boolean
    readonly canReadFleet: boolean
    readonly createDriver: (input: typeof DRIVER_BODY) => Promise<unknown>
    readonly createVehicle: (input: typeof VEHICLE_BODY) => Promise<unknown>
    readonly listDrivers: (input: ListInput) => Promise<unknown>
    readonly listVehicles: (input: ListInput) => Promise<unknown>
    readonly updateDriver: (input: typeof DRIVER_BODY & DriverVersionInput) => Promise<unknown>
    readonly updateVehicle: (input: typeof VEHICLE_BODY & VehicleVersionInput) => Promise<unknown>
  }
}

type FleetViewModelModule = {
  readonly createFleetViewModel: (input: {
    readonly drivers?: unknown
    readonly permissions: readonly string[]
    readonly status: 'error' | 'loading' | 'success'
    readonly vehicles?: unknown
  }) => {
    readonly canManageFleet: boolean
    readonly canReadFleet: boolean
    readonly drivers?: unknown
    readonly status: 'empty' | 'error' | 'forbidden' | 'loading' | 'ready'
    readonly vehicles?: unknown
  }
}
