/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetDriver,
  FleetDriverRepositoryPort,
  FleetDriverVehicleRepositoryPort,
  FleetVehicle,
  FleetVehicleRepositoryPort,
} from '../../src/fleet/application/fleet.port'
import { COMPANY_ID, DRIVER, DRIVER_VEHICLE_LINKS, VEHICLE } from './fleet-http-payload.fixture'

export const FLEET_CONTEXT = { companyId: COMPANY_ID, userId: DRIVER.id } as const

type VehicleRepositoryParams = {
  readonly current?: FleetVehicle | null
  readonly updated?: FleetVehicle | null
}

type DriverVehicleRepositoryParams = {
  readonly existingVehicleIds?: readonly string[]
}

type DriverRepositoryParams = {
  readonly current?: FleetDriver | null
  readonly membershipBelongs?: boolean
  readonly updated?: FleetDriver | null
}

export function createVehicleRepositoryStub(params: VehicleRepositoryParams = {}): {
  readonly createCalls: unknown[]
  readonly listCalls: unknown[]
  readonly repository: FleetVehicleRepositoryPort
  readonly updateCalls: unknown[]
} {
  const createCalls: unknown[] = []
  const listCalls: unknown[] = []
  const updateCalls: unknown[] = []

  return {
    createCalls,
    listCalls,
    repository: {
      async create(input) {
        createCalls.push(structuredClone(input))
        return VEHICLE
      },
      async findById() {
        return params.current === undefined ? VEHICLE : params.current
      },
      async list(input) {
        listCalls.push(structuredClone(input))
        return { items: [VEHICLE], nextCursor: null }
      },
      async update(input) {
        updateCalls.push(structuredClone(input))
        return params.updated === undefined ? { ...VEHICLE, version: '2' } : params.updated
      },
    },
    updateCalls,
  }
}

export function createDriverVehicleRepositoryStub(params: DriverVehicleRepositoryParams = {}): {
  readonly listCalls: unknown[]
  readonly repository: FleetDriverVehicleRepositoryPort
  readonly replaceCalls: unknown[]
  readonly vehicleLookupCalls: unknown[]
} {
  const listCalls: unknown[] = []
  const replaceCalls: unknown[] = []
  const vehicleLookupCalls: unknown[] = []

  return {
    listCalls,
    repository: {
      async listByDriver(input) {
        listCalls.push(structuredClone(input))
        return DRIVER_VEHICLE_LINKS
      },
      async listExistingVehicleIds(input) {
        vehicleLookupCalls.push(structuredClone(input))
        return params.existingVehicleIds ?? input.vehicleIds
      },
      async replaceForDriver(input) {
        replaceCalls.push(structuredClone(input))
        return DRIVER_VEHICLE_LINKS
      },
    },
    replaceCalls,
    vehicleLookupCalls,
  }
}

export function createDriverRepositoryStub(params: DriverRepositoryParams = {}): {
  readonly createCalls: unknown[]
  readonly membershipCalls: unknown[]
  readonly repository: FleetDriverRepositoryPort
  readonly updateCalls: unknown[]
} {
  const createCalls: unknown[] = []
  const membershipCalls: unknown[] = []
  const updateCalls: unknown[] = []

  return {
    createCalls,
    membershipCalls,
    repository: {
      async create(input) {
        createCalls.push(structuredClone(input))
        return DRIVER
      },
      async findById() {
        return params.current === undefined ? DRIVER : params.current
      },
      async hasMembership(input) {
        membershipCalls.push(structuredClone(input))
        return params.membershipBelongs ?? true
      },
      async list() {
        return { items: [DRIVER], nextCursor: null }
      },
      async update(input) {
        updateCalls.push(structuredClone(input))
        return params.updated === undefined ? { ...DRIVER, version: '2' } : params.updated
      },
    },
    updateCalls,
  }
}
