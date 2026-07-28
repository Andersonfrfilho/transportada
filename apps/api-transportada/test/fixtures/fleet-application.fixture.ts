/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetDriver,
  FleetDriverRepositoryPort,
  FleetVehicle,
  FleetVehicleRepositoryPort,
} from '../../src/fleet/application/fleet.port'
import { COMPANY_ID, DRIVER, VEHICLE } from './fleet-http-payload.fixture'

export const FLEET_CONTEXT = { companyId: COMPANY_ID, userId: DRIVER.id } as const

type VehicleRepositoryParams = {
  readonly current?: FleetVehicle | null
  readonly updated?: FleetVehicle | null
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
