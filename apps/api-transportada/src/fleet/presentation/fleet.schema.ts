/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  hasFilter,
  optionalFilter,
  parseBody,
  parseContains,
  parseOption,
  readListQuery,
  readPaging,
} from '../../http/request-parsing.service.js'
import {
  FLEET_DRIVER_STATUSES,
  FLEET_VEHICLE_ROLES,
  FLEET_VEHICLE_STATUSES,
} from '../../database/fleet.schema.js'
import type { FleetDriverFilters, FleetVehicleFilters } from '../application/fleet.port.js'
import {
  createDriverSchema,
  createVehicleSchema,
  updateDriverSchema,
  updateVehicleSchema,
  type FleetDriverFields,
  type FleetVehicleFields,
} from './fleet-request.schema.js'

const DRIVER_QUERY_KEYS = new Set(['cursor', 'limit', 'nameContains', 'statusEq'])
const VEHICLE_QUERY_KEYS = new Set(['cursor', 'limit', 'plateContains', 'roleEq', 'statusEq'])

type Listing<TFilters> = {
  readonly cursor: string | null
  readonly filters?: TFilters
  readonly limit: number
}

export { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'

export type UpdateVehicleBody = FleetVehicleFields & {
  readonly expectedVersion: string
  readonly status: (typeof FLEET_VEHICLE_STATUSES)[number]
}

export type UpdateDriverBody = FleetDriverFields & {
  readonly expectedVersion: string
  readonly status: (typeof FLEET_DRIVER_STATUSES)[number]
}

export async function parseCreateVehicleRequest(request: Request): Promise<FleetVehicleFields> {
  return parseBody(createVehicleSchema, request)
}

export async function parseUpdateVehicleRequest(request: Request): Promise<UpdateVehicleBody> {
  return parseBody(updateVehicleSchema, request)
}

export async function parseCreateDriverRequest(request: Request): Promise<FleetDriverFields> {
  return parseBody(createDriverSchema, request)
}

export async function parseUpdateDriverRequest(request: Request): Promise<UpdateDriverBody> {
  return parseBody(updateDriverSchema, request)
}

export function parseVehicleList(url: URL): Listing<FleetVehicleFilters> {
  const parameters = readListQuery(url, VEHICLE_QUERY_KEYS)
  const filters: FleetVehicleFilters = {
    ...optionalFilter('plateContains', parseContains(parameters.get('plateContains'))),
    ...optionalFilter('roleEq', parseOption(parameters.get('roleEq'), FLEET_VEHICLE_ROLES)),
    ...optionalFilter('statusEq', parseOption(parameters.get('statusEq'), FLEET_VEHICLE_STATUSES)),
  }

  return { ...readPaging(parameters), ...(hasFilter(filters) ? { filters } : {}) }
}

export function parseDriverList(url: URL): Listing<FleetDriverFilters> {
  const parameters = readListQuery(url, DRIVER_QUERY_KEYS)
  const filters: FleetDriverFilters = {
    ...optionalFilter('nameContains', parseContains(parameters.get('nameContains'))),
    ...optionalFilter('statusEq', parseOption(parameters.get('statusEq'), FLEET_DRIVER_STATUSES)),
  }

  return { ...readPaging(parameters), ...(hasFilter(filters) ? { filters } : {}) }
}
